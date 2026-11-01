"use client";
/**
 * Aba Orçamento: os dados da obra e o que ela vai consumir, com preço, contra a verba do dono. Enquanto a obra está
 * em orçamento, é daqui que se importa a planilha e se aprova; aprovado, vira referência (a falta do almoxarifado
 * continua saindo das mesmas quantidades). O orçamento são os insumos com quantidade prevista: não há um documento
 * à parte para ficar desatualizado em relação ao almoxarifado.
 */
import { useState } from "react";
import type { ItemInsumo, Obra } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtQtd, fmtQtdUn, fmtReais } from "@/lib/formato";
import { mensagemDe, useCasca } from "./contexto";
import { Icone } from "./Icone";
import { useCarregar } from "./useCarregar";
import { ImportarOrcamento } from "./obra/ImportarOrcamento";
import { ModalDadosObra } from "./obra/ModalDadosObra";
import { ComparaVerba } from "./obra/verba";
import { PADROES, REGIMES, TIPOLOGIAS } from "./obra/CamposObra";

/** precisa (milésimos) × preço (centavos) → centavos */
export const totalDoItem = (i: ItemInsumo) => Math.round((i.insumo.precisa_ate_o_fim * i.insumo.valor_unitario) / 1000);

export function resumoDaObra(o: Obra): string[] {
  return [
    TIPOLOGIAS.find((t) => t.k === o.tipologia)?.rotulo,
    o.area_construida ? `${fmtQtd(o.area_construida)} m²` : null,
    o.pavimentos ? `${o.pavimentos} ${o.pavimentos === 1 ? "pavimento" : "pavimentos"}` : null,
    o.padrao ? `padrão ${PADROES.find((p) => p.k === o.padrao)!.rotulo.toLowerCase()}` : null,
    [o.cidade, o.uf].filter(Boolean).join("/") || null,
    o.regime ? REGIMES.find((r) => r.k === o.regime)!.rotulo.toLowerCase() : null,
    o.prazo_meses ? `${o.prazo_meses} meses` : null,
  ].filter((x): x is string => !!x);
}

export function Orcamento({ obra }: { obra: Obra }) {
  const { versao, podeOperar, avisarFeito, mudou, avisar } = useCasca();
  const { dado, erro, carregando } = useCarregar(() => api.listarInsumos(obra.id), [obra.id, versao]);
  const [modal, setModal] = useState<"importar" | "dados" | null>(null);
  const [aprovando, setAprovando] = useState(false);

  const itens = (dado ?? [])
    .filter((i) => i.insumo.precisa_ate_o_fim > 0)
    .sort((a, b) => totalDoItem(b) - totalDoItem(a) || a.insumo.nome.localeCompare(b.insumo.nome, "pt-BR"));
  const total = itens.reduce((t, i) => t + totalDoItem(i), 0);
  const semPreco = itens.filter((i) => !i.insumo.valor_unitario).length;
  const emOrcamento = obra.status === "em_orcamento";
  const resumo = resumoDaObra(obra);
  const faltaDado = !obra.area_construida || !obra.padrao;

  const aprovar = async () => {
    setAprovando(true);
    try {
      const r = await api.aprovarOrcamento(obra.id);
      mudou();
      avisarFeito(`Orçamento aprovado. ${obra.nome} está em andamento.`, r.registro_id ?? null);
    } catch (e) {
      avisar(mensagemDe(e), true);
    } finally {
      setAprovando(false);
    }
  };

  return (
    <div className="page">
      <div className="cab-tela">
        <h2>Orçamento</h2>
        <span className={`pill ${emOrcamento ? "st-orc" : "st-ok"}`}>{emOrcamento ? "em orçamento" : "aprovado"}</span>
        {podeOperar && itens.length ? (
          <button type="button" className="btn cab-acao" onClick={() => setModal("importar")}>
            Importar planilha
          </button>
        ) : null}
      </div>

      <section className="card orc-obra" aria-label="Dados da obra">
        <div>
          <div className="orc-obra-n">{obra.nome}</div>
          <div className="mut sm">{resumo.length ? resumo.join(" · ") : "Sem os dados da obra ainda."}</div>
          {faltaDado ? (
            <div className="campo-dica alerta">
              Falta {!obra.area_construida && !obra.padrao ? "a área e o padrão" : !obra.area_construida ? "a área" : "o padrão"}: eles dão a régua de preço por
              m² para conferir o orçamento.
            </div>
          ) : null}
        </div>
        {podeOperar ? (
          <button type="button" className="btn" onClick={() => setModal("dados")}>
            Editar dados
          </button>
        ) : null}
      </section>

      {erro ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          {erro}
        </div>
      ) : null}

      {carregando && !dado ? (
        <div className="carregando" role="status">
          <Icone nome="loader" className="spin" tam={15} />
          Carregando o orçamento…
        </div>
      ) : dado && !itens.length ? (
        <div className="card vazio">
          <Icone nome="package" tam={24} />
          <h3>Nenhum orçamento ainda</h3>
          <p>Importe a planilha do orçamento do jeito que ela está, com título, etapas e subtotais. Você confere a prévia antes de gravar.</p>
          {podeOperar ? (
            <button type="button" className="btn amb" onClick={() => setModal("importar")}>
              Importar planilha do orçamento
            </button>
          ) : null}
        </div>
      ) : dado ? (
        <>
          <div className="prev-resumo orc-tot">
            <div>
              <span className="prev-n">{fmtReais(total)}</span>
              <span>
                total do orçamento
                <ComparaVerba total={total} verba={obra.verba} />
              </span>
            </div>
            <div>
              <span className="prev-n">{itens.length}</span>
              <span>
                {itens.length === 1 ? "insumo" : "insumos"}
                {semPreco ? <small className="verba-atencao">{semPreco} sem preço, fora do total</small> : null}
              </span>
            </div>
            {emOrcamento && podeOperar ? (
              <button type="button" className="btn amb orc-aprovar" disabled={aprovando} aria-busy={aprovando} onClick={aprovar}>
                Aprovar orçamento
              </button>
            ) : null}
          </div>
          {emOrcamento ? (
            <p className="mut sm">
              Aprovado, a obra passa para em andamento e o almoxarifado começa a cobrar a falta destas quantidades. Dá para desfazer pelo Histórico.
            </p>
          ) : null}
          <div className="card lista">
            <table className="tbl-orc">
              <thead>
                <tr>
                  <th scope="col">Insumo</th>
                  <th scope="col" className="num">
                    Quantidade
                  </th>
                  <th scope="col" className="num">
                    Unitário
                  </th>
                  <th scope="col" className="num">
                    Total
                  </th>
                  <th scope="col" className="num">
                    % do total
                  </th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => {
                  const t = totalDoItem(i);
                  return (
                    <tr key={i.insumo.id}>
                      <td>
                        {i.insumo.nome}
                        <span className={`curva c${i.insumo.curva}`} title={`Curva ${i.insumo.curva}`}>
                          {i.insumo.curva}
                        </span>
                      </td>
                      <td className="num">{fmtQtdUn(i.insumo.precisa_ate_o_fim, i.insumo.unidade)}</td>
                      <td className="num">{i.insumo.valor_unitario ? fmtReais(i.insumo.valor_unitario) : "—"}</td>
                      <td className="num">{t ? fmtReais(t) : "—"}</td>
                      <td className="num mut">{total && t ? `${((t / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {modal === "importar" ? <ImportarOrcamento obra={obra} fechar={() => setModal(null)} /> : null}
      {modal === "dados" ? <ModalDadosObra obra={obra} fechar={() => setModal(null)} /> : null}
    </div>
  );
}
