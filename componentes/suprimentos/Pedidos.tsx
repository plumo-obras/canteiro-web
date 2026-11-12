"use client";
/**
 * Pedidos de Compras: na tela são dois estados, "Pedido feito" e "Chegou", sem o quadro de cinco colunas. Os status do
 * domínio continuam (quem valida a transição é a API); `estadoDoPedido` diz como cada um aparece. "Chegou" é um toque:
 * registra a entrega do que falta em cada linha, com Desfazer. Entrega pela metade e NF ficam no "⋯" e no detalhe.
 */
import { useRef, useState } from "react";
import type { EtapaObra, Fornecedor, ItemInsumo, Obra, Pedido, StatusPedido } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtPrevisao, fmtQtd, fmtQtdUn, fmtReais } from "@/lib/formato";
import { uuid7 } from "@/lib/ids";
import { mensagemDe, useCasca } from "../contexto";
import { Icone } from "../Icone";
import { MenuMais } from "../MenuMais";
import { BotaoMais, useMaisAntigos } from "../Paginacao";
import { ConfirmarEncerrar, DetalhePedido, ModalRecebimento } from "./DetalhePedido";
import s from "./compras.module.css";

const ENCERRADOS = 20;
const fDiaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
/** "2026-11-06" → "06/11". */
const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** O que ainda está em jogo; `recebido` é o status antigo (chegou, falta conferir), que só a demonstração tem. */
export const ABERTOS: StatusPedido[] = ["em_cotacao", "aprovado", "enviado", "em_transito", "parcial", "recebido"];
export type AcaoPedido =
  | { tipo: "chegou"; rotulo: string }
  | { tipo: "avancar"; para: StatusPedido; rotulo: string; feito: string }
  | { tipo: "entrega"; rotulo: string }
  | { tipo: "encerrar"; rotulo: string };

/** As ações que a tela oferece a partir de cada status: a primeira fica à vista, as outras vão para o "⋯". */
export function acoesDe(p: Pedido): AcaoPedido[] {
  const cancelar: AcaoPedido = { tipo: "avancar", para: "cancelado", rotulo: "Cancelar pedido", feito: `${p.numero} cancelado.` };
  const parte: AcaoPedido = { tipo: "entrega", rotulo: "Chegou só uma parte ou com NF" };
  const chegou: AcaoPedido = { tipo: "chegou", rotulo: "Chegou" };
  switch (p.status) {
    case "em_cotacao":
      return [{ tipo: "avancar", para: "aprovado", rotulo: `Aprovar ${fmtReais(p.valor)}`, feito: `${p.numero} aprovado.` }, cancelar];
    case "aprovado":
    case "enviado":
      return [chegou, parte, cancelar];
    case "em_transito":
      return [chegou, parte];
    case "parcial":
      return [{ tipo: "chegou", rotulo: "Chegou o resto" }, parte, { tipo: "encerrar", rotulo: "O resto não vem" }];
    case "recebido":
      return [chegou];
    default:
      return [];
  }
}

export interface EstadoPedido {
  grupo: "feito" | "chegou" | "cancelado";
  texto: string;
  tom: "info" | "ok" | "warn" | "";
}

/** Como cada status do domínio aparece: a pessoa só lida com "Pedido feito" e "Chegou". */
export function estadoDoPedido(p: Pedido): EstadoPedido {
  if (p.status === "cancelado") return { grupo: "cancelado", texto: "Cancelado", tom: "" };
  if (p.status === "conferido") {
    const pago = p.valor > 0 && (p.pago ?? 0) >= p.valor;
    const veioTudo = p.linhas.every((l) => l.recebida >= l.quantidade);
    return { grupo: "chegou", texto: `${veioTudo ? "Chegou" : "Chegou em parte"}${p.recebido_em ? ` ${diaMes(p.recebido_em)}` : ""}${pago ? " · pago" : ""}`, tom: "ok" };
  }
  if (p.status === "em_cotacao") return { grupo: "feito", texto: "Pedido feito · falta aprovar", tom: "warn" };
  if (p.status === "parcial") return { grupo: "feito", texto: `Pedido feito · ${progressoParcial(p)}`, tom: "warn" };
  return { grupo: "feito", texto: p.previsao ? `Pedido feito · ${fmtPrevisao(p.previsao)}` : "Pedido feito", tom: "info" };
}

/** A entrega do que falta em cada linha: é o que "Chegou" grava. */
export const linhasDaChegada = (p: Pedido) => p.linhas.flatMap((l, indice) => (l.falta_entregar > 0 ? [{ indice, quantidade: l.falta_entregar }] : []));

