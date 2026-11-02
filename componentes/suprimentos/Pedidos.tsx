"use client";
/**
 * Pedidos de Suprimentos: uma coluna por status. O pedido tem várias linhas (material e serviço), então o cartão mostra
 * o fornecedor, a 1ª linha e quantas mais, o valor e a previsão; clicar abre o detalhe, onde se registra a entrega, se
 * edita a previsão e se imprime. Cada cartão tem UMA ação à vista, nomeada pela consequência, e o resto no "⋯". Quem
 * valida a transição é a API.
 */
import { useState } from "react";
import type { EtapaObra, Fornecedor, ItemInsumo, Obra, Pedido, StatusPedido } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtPrevisao, fmtQtd, fmtQtdUn, fmtReais } from "@/lib/formato";
import { ROTULO_STATUS } from "../CartaoProposta";
import { mensagemDe, useCasca } from "../contexto";
import { Icone } from "../Icone";
import { MenuMais } from "../MenuMais";
import { BotaoMais, useMaisAntigos } from "../Paginacao";
import { ConfirmarEncerrar, DetalhePedido, ModalRecebimento } from "./DetalhePedido";

const ENCERRADOS = 20;

/** O que ainda está em jogo; `recebido` é o status antigo (chegou, falta conferir), que só a demonstração tem. */
export const ABERTOS: StatusPedido[] = ["em_cotacao", "aprovado", "enviado", "em_transito", "parcial", "recebido"];
// Recebido (conferido) e cancelado já saíram do trabalho: ficam recolhidos embaixo, e as 5 colunas cabem em 1100 px.
const COLUNAS: StatusPedido[] = ["em_cotacao", "aprovado", "enviado", "em_transito", "parcial"];
/** Onde cada status aparece no quadro (o `recebido` antigo junta-se ao em trânsito: ainda falta dar entrada). */
const COLUNA_DE: Partial<Record<StatusPedido, StatusPedido>> = { recebido: "em_transito" };

export type AcaoPedido = { tipo: "avancar"; para: StatusPedido; rotulo: string; feito: string } | { tipo: "entrega"; rotulo: string } | { tipo: "encerrar"; rotulo: string };

/** As ações que a tela oferece a partir de cada status: a primeira fica à vista, as outras vão para o "⋯". */
export function acoesDe(p: Pedido): AcaoPedido[] {
  const cancelar: AcaoPedido = { tipo: "avancar", para: "cancelado", rotulo: "Cancelar pedido", feito: `${p.numero} cancelado.` };
  const entrega: AcaoPedido = { tipo: "entrega", rotulo: "Registrar entrega" };
  switch (p.status) {
    case "em_cotacao":
      return [{ tipo: "avancar", para: "aprovado", rotulo: `Aprovar ${fmtReais(p.valor)}`, feito: `${p.numero} aprovado.` }, cancelar];
    case "aprovado":
      return [{ tipo: "avancar", para: "enviado", rotulo: "Marcar como enviado ao fornecedor", feito: `${p.numero} enviado.` }, entrega, cancelar];
    case "enviado":
      return [entrega, { tipo: "avancar", para: "em_transito", rotulo: "Marcar em trânsito", feito: `${p.numero} em trânsito.` }, cancelar];
    case "em_transito":
      return [entrega];
    case "parcial":
      return [entrega, { tipo: "encerrar", rotulo: "Encerrar o resto" }];
    case "recebido":
      return [{ tipo: "avancar", para: "conferido", rotulo: "Dar entrada", feito: `Entrada do ${p.numero} registrada.` }];
    default:
      return [];
  }
}

