"use client";
/**
 * Previsto × realizado por etapa (Fase 3): as contas e a barra que a lista única de etapas (ListaEtapas) usa, o CSV e o
 * bloco de aditivos. Os números vêm somados da API (GET /obras/{id}/orcamento); o saldo e o % de aditivo também vêm prontos;
 * aqui só se ordena, se calcula o % comprometido da barra e se desenha. Nenhuma soma de pedido é refeita.
 */
import type { EtapaOrcamento, Gasto, Orcamento, VersaoOrcamento } from "@/lib/contrato";
import { centavosCsv, gerarCsv } from "@/lib/csv";
import { fmtReais } from "@/lib/formato";
import { Icone } from "../Icone";

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
    saldo: e.saldo,
    pct: pctDe(e.comprometido, e.atual),
  }));
  const s = orc.totais.sem_etapa;
  if (s && (s.cotando || s.comprometido || s.realizado))
    ls.push({ etapa: "", descricao: "Sem etapa", atual: 0, ...s, saldo: -s.comprometido, pct: pctDe(s.comprometido, 0), semEtapa: true });
  return ls;
}

/** Maior desvio primeiro: o que já comprometeu mais do orçado da etapa (estouro no topo, em vermelho). */
export const porDesvio = (a: LinhaAndamento, b: LinhaAndamento) => b.pct - a.pct || b.comprometido - a.comprometido;

/** "R$ 24.250": a lista do celular arredonda ao real; o detalhe mostra os centavos. */
export const reaisInteiros = (c: number) => fmtReais(Math.round(c / 100) * 100).replace(/,00$/, "");

export const fmtPct = (p: number) => (p === Infinity ? "sem orçado" : `${(p * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

export function csvAndamento(orc: Orcamento): string {
  const ls = linhasAndamento(orc);
  const t = orc.totais;
  const pct = (p: number) => (p === Infinity ? "" : (p * 100).toFixed(1).replace(".", ","));
  return gerarCsv([
    ["Etapa", "Descrição", "Orçado atual", "Em cotação", "Comprometido", "Realizado", "Saldo a comprometer", "% comprometido"],
    ...ls.map((l) => [l.etapa, l.descricao, centavosCsv(l.atual), centavosCsv(l.cotando), centavosCsv(l.comprometido), centavosCsv(l.realizado), centavosCsv(l.saldo), pct(l.pct)]),
    ["", "Total", centavosCsv(t.atual), centavosCsv(t.cotando), centavosCsv(t.comprometido), centavosCsv(t.realizado), centavosCsv(t.saldo), pct(pctDe(t.comprometido, t.atual))],
  ]);
}

/** Barra fina: o comprometido (claro) e o realizado (cheio) contra o orçado (o risco vertical). */
export function Barra({ l }: { l: LinhaAndamento }) {
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

// A versão na chave faz a nota reaparecer quando o texto muda (quem já tinha dito "Entendi" lê a nova).
/** Aditivos para o diretor: quanto somou ao contrato, o % e o alerta do limite legal, por aditivo e por etapa. */
export function BlocoAditivos({ orc, nomeVersao, fmtData }: { orc: Orcamento; nomeVersao: (v: VersaoOrcamento) => string; fmtData: (d: string | null) => string }) {
  const aditivos = orc.versoes.filter((v) => v.tipo === "aditivo" && v.ativa).sort((a, b) => a.numero - b.numero);
  if (!aditivos.length) return null;
  const t = orc.totais;
  const pct = (t.aditivos_pct ?? 0) / 10000;
  const porEtapa = orc.etapas.filter((e) => e.aditivos);
  const sinal = (c: number) => (c < 0 ? `−${fmtReais(-c)}` : `+${fmtReais(c)}`);
  return (
    <section className="card adt" aria-labelledby="adt-titulo">
      <div className="adt-cab">
        <h3 id="adt-titulo">Aditivos</h3>
        <span className="adt-n">{sinal(t.aditivos)}</span>
        <span className={`pill ${pct > LIMITE_ADITIVO ? "bad" : ""}`}>{(pct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% sobre o orçamento inicial</span>
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