/**
 * Registra o "Chegou". A chave só muda depois de gravar (ou se o que falta mudar): com a resposta perdida, tocar de
 * novo não dá entrada duas vezes no almoxarifado. O erro relê a lista para mostrar o que realmente valeu.
 */
export function useChegou(p: Pedido, depois?: (atualizado: Pedido) => void) {
  const { avisar, avisarFeito, mudou } = useCasca();
  const [ocupado, setOcupado] = useState(false);
  const chave = useRef<{ conteudo: string; valor: string } | null>(null);
  const registrar = async () => {
    const linhas = linhasDaChegada(p);
    const conteudo = JSON.stringify(linhas);
    if (chave.current?.conteudo !== conteudo) chave.current = { conteudo, valor: uuid7() };
    setOcupado(true);
    try {
      const r = await api.registrarRecebimento(p.id, { linhas, chave_idempotencia: chave.current.valor });
      chave.current = null;
      depois?.(r.pedido);
      mudou();
      avisarFeito(p.linhas.every((l) => l.tipo === "servico") ? `${p.numero} entregue.` : `${p.numero} chegou.`, r.registro_id);
    } catch (e) {
      mudou();
      avisar(mensagemDe(e), true);
    } finally {
      setOcupado(false);
    }
  };
  return { ocupado, registrar };
}

/** "Cimento CP-II · 40 sc" e "+ 3 itens": o que cabe numa linha da lista. */
export function resumoLinhas(p: Pedido): { primeira: string; mais: number } {
  const l = p.linhas[0];
  return { primeira: l ? `${l.nome} · ${fmtQtdUn(l.quantidade, l.unidade)}` : "sem linhas", mais: Math.max(0, p.linhas.length - 1) };
}

/**
 * Progresso do parcial pela quantidade, não pela linha inteira: "18 de 25 m³" no pedido de uma linha; com várias,
 * "2 de 3 itens completos, 1 parcial". Contar só linhas completas dizia "chegou 0 de 1" com 18 m³ na obra.
 */
export function progressoParcial(p: Pedido): string {
  if (p.linhas.length === 1) {
    const l = p.linhas[0]!;
    return `chegou ${fmtQtd(l.recebida)} de ${fmtQtdUn(l.quantidade, l.unidade)}`;
  }
  const completas = p.linhas.filter((l) => l.recebida >= l.quantidade).length;
  const parciais = p.linhas.filter((l) => l.recebida > 0 && l.recebida < l.quantidade).length;
  return `${completas} de ${p.linhas.length} itens completos${parciais ? `, ${parciais} ${parciais === 1 ? "parcial" : "parciais"}` : ""}`;
}

/** O que ainda falta entregar, em reais: falta × unitário de cada linha (o já recebido não está mais "em aberto"). */
export const valorAReceber = (p: Pedido) =>
  p.linhas.reduce((t, l) => t + Math.round((l.falta_entregar * l.valor_unitario) / 1000), 0);

interface Contexto {
  obra: Obra;
  itens: ItemInsumo[];
  etapas: EtapaObra[];
  fornecedores: Fornecedor[];
}

