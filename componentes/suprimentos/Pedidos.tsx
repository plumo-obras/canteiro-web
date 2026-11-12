"use client";
/**
 * Pedidos de Compras: na tela são dois estados, "Pedido feito" e "Chegou", sem o quadro de cinco colunas. Os status do
 * domínio continuam (quem valida a transição é a API); `estadoDoPedido` diz como cada um aparece. "Chegou" é um toque:
 * registra a entrega do que falta em cada linha, com Desfazer. Entrega pela metade e NF ficam no "⋯" e no detalhe.
 */
import { useRef, useState, type ReactNode } from "react";
import { AVISO_PREVIA } from "@/lib/simulado/compras";
import type { EtapaObra, Fornecedor, ItemInsumo, Obra, Pedido, StatusPedido } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtPrevisao, fmtQtd, fmtQtdUn, fmtReais } from "@/lib/formato";
import { uuid7 } from "@/lib/ids";
import { mensagemDe, useCasca } from "../contexto";
import { Confirmar } from "../Dialogo";
import { Icone } from "../Icone";
import { useCelular } from "../midia";
import { BotaoMais, useMaisAntigos } from "../Paginacao";
import { reaisInteiros } from "../orcamento/Andamento";
import { DetalhePedido } from "./DetalhePedido";
import s from "./compras.module.css";

const ENCERRADOS = 20;
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

/** AAAA-MM-DD de hoje no fuso da obra: a previsão do pedido é um dia, não um instante. */
export const hojeSP = (agora = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);

const A_CAMINHO: StatusPedido[] = ["aprovado", "enviado", "em_transito", "parcial"];
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000);

/** Dias de atraso pela previsão (0 = não está atrasado); só o que ainda devia chegar atrasa. */
export const diasDeAtraso = (p: Pedido, hoje: string) => {
  // previsão de API antiga pode ser texto livre ("chega quinta"): só data atrasa
  const dia = /^\d{4}-\d{2}-\d{2}/.test(p.previsao ?? "") ? p.previsao!.slice(0, 10) : null;
  return dia && A_CAMINHO.includes(p.status) && dia < hoje ? diasEntre(dia, hoje) : 0;
};

export interface SeloPedido {
  texto: string;
  /** A versão curta, para a coluna Pedidos do Orçamento e o celular. */
  curto: string;
  tom: "ok" | "warn" | "bad" | "info" | "neutro";
}

/**
 * O selo do cartão, no vocabulário do protótipo: "falta aprovar", "atrasado 15 dias", "chega 14/11", "chegou · pago".
 * O atraso vem da previsão contra hoje; o resto é o status do domínio dito em palavras.
 */
export function seloDoPedido(p: Pedido, hoje: string): SeloPedido {
  if (p.status === "cancelado") return { texto: "cancelado", curto: "cancelado", tom: "neutro" };
  if (p.status === "conferido") {
    const pago = p.valor > 0 && (p.pago ?? 0) >= p.valor;
    const veioTudo = p.linhas.every((l) => l.recebida >= l.quantidade);
    const t = veioTudo ? "chegou" : "chegou em parte";
    return { texto: pago ? `${t} · pago` : t, curto: "chegou", tom: "ok" };
  }
  if (p.status === "em_cotacao") return { texto: "falta aprovar", curto: "falta aprovar", tom: "warn" };
  const atraso = diasDeAtraso(p, hoje);
  if (atraso) return { texto: `atrasado ${atraso} ${atraso === 1 ? "dia" : "dias"}`, curto: "atrasado", tom: "bad" };
  if (p.status === "parcial") return { texto: progressoParcial(p), curto: "chegou em parte", tom: "warn" };
  if (p.status === "recebido") return { texto: "chegou · falta conferir", curto: "chegou", tom: "warn" };
  const t = p.previsao ? fmtPrevisao(p.previsao) : "a caminho";
  return { texto: t, curto: t, tom: "info" };
}

/** O que espera alguém vem primeiro: aprovar, depois o atrasado, depois o resto na ordem da API. */
const URGENCIA = (p: Pedido, hoje: string) => (p.status === "em_cotacao" ? 0 : diasDeAtraso(p, hoje) ? 1 : 2);
export const porUrgencia = (hoje: string) => (a: Pedido, b: Pedido) => URGENCIA(a, hoje) - URGENCIA(b, hoje);

interface Contexto {
  obra: Obra;
  itens: ItemInsumo[];
  etapas: EtapaObra[];
  fornecedores: Fornecedor[];
}

