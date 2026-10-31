"use client";
/**
 * Aba Pedidos: uma coluna por status. Cada cartão tem UMA ação à vista, nomeada pela consequência ("Registrar chegada",
 * "Conferir e dar entrada de 40 m³"), e o resto no "⋯". Quem valida a transição é a API (regras.validar_transicao).
 */
import { useState } from "react";
import type { Insumo, ItemInsumo, Pedido, StatusPedido } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtPrevisao, fmtQtdUn, fmtReais } from "@/lib/formato";
import { ROTULO_STATUS } from "./CartaoProposta";
import { mensagemDe, useCasca } from "./contexto";
import { Icone } from "./Icone";
import { MenuMais } from "./MenuMais";
import { useCarregar } from "./useCarregar";
import { ModalConferir } from "./formularios/ModalConferir";
import { ModalNovoPedido } from "./formularios/ModalNovoPedido";
import type { Obra } from "@/lib/contrato";

// Conferido e cancelado já saíram do trabalho: ficam recolhidos embaixo, e as 5 colunas cabem em 1100 px.
const COLUNAS: StatusPedido[] = ["em_cotacao", "aprovado", "enviado", "em_transito", "recebido"];

interface Passo {
  para: StatusPedido;
  rotulo: string;
  feito: string;
}

/** Os passos que a tela oferece a partir de cada status: o primeiro fica à vista, os outros vão para o "⋯". */
export function passosDe(p: Pedido, un: string): Passo[] {
  const qtd = fmtQtdUn(p.quantidade, un);
  const cancelar: Passo = { para: "cancelado", rotulo: "Cancelar pedido", feito: `${p.numero} cancelado.` };
  switch (p.status) {
    case "em_cotacao":
      return [{ para: "aprovado", rotulo: `Aprovar ${fmtReais(p.valor)}`, feito: `${p.numero} aprovado.` }, cancelar];
    case "aprovado":
      return [{ para: "enviado", rotulo: "Marcar como enviado ao fornecedor", feito: `${p.numero} enviado.` }, cancelar];
    case "enviado":
      return [
        { para: "recebido", rotulo: "Registrar chegada", feito: `Chegada do ${p.numero} registrada. Falta conferir.` },
        { para: "em_transito", rotulo: "Marcar em trânsito", feito: `${p.numero} em trânsito.` },
        cancelar,
      ];
    case "em_transito":
      return [{ para: "recebido", rotulo: "Registrar chegada", feito: `Chegada do ${p.numero} registrada. Falta conferir.` }];
    case "recebido":
      // Conferir abre o formulário (quanto chegou, NF): o `feito` sai de lá, com a quantidade real.
      return [{ para: "conferido", rotulo: `Conferir chegada de ${qtd}`, feito: "" }];
    default:
      return [];
  }
}