function LinhaDoPedido({ p, etapas, abrir }: { p: Pedido; etapas: EtapaObra[]; abrir: () => void }) {
  const { podeOperar, avisar, avisarFeito, mudou } = useCasca();
  const [avancando, setAvancando] = useState(false);
  const [detalhe, setDetalhe] = useState<"entrega" | "encerrar" | null>(null);
  const chegada = useChegou(p);
  const acoes = podeOperar ? acoesDe(p) : [];
  const [pri, ...resto] = acoes;
  const r = resumoLinhas(p);
  const est = estadoDoPedido(p);
  const ocupado = avancando || chegada.ocupado;
  const chavesEtapa = [...new Set(p.linhas.map((l) => l.etapa))];
  const etapa = chavesEtapa.length === 1 && chavesEtapa[0] ? etapas.find((e) => e.etapa === chavesEtapa[0])?.descricao : undefined;

  const executar = async (a: AcaoPedido) => {
    if (a.tipo === "chegou") return chegada.registrar();
    if (a.tipo !== "avancar") return setDetalhe(a.tipo);
    setAvancando(true);
    try {
      const x = await api.avancarPedido(p.id, a.para);
      mudou();
      avisarFeito(a.feito, x.registro_id);
    } catch (e) {
      avisar(mensagemDe(e), true);
    } finally {
      setAvancando(false);
    }
  };

  // Aprovar é a decisão que espera alguém: vai em ocre. Chegou e o resto são registro do que já aconteceu.
  const destaque = pri?.tipo === "avancar" && pri.para === "aprovado";
  return (
    <li className={`card ${s.ped}`}>
      <div className={s.pedTopo}>
        <button type="button" className={s.pedAbrir} onClick={abrir}>
          {r.primeira}
          {r.mais ? ` + ${r.mais} ${r.mais === 1 ? "item" : "itens"}` : ""}
        </button>
        <span className={`pill ${est.tom}`}>{est.texto}</span>
      </div>
      <span className={s.pedMeta}>
        {p.numero} · <span className={s.pedForn}>{p.fornecedor}</span> · <span className="num">{fmtReais(p.valor)}</span>
      </span>
      <span className={s.pedMeta}>{[etapa, `pedido em ${fDiaMes.format(new Date(p.criado_em))}`].filter(Boolean).join(" · ")}</span>
      {pri || resto.length ? (
        <div className={s.pedAcoes}>
          {pri ? (
            <button type="button" className={`btn sm${destaque ? " amb" : ""}`} disabled={ocupado} aria-busy={ocupado} aria-label={`${pri.rotulo}: ${p.numero}`} onClick={() => executar(pri)}>
              {ocupado ? <Icone nome="loader" className="spin" tam={14} /> : null}
              {pri.rotulo}
            </button>
          ) : null}
          {resto.length ? <MenuMais rotulo={`Mais ações do ${p.numero}`} itens={resto.map((a) => ({ rotulo: a.rotulo, acao: () => void executar(a) }))} /> : null}
        </div>
      ) : null}
      {detalhe === "entrega" ? <ModalRecebimento pedido={p} fechar={() => setDetalhe(null)} /> : null}
      {detalhe === "encerrar" ? <ConfirmarEncerrar pedido={p} fechar={() => setDetalhe(null)} /> : null}
    </li>
  );
}

/** Seção Pedidos: o que ainda vai chegar e, embaixo, o que já chegou, de 20 em 20 (cursor `antes_de`). */
export function ListaPedidos(props: Contexto & { pedidos: Pedido[] }) {
  const { pedidos, ...ctx } = props;
  const { versao } = useCasca();
  const [aberto, setAberto] = useState<Pedido | null>(null);
  const chegaram = useMaisAntigos((antes) => api.listarPedidos(ctx.obra.id, { status: "conferido", limite: ENCERRADOS, antes_de: antes }), ENCERRADOS, [ctx.obra.id, versao]);
  const cancelados = useMaisAntigos((antes) => api.listarPedidos(ctx.obra.id, { status: "cancelado", limite: ENCERRADOS, antes_de: antes }), ENCERRADOS, [ctx.obra.id, versao]);
  // O pedido aberto acompanha a lista recarregada; já encerrado, vale a versão que a própria escrita devolveu.
  const atual = aberto ? ([...pedidos, ...(chegaram.itens ?? [])].find((p) => p.id === aberto.id) ?? aberto) : null;
  const lista = [...pedidos, ...(chegaram.itens ?? [])];
  const linha = (p: Pedido) => <LinhaDoPedido key={p.id} p={p} etapas={ctx.etapas} abrir={() => setAberto(p)} />;
  return (
    <section className={s.colPedidos} aria-labelledby="pedidos-titulo">
      <div className={s.cabBloco}>
        <h2 id="pedidos-titulo" className={s.titulo}>
          Pedidos
        </h2>
        {pedidos.length ? <span className={s.meta}>{pedidos.length === 1 ? "1 em aberto" : `${pedidos.length.toLocaleString("pt-BR")} em aberto`}</span> : null}
      </div>
      {lista.length ? <ul className={s.pedidos}>{lista.map(linha)}</ul> : <p className={`card mut ${s.vazioPed}`}>Nenhum pedido ainda. Marque o que vai comprar e faça o pedido.</p>}
      {!chegaram.acabou && chegaram.itens?.length ? <BotaoMais acabou={chegaram.acabou} buscando={chegaram.buscando} carregarMais={chegaram.carregarMais} rotulo="Mostrar mais antigos" /> : null}
      {cancelados.itens?.length ? (
        <details className={`cobertos ${s.cancelados}`}>
          <summary>
            <Icone nome="chevRight" tam={14} />
            Cancelados ({cancelados.itens.length}
            {cancelados.acabou ? "" : "+"})
          </summary>
          <ul className={s.pedidos}>{cancelados.itens.map(linha)}</ul>
          <BotaoMais acabou={cancelados.acabou} buscando={cancelados.buscando} carregarMais={cancelados.carregarMais} rotulo="Mostrar mais antigos" />
        </details>
      ) : null}
      {atual ? <DetalhePedido pedido={atual} {...ctx} fechar={() => setAberto(null)} atualizar={setAberto} /> : null}
    </section>
  );
}