const TOM_PILL: Record<SeloPedido["tom"], string> = { ok: "ok", warn: "warn", bad: "bad", info: "info", neutro: s.neutro! };

export function PilulaPedido({ selo, curto = false }: { selo: SeloPedido; curto?: boolean }) {
  return <span className={`pill ${s.pil} ${TOM_PILL[selo.tom]}`}>{curto ? selo.curto : selo.texto}</span>;
}

/**
 * O cartão do pedido como no protótipo: o que é e o selo na mesma linha, número · fornecedor · valor embaixo e só a
 * ação do momento (aprovar ou recusar; cobrar ou dizer que chegou). O resto (entrega pela metade, NF, cancelar) fica
 * no detalhe, que abre pelo título.
 */
function CartaoPedido({ p, hoje, abrir }: { p: Pedido; hoje: string; abrir: () => void }) {
  const { podeOperar, avisar, avisarFeito, mudou } = useCasca();
  const celular = useCelular();
  const [avancando, setAvancando] = useState(false);
  const [recusando, setRecusando] = useState(false);
  const chegada = useChegou(p);
  const r = resumoLinhas(p);
  const selo = seloDoPedido(p, hoje);
  const atraso = diasDeAtraso(p, hoje);
  const ocupado = avancando || chegada.ocupado;
  const [pri] = podeOperar ? acoesDe(p) : [];

  // `noDialogo`: o Confirmar já mostra o erro dentro dele; o aviso solto repetiria a mesma frase
  const avancar = async (para: StatusPedido, feito: string, noDialogo = false) => {
    setAvancando(true);
    try {
      const x = await api.avancarPedido(p.id, para);
      mudou();
      avisarFeito(feito, x.registro_id);
    } catch (e) {
      if (!noDialogo) avisar(mensagemDe(e), true);
      throw e;
    } finally {
      setAvancando(false);
    }
  };
  const carga = ocupado ? <Icone nome="loader" className="spin" tam={14} /> : null;
  const bt = (classe = "") => `btn ${s.btPed}${classe ? ` ${classe}` : ""}`;

  let acoes: ReactNode = null;
  if (podeOperar && p.status === "em_cotacao")
    acoes = (
      <>
        <button type="button" className={bt()} disabled={ocupado} aria-label={`Recusar ${p.numero}`} onClick={() => setRecusando(true)}>
          Recusar…
        </button>
        <button type="button" className={bt("amb")} disabled={ocupado} aria-busy={avancando} aria-label={`Aprovar ${p.numero}`} onClick={() => void avancar("aprovado", `${p.numero} aprovado.`).catch(() => undefined)}>
          {avancando ? carga : null}
          Aprovar
        </button>
      </>
    );
  else if (podeOperar && pri?.tipo === "chegou") {
    // no celular, o que está a caminho no prazo pede "Registrar entrega" na largura toda, como no protótipo
    const rotulo = !atraso && celular && pri.rotulo === "Chegou" ? "Registrar entrega" : pri.rotulo;
    acoes = (
      <>
        {atraso ? (
          // a cobrança ainda não existe na API: a tela mostra o caminho e avisa que é prévia
          <button type="button" className={bt(`${s.plumo}`)} onClick={() => avisar(AVISO_PREVIA)}>
            {celular ? "Cobrar" : "Cobrar pelo Plumo"}
          </button>
        ) : null}
        <button
          type="button"
          className={bt()}
          disabled={ocupado}
          aria-busy={chegada.ocupado}
          aria-label={`${rotulo}: ${p.numero}`}
          onClick={chegada.registrar}
        >
          {chegada.ocupado ? carga : null}
          {rotulo}
        </button>
      </>
    );
  }

  // no celular o meta diz o que importa para o estado: o valor a aprovar, a data que passou
  const meta = [p.numero, p.fornecedor, celular ? (atraso && p.previsao ? `era ${diaMes(p.previsao)}` : p.status === "em_cotacao" ? reaisInteiros(p.valor) : null) : reaisInteiros(p.valor)].filter(Boolean);
  return (
    <li className={`card ${s.ped}`}>
      <div className={s.pedTopo}>
        <button type="button" className={s.pedAbrir} onClick={abrir}>
          {r.primeira}
          {r.mais ? ` + ${r.mais} ${r.mais === 1 ? "item" : "itens"}` : ""}
        </button>
        <PilulaPedido selo={selo} curto={celular} />
      </div>
      <span className={s.pedMeta}>
        {meta.map((m, i) => (
          <span key={i}>
            {i ? " · " : ""}
            <span className={i === 1 ? s.pedForn : i === 2 ? "num" : undefined}>{m}</span>
          </span>
        ))}
      </span>
      {acoes ? <div className={s.pedAcoes}>{acoes}</div> : null}
      {recusando ? (
        <Confirmar titulo={`Recusar o ${p.numero}?`} confirmar="Recusar pedido" fechar={() => setRecusando(false)} aoConfirmar={() => avancar("cancelado", `${p.numero} recusado.`, true).then(() => setRecusando(false))}>
          <p style={{ margin: "4px 0 0" }}>
            O pedido de {r.primeira} ({reaisInteiros(p.valor)}, {p.fornecedor}) é cancelado e o que ele traria volta para Falta comprar. Dá para desfazer pelo Histórico.
          </p>
        </Confirmar>
      ) : null}
    </li>
  );
}