function CartaoPedido({ p, insumo }: { p: Pedido; insumo: Insumo | undefined }) {
  const { podeOperar, avisar, avisarFeito, mudou } = useCasca();
  const [ocupado, setOcupado] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const un = insumo?.unidade ?? "";
  const passos = podeOperar ? passosDe(p, un) : [];
  const [pri, ...resto] = passos;
  const recebida = p.status === "conferido" ? (p.quantidade_recebida ?? p.quantidade) : null;

  const avancar = async (passo: Passo) => {
    if (passo.para === "conferido") return setConferindo(true);
    setOcupado(true);
    try {
      const r = await api.avancarPedido(p.id, passo.para);
      mudou();
      avisarFeito(passo.feito, r.registro_id);
    } catch (e) {
      avisar(mensagemDe(e), true);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <li className={`kc${p.status === "conferido" ? " done" : ""}`}>
      <span className="kn">{p.numero}</span>
      <span className="kt">
        {fmtQtdUn(p.quantidade, un)} · {insumo?.nome ?? "insumo"}
      </span>
      <span className="mut">{p.fornecedor}</span>
      <div className="meta">
        <b>{fmtReais(p.valor)}</b>
        {p.previsao && recebida === null ? <span>{fmtPrevisao(p.previsao)}</span> : null}
        {p.nf ? <span>NF {p.nf}</span> : null}
      </div>
      {recebida !== null && recebida !== p.quantidade ? (
        <div className={`kdif ${recebida < p.quantidade ? "falta" : "sobra"}`}>
          chegaram {fmtQtdUn(recebida, un)} de {fmtQtdUn(p.quantidade, un)}
          {recebida < p.quantidade ? ` · faltou ${fmtQtdUn(p.quantidade - recebida, un)}` : ""}
        </div>
      ) : null}
      {pri ? (
        <div className="kact">
          <button type="button" className="btn" disabled={ocupado} aria-busy={ocupado} onClick={() => avancar(pri)}>
            {ocupado ? <Icone nome="loader" className="spin" tam={14} /> : null}
            {pri.rotulo}
          </button>
          {resto.length ? <MenuMais rotulo={`Mais ações do ${p.numero}`} itens={resto.map((s) => ({ rotulo: s.rotulo, acao: () => void avancar(s) }))} /> : null}
        </div>
      ) : null}
      {conferindo ? <ModalConferir pedido={p} insumo={insumo} fechar={() => setConferindo(false)} /> : null}
    </li>
  );
}

export function Pedidos({ obra }: { obra: Obra }) {
  const { versao, podeOperar } = useCasca();
  const [novo, setNovo] = useState(false);
  const { dado, erro, carregando } = useCarregar(
    () => Promise.all([api.listarPedidos(obra.id), api.listarInsumos(obra.id)]),
    [obra.id, versao],
  );
  const [pedidos, itens] = dado ?? [[], [] as ItemInsumo[]];
  const insumo = (id: string) => itens.find((i) => i.insumo.id === id)?.insumo;
  const recolhidos = (["conferido", "cancelado"] as const).map((st) => [st, pedidos.filter((p) => p.status === st)] as const);

  return (
    <div className="page">
      <div className="cab-tela">
        <h2>Pedidos</h2>
        <span className="mut sm">{obra.nome}</span>
        {podeOperar && dado ? (
          <button type="button" className="btn cab-acao" onClick={() => setNovo(true)}>
            <Icone nome="plus" tam={15} />
            Novo pedido
          </button>
        ) : null}
      </div>
      {erro ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          {erro}
        </div>
      ) : null}
      {carregando && !dado ? (
        <div className="carregando" role="status">
          <Icone nome="loader" className="spin" tam={15} />
          Carregando pedidos…
        </div>
      ) : (
        <div className="kb">
          {COLUNAS.map((st) => {
            const ps = pedidos.filter((p) => p.status === st);
            return (
              <section key={st} className="col" aria-labelledby={`col-${st}`}>
                <h3 id={`col-${st}`}>
                  {ROTULO_STATUS[st]}
                  <small>{ps.length}</small>
                </h3>
                {ps.length ? (
                  <ul>
                    {ps.map((p) => (
                      <CartaoPedido key={p.id} p={p} insumo={insumo(p.insumo_id)} />
                    ))}
                  </ul>
                ) : (
                  <div className="vz">Nenhum pedido.</div>
                )}
              </section>
            );
          })}
        </div>
      )}
      {recolhidos.map(([st, ps]) =>
        ps.length ? (
          <details key={st} className="cobertos">
            <summary>
              <Icone nome="chevRight" tam={14} />
              {st === "conferido" ? "Conferidos" : "Cancelados"} ({ps.length})
            </summary>
            <ul className="kb-lista">
              {ps.map((p) => (
                <CartaoPedido key={p.id} p={p} insumo={insumo(p.insumo_id)} />
              ))}
            </ul>
          </details>
        ) : null,
      )}
      {novo ? <ModalNovoPedido obraId={obra.id} itens={itens} fechar={() => setNovo(false)} /> : null}
    </div>
  );
}