/** "Cimento CP-II · 40 sc" e "+ 3 itens": o que cabe num cartão de quadro. */
export function resumoLinhas(p: Pedido): { primeira: string; mais: number } {
  const l = p.linhas[0];
  return { primeira: l ? `${fmtQtdUn(l.quantidade, l.unidade)} · ${l.nome}` : "sem linhas", mais: Math.max(0, p.linhas.length - 1) };
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
  p.status === "conferido" || p.status === "cancelado"
    ? 0
    : p.linhas.reduce((t, l) => t + Math.round((Math.max(0, l.quantidade - l.recebida) * l.valor_unitario) / 1000), 0);

interface Contexto {
  obra: Obra;
  itens: ItemInsumo[];
  etapas: EtapaObra[];
  fornecedores: Fornecedor[];
}

function CartaoPedido({ p, abrir }: { p: Pedido; abrir: () => void }) {
  const { podeOperar, avisar, avisarFeito, mudou } = useCasca();
  const [ocupado, setOcupado] = useState(false);
  const [detalhe, setDetalhe] = useState<"entrega" | "encerrar" | null>(null);
  const acoes = podeOperar ? acoesDe(p) : [];
  const [pri, ...resto] = acoes;
  const r = resumoLinhas(p);
  const encerrado = p.status === "conferido" || p.status === "cancelado";

  const executar = async (a: AcaoPedido) => {
    if (a.tipo !== "avancar") return setDetalhe(a.tipo);
    setOcupado(true);
    try {
      const x = await api.avancarPedido(p.id, a.para);
      mudou();
      avisarFeito(a.feito, x.registro_id);
    } catch (e) {
      avisar(mensagemDe(e), true);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <li className={`kc kc-click${encerrado ? " done" : ""}`} onClick={abrir}>
      <button
        type="button"
        className="kn kc-abrir"
        onClick={(e) => {
          e.stopPropagation();
          abrir();
        }}
      >
        {p.numero}
      </button>
      <span className="kt">{p.fornecedor}</span>
      <span className="mut">
        {r.primeira}
        {r.mais ? ` + ${r.mais} ${r.mais === 1 ? "item" : "itens"}` : ""}
      </span>
      <div className="meta">
        <b>{fmtReais(p.valor)}</b>
        {p.previsao && !encerrado ? <span>{fmtPrevisao(p.previsao)}</span> : null}
      </div>
      {p.status === "parcial" ? (
        <div className="kdif falta">
          {progressoParcial(p)} · o resto continua a caminho
        </div>
      ) : null}
      {pri ? (
        <div className="kact" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="btn" disabled={ocupado} aria-busy={ocupado} onClick={() => executar(pri)}>
            {ocupado ? <Icone nome="loader" className="spin" tam={14} /> : null}
            {pri.rotulo}
          </button>
          {resto.length ? (
            <MenuMais rotulo={`Mais ações do ${p.numero}`} itens={resto.map((a) => ({ rotulo: a.rotulo, acao: () => void executar(a) }))} />
          ) : null}
        </div>
      ) : null}
      {detalhe === "entrega" ? <ModalRecebimento pedido={p} fechar={() => setDetalhe(null)} /> : null}
      {detalhe === "encerrar" ? <ConfirmarEncerrar pedido={p} fechar={() => setDetalhe(null)} /> : null}
    </li>
  );
}

/**
 * Recebidos e cancelados só crescem: vêm da API de 20 em 20 (cursor `antes_de`), recolhidos embaixo do quadro.
 * O quadro em si busca só os status abertos, para nenhum pedido em andamento sumir atrás de um limite.
 */
function Encerrados({ status, ctx, abrir }: { status: "conferido" | "cancelado"; ctx: Contexto; abrir: (p: Pedido) => void }) {
  const { versao } = useCasca();
  const m = useMaisAntigos((antes) => api.listarPedidos(ctx.obra.id, { status, limite: ENCERRADOS, antes_de: antes }), ENCERRADOS, [ctx.obra.id, status, versao]);
  if (!m.itens?.length) return null;
  return (
    <details className="cobertos">
      <summary>
        <Icone nome="chevRight" tam={14} />
        {status === "conferido" ? "Recebidos" : "Cancelados"} ({m.itens.length}
        {m.acabou ? "" : "+"})
      </summary>
      <ul className="kb-lista">
        {m.itens.map((p) => (
          <CartaoPedido key={p.id} p={p} abrir={() => abrir(p)} />
        ))}
      </ul>
      <BotaoMais acabou={m.acabou} buscando={m.buscando} carregarMais={m.carregarMais} rotulo="Mostrar mais antigos" />
    </details>
  );
}

/** Seção Pedidos de Suprimentos. `pedidos` = os abertos, que a tela já carregou para os números do cabeçalho. */
export function QuadroPedidos(props: Contexto & { pedidos: Pedido[] }) {
  const { pedidos, ...ctx } = props;
  const [aberto, setAberto] = useState<Pedido | null>(null);
  // O pedido aberto acompanha a lista recarregada (depois de uma entrega, o status e as quantidades mudam). Recebido
  // ou cancelado ele sai dos abertos: vale então a versão que a própria escrita devolveu (`atualizar`).
  const atual = aberto ? (pedidos.find((p) => p.id === aberto.id) ?? aberto) : null;
  const colunas = COLUNAS.map((st) => ({ st, ps: pedidos.filter((p) => (COLUNA_DE[p.status] ?? p.status) === st) })).filter((c) => c.ps.length);
  return (
    <>
      {/* Coluna vazia não aparece: "0 — Nenhum pedido." quatro vezes antes do único pedido real era ruído. */}
      {colunas.length ? (
        <div className="kb" style={{ "--n-col": colunas.length } as React.CSSProperties}>
          {colunas.map(({ st, ps }) => (
            <section key={st} className="col" data-st={st} aria-labelledby={`col-${st}`}>
              <h3 id={`col-${st}`}>
                <i className="col-dot" aria-hidden="true" />
                {ROTULO_STATUS[st]}
                <small>{ps.length}</small>
              </h3>
              <div className="col-total">{fmtReais(ps.reduce((t, p) => t + p.valor, 0))}</div>
              <ul>
                {ps.map((p) => (
                  <CartaoPedido key={p.id} p={p} abrir={() => setAberto(p)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <p className="mut">Nenhum pedido aberto.</p>
      )}
      {(["conferido", "cancelado"] as const).map((st) => (
        <Encerrados key={st} status={st} ctx={ctx} abrir={setAberto} />
      ))}
      {atual ? <DetalhePedido pedido={atual} {...ctx} fechar={() => setAberto(null)} atualizar={setAberto} /> : null}
    </>
  );
}