/**
 * Coluna Pedidos: o que espera alguém em cima (aprovar, atrasado), o que está a caminho e o último que chegou; os mais
 * antigos aparecem a pedido, de 20 em 20 (cursor `antes_de`). Os cancelados ficam recolhidos no fim.
 */
export function ListaPedidos(props: Contexto & { pedidos: Pedido[]; titulo?: boolean }) {
  const { pedidos, titulo = true, ...ctx } = props;
  const { versao } = useCasca();
  const [aberto, setAberto] = useState<Pedido | null>(null);
  const [verAntigos, setVerAntigos] = useState(false);
  const hoje = hojeSP();
  const chegaram = useMaisAntigos((antes) => api.listarPedidos(ctx.obra.id, { status: "conferido", limite: ENCERRADOS, antes_de: antes }), ENCERRADOS, [ctx.obra.id, versao]);
  const cancelados = useMaisAntigos((antes) => api.listarPedidos(ctx.obra.id, { status: "cancelado", limite: ENCERRADOS, antes_de: antes }), ENCERRADOS, [ctx.obra.id, versao]);
  const antigos = chegaram.itens ?? [];
  // O pedido aberto acompanha a lista recarregada; já encerrado, vale a versão que a própria escrita devolveu.
  const atual = aberto ? ([...pedidos, ...antigos].find((p) => p.id === aberto.id) ?? aberto) : null;
  const abertos = [...pedidos].sort(porUrgencia(hoje));
  const lista = [...abertos, ...(verAntigos ? antigos : antigos.slice(0, 1))];
  const total = pedidos.length + antigos.length;
  const temMais = verAntigos ? !chegaram.acabou : antigos.length > 1 || (!chegaram.acabou && antigos.length > 0);
  const cartao = (p: Pedido) => <CartaoPedido key={p.id} p={p} hoje={hoje} abrir={() => setAberto(p)} />;
  return (
    <section className={s.colPedidos} aria-labelledby={titulo ? "pedidos-titulo" : undefined} aria-label={titulo ? undefined : "Pedidos"}>
      {titulo ? (
        <div className={s.cabPedidos}>
          <h2 id="pedidos-titulo" className={s.tituloPed}>
            Pedidos
          </h2>
          {total ? <span className={s.meta}>{`${total.toLocaleString("pt-BR")}${chegaram.acabou ? "" : "+"} no total`}</span> : null}
        </div>
      ) : null}
      {lista.length ? <ul className={s.pedidos}>{lista.map(cartao)}</ul> : <p className={`card mut ${s.vazioPed}`}>Nenhum pedido ainda. Marque o que vai comprar e faça o pedido.</p>}
      {temMais ? (
        verAntigos ? (
          <BotaoMais acabou={chegaram.acabou} buscando={chegaram.buscando} carregarMais={chegaram.carregarMais} rotulo="Mostrar mais antigos" />
        ) : (
          <button type="button" className={`btn ${s.maisAntigos}`} onClick={() => setVerAntigos(true)}>
            Mostrar mais antigos
          </button>
        )
      ) : null}
      {cancelados.itens?.length ? (
        <details className={`cobertos ${s.cancelados}`}>
          <summary>
            <Icone nome="chevRight" tam={14} />
            Cancelados ({cancelados.itens.length}
            {cancelados.acabou ? "" : "+"})
          </summary>
          <ul className={s.pedidos}>{cancelados.itens.map(cartao)}</ul>
          <BotaoMais acabou={cancelados.acabou} buscando={cancelados.buscando} carregarMais={cancelados.carregarMais} rotulo="Mostrar mais antigos" />
        </details>
      ) : null}
      {atual ? <DetalhePedido pedido={atual} {...ctx} fechar={() => setAberto(null)} atualizar={setAberto} /> : null}
    </section>
  );
}
