"use client";
/**
 * Previsto × realizado por etapa (Fase 3). Os números vêm somados da API (GET /obras/{id}/orcamento): orçado atual
 * (contrato + aditivos), em cotação, comprometido (pedidos de aprovado em diante) e realizado (entregue ou medido). A
 * tela só ordena, desenha a barra e calcula o saldo (atual − comprometido) e o %; nenhuma soma de pedido é refeita aqui.
 * O orçado é preço de contrato (com BDI e mão de obra) e o gasto é custo de compra: a nota diz isso uma vez.
 */
import { useEffect, useMemo, useState } from "react";
import type { EtapaOrcamento, Gasto, Obra, Orcamento, Pedido, VersaoOrcamento } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { baixarCsv, centavosCsv, gerarCsv } from "@/lib/csv";
import { fmtQtdUn, fmtReais } from "@/lib/formato";
import { ROTULO_STATUS } from "../CartaoProposta";
import { Drawer } from "../Dialogo";
import { Icone } from "../Icone";
import { useCarregar } from "../useCarregar";

/** Limite de acréscimo por aditivo em obra pública (art. 65, § 1º, da Lei 8.666/93). */
export const LIMITE_ADITIVO = 0.25;

export interface LinhaAndamento extends Gasto {
  etapa: string;
  descricao: string;
  atual: number;
  saldo: number;
  /** comprometido ÷ atual; Infinity quando há gasto numa etapa sem orçado. */
  pct: number;
  semEtapa?: boolean;
}

const pctDe = (comprometido: number, atual: number) => (atual ? comprometido / atual : comprometido ? Infinity : 0);

export function linhasAndamento(orc: Orcamento): LinhaAndamento[] {
  const ls: LinhaAndamento[] = orc.etapas.map((e: EtapaOrcamento) => ({
    etapa: e.etapa,
    descricao: e.descricao,
    atual: e.atual,
    cotando: e.cotando,
    comprometido: e.comprometido,
    realizado: e.realizado,
    saldo: e.atual - e.comprometido,
    pct: pctDe(e.comprometido, e.atual),
  }));
  const s = orc.totais.sem_etapa;
  if (s && (s.cotando || s.comprometido || s.realizado))
    ls.push({ etapa: "", descricao: "Sem etapa", atual: 0, ...s, saldo: -s.comprometido, pct: pctDe(s.comprometido, 0), semEtapa: true });
  return ls;
}

/** Maior desvio primeiro: o que já comprometeu mais do orçado da etapa (estouro no topo, em vermelho). */
export const porDesvio = (a: LinhaAndamento, b: LinhaAndamento) => b.pct - a.pct || b.comprometido - a.comprometido;

const fmtPct = (p: number) => (p === Infinity ? "sem orçado" : `${(p * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

export function csvAndamento(orc: Orcamento): string {
  const ls = linhasAndamento(orc);
  const t = orc.totais;
  const pct = (p: number) => (p === Infinity ? "" : (p * 100).toFixed(1).replace(".", ","));
  return gerarCsv([
    ["Etapa", "Descrição", "Orçado atual", "Em cotação", "Comprometido", "Realizado", "Saldo a comprometer", "% comprometido"],
    ...ls.map((l) => [l.etapa, l.descricao, centavosCsv(l.atual), centavosCsv(l.cotando), centavosCsv(l.comprometido), centavosCsv(l.realizado), centavosCsv(l.saldo), pct(l.pct)]),
    ["", "Total", centavosCsv(t.atual), centavosCsv(t.cotando), centavosCsv(t.comprometido), centavosCsv(t.realizado), centavosCsv(t.atual - t.comprometido), pct(pctDe(t.comprometido, t.atual))],
  ]);
}

/** Barra fina: o comprometido (claro) e o realizado (cheio) contra o orçado (o risco vertical). */
function Barra({ l }: { l: LinhaAndamento }) {
  const max = Math.max(l.atual, l.comprometido, l.realizado, 1);
  const w = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <span className="and-barra" aria-hidden="true">
      <span className="and-comp" style={{ width: w(l.comprometido) }} />
      <span className="and-real" style={{ width: w(l.realizado) }} />
      {l.atual ? <span className="and-orc" style={{ left: w(l.atual) }} /> : null}
    </span>
  );
}

const CHAVE_NOTA = "plumo.nota-andamento";

/** A nota aparece até a pessoa dizer que entendeu; depois não ocupa mais a tela. */
export function NotaAndamento() {
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    setVisivel(localStorage.getItem(CHAVE_NOTA) !== "1");
  }, []);
  if (!visivel) return null;
  return (
    <p className="and-nota" role="note">
      <Icone nome="info" tam={15} />
      <span>
        O orçado é preço de contrato (com BDI e mão de obra); comprometido e realizado são o que a obra comprou. Por isso o realizado de uma etapa não é o %
        executado dela.
      </span>
      <button
        type="button"
        className="link"
        onClick={() => {
          localStorage.setItem(CHAVE_NOTA, "1");
          setVisivel(false);
        }}
      >
        Entendi
      </button>
    </p>
  );
}

export function AndamentoEtapas({ obra, orc }: { obra: Obra; orc: Orcamento }) {
  const [ordem, setOrdem] = useState<"desvio" | "planilha">("desvio");
  const [aberta, setAberta] = useState<LinhaAndamento | null>(null);
  const linhas = useMemo(() => {
    const ls = linhasAndamento(orc);
    return ordem === "desvio" ? [...ls].sort(porDesvio) : ls;
  }, [orc, ordem]);
  const t = orc.totais;
  const temGasto = t.cotando || t.comprometido || t.realizado;

  const exportar = () => {
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const nome = obra.nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\w]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    baixarCsv(`andamento-${nome}-${hoje}.csv`, csvAndamento(orc));
  };

  return (
    <section aria-labelledby="and-titulo">
      <div className="and-cab">
        <h3 className="sectit" id="and-titulo">
          Andamento por etapa
        </h3>
        <div className="seg seg-pq" role="radiogroup" aria-label="Ordenar etapas">
          {(
            [
              ["desvio", "Maior desvio"],
              ["planilha", "Ordem da planilha"],
            ] as const
          ).map(([k, r]) => (
            <button key={k} type="button" role="radio" aria-checked={ordem === k} className={ordem === k ? "on" : ""} onClick={() => setOrdem(k)}>
              {r}
            </button>
          ))}
        </div>
        <button type="button" className="btn sm" onClick={exportar}>
          <Icone nome="planilha" tam={14} />
          Exportar CSV
        </button>
      </div>
      {!temGasto ? <p className="mut sm">Nenhum pedido aprovado ainda: comprometido e realizado começam a contar no primeiro pedido.</p> : null}
      <div className="card lista and-rola">
        <table className="tbl-and">
          <thead>
            <tr>
              <th scope="col">Etapa</th>
              <th scope="col" className="num">
                Orçado atual
              </th>
              <th scope="col" className="num">
                Em cotação
              </th>
              <th scope="col" className="num">
                Comprometido
              </th>
              <th scope="col" className="num">
                Realizado
              </th>
              <th scope="col" className="num">
                Saldo
              </th>
              <th scope="col" className="num">
                % comprometido
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const estouro = l.comprometido > l.atual;
              return (
                <tr key={l.semEtapa ? "_sem" : l.etapa} className={`and-l${estouro ? " estouro" : ""}`} onClick={() => setAberta(l)}>
                  <td>
                    <button
                      type="button"
                      className="and-nome"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAberta(l);
                      }}
                    >
                      {l.etapa ? <span className="eap-num">{l.etapa}</span> : null}
                      {l.descricao}
                    </button>
                    <Barra l={l} />
                  </td>
                  <td className="num">{l.atual ? fmtReais(l.atual) : "—"}</td>
                  <td className="num mut">{l.cotando ? fmtReais(l.cotando) : "—"}</td>
                  <td className="num">{l.comprometido ? fmtReais(l.comprometido) : "—"}</td>
                  <td className="num">{l.realizado ? fmtReais(l.realizado) : "—"}</td>
                  <td className={`num${l.saldo < 0 ? " t-neg" : ""}`}>{fmtReais(l.saldo)}</td>
                  <td className="num">
                    {l.comprometido ? fmtPct(l.pct) : "—"}
                    {estouro ? <span className="pill bad and-tag">acima do orçado</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="num">{fmtReais(t.atual)}</td>
              <td className="num mut">{fmtReais(t.cotando)}</td>
              <td className="num">{fmtReais(t.comprometido)}</td>
              <td className="num">{fmtReais(t.realizado)}</td>
              <td className="num">{fmtReais(t.atual - t.comprometido)}</td>
              <td className="num">{fmtPct(pctDe(t.comprometido, t.atual))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="and-legenda mut sm">
        <span>
          <i className="and-comp" /> comprometido
        </span>
        <span>
          <i className="and-real" /> realizado
        </span>
        <span>
          <i className="and-orc" /> orçado
        </span>
        <span>Clique na etapa para ver os pedidos dela.</span>
      </p>
      {aberta ? <PedidosDaEtapa obra={obra} linha={aberta} etapas={orc.etapas} fechar={() => setAberta(null)} /> : null}
    </section>
  );
}

/** Os pedidos que gastam na etapa, filtrados aqui pelas linhas (a API lista os pedidos da obra, sem filtro de etapa). */
function PedidosDaEtapa({ obra, linha, etapas, fechar }: { obra: Obra; linha: LinhaAndamento; etapas: EtapaOrcamento[]; fechar: () => void }) {
  const { dado, erro, carregando } = useCarregar(() => api.listarPedidos(obra.id, { limite: 500 }), [obra.id]);
  const conhecidas = new Set(etapas.map((e) => e.etapa));
  const daEtapa = (et: string | null) => (linha.semEtapa ? !et || !conhecidas.has(et) : et === linha.etapa);
  const pedidos = (dado ?? []).filter((p) => p.status !== "cancelado" && p.linhas.some((l) => daEtapa(l.etapa)));
  return (
    <Drawer titulo={linha.semEtapa ? "Gasto sem etapa" : `${linha.etapa} · ${linha.descricao}`} fechar={fechar}>
      <p className="mut sm" style={{ margin: 0 }}>
        Orçado {fmtReais(linha.atual)} · comprometido {fmtReais(linha.comprometido)} · realizado {fmtReais(linha.realizado)}
        {linha.cotando ? ` · em cotação ${fmtReais(linha.cotando)}` : ""}
      </p>
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
      ) : !pedidos.length ? (
        <p className="mut">Nenhum pedido nesta etapa.</p>
      ) : (
        <ul className="card lista and-peds">
          {pedidos.map((p: Pedido) => (
            <li key={p.id}>
              <div className="and-ped-t">
                <b>{p.numero}</b> · {p.fornecedor} <span className={`pill st-${p.status}`}>{ROTULO_STATUS[p.status]}</span>
              </div>
              {p.linhas
                .filter((l) => daEtapa(l.etapa))
                .map((l, i) => (
                  <div key={i} className="and-ped-l">
                    <span>
                      {fmtQtdUn(l.quantidade, l.unidade)} · {l.nome}
                      {l.recebida ? <small className="mut"> · chegou {fmtQtdUn(l.recebida, l.unidade)}</small> : null}
                    </span>
                    <span className="num">{fmtReais(l.total)}</span>
                  </div>
                ))}
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}

/** Aditivos para o diretor: quanto somou ao contrato, o % e o alerta do limite legal, por aditivo e por etapa. */
export function BlocoAditivos({ orc, nomeVersao, fmtData }: { orc: Orcamento; nomeVersao: (v: VersaoOrcamento) => string; fmtData: (d: string | null) => string }) {
  const aditivos = orc.versoes.filter((v) => v.tipo === "aditivo" && v.ativa).sort((a, b) => a.numero - b.numero);
  if (!aditivos.length) return null;
  const t = orc.totais;
  const pct = t.contratado ? t.aditivos / t.contratado : 0;
  const porEtapa = orc.etapas.filter((e) => e.aditivos);
  const sinal = (c: number) => (c < 0 ? `−${fmtReais(-c)}` : `+${fmtReais(c)}`);
  return (
    <section className="card adt" aria-labelledby="adt-titulo">
      <div className="adt-cab">
        <h3 id="adt-titulo">Aditivos</h3>
        <span className="adt-n">{sinal(t.aditivos)}</span>
        <span className={`pill ${pct > LIMITE_ADITIVO ? "bad" : ""}`}>{(pct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% sobre o contrato</span>
      </div>
      {pct > LIMITE_ADITIVO ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          Os aditivos passam de 25% do contrato ({fmtReais(t.contratado)}): limite legal de acréscimo em obra pública, art. 65 da Lei 8.666.
        </div>
      ) : (
        <p className="mut sm" style={{ margin: "0 0 10px" }}>
          Limite legal de acréscimo em obra pública: 25% do contrato (art. 65 da Lei 8.666). Usado: {(pct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
          de 25%.
        </p>
      )}
      <ul className="adt-lista">
        {aditivos.map((v) => (
          <li key={v.id}>
            <span>
              <b>{nomeVersao(v)}</b>
              {v.descricao ? ` · ${v.descricao}` : ""}
              <small className="mut"> {[fmtData(v.data), `${v.itens} ${v.itens === 1 ? "item" : "itens"}`].filter(Boolean).join(" · ")}</small>
            </span>
            <span className="num">{sinal(v.total)}</span>
          </li>
        ))}
      </ul>
      {porEtapa.length ? (
        <details className="adt-etapas">
          <summary>Por etapa ({porEtapa.length})</summary>
          <ul className="adt-lista">
            {porEtapa.map((e) => (
              <li key={e.etapa}>
                <span>
                  <span className="eap-num">{e.etapa}</span> {e.descricao}
                </span>
                <span className="num">{sinal(e.aditivos)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
