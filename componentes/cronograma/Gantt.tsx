"use client";
/**
 * O cronograma de barras (Gantt): uma linha por etapa, com a barra do primeiro ao último mês previsto (cada mês um
 * segmento, mais forte quanto maior o % daquele mês) e, por cima, o medido em ocre, a mesma cor da curva S. À direita,
 * a situação no mês da última medição ("hoje"): concluída, em dia, atrasada ou não começou. Todos os meses cabem na
 * largura (colunas em fração), sem rolagem escondida. No celular vira uma lista de cartões.
 * Os números vêm da API (percentuais, medido, mensal); a tela só soma o previsto da etapa até o mês de referência.
 */
import { useMemo, useState } from "react";
import type { Cronograma, EtapaCronograma } from "@/lib/contrato";
import {
  fmtMes,
  fmtMesLongo,
  fmtPct,
  indiceDoMes,
  intervaloEtapa,
  listaMeses,
  situacaoEtapa,
  valorDe,
  type Situacao,
} from "@/lib/cronograma";
import { fmtReais } from "@/lib/formato";
import { Drawer } from "../Dialogo";

const ROTULO: Record<Situacao, string> = { concluida: "concluída", em_dia: "em dia", atrasada: "atrasada", nao_comecou: "não começou" };
const NOMES_CURTOS = ["j", "f", "m", "a", "m", "j", "j", "a", "s", "o", "n", "d"];

interface LinhaGantt extends EtapaCronograma {
  situacao: Situacao;
  previstoRef: number;
  falta: number;
  intervalo: { de: number; ate: number } | null;
  maxPct: number;
}

type Filtro = "todas" | "atrasadas" | "andamento";
const VAZIO: Record<Filtro, string> = { todas: "Nenhuma etapa no cronograma.", atrasadas: "Nenhuma etapa atrasada.", andamento: "Nenhuma etapa em andamento." };

export function Gantt({ crono }: { crono: Cronograma }) {
  const meses = useMemo(() => listaMeses(crono.inicio!, crono.meses), [crono.inicio, crono.meses]);
  const ref = indiceDoMes(crono.inicio, crono.prazo.mes_referencia);
  const refNaGrade = ref !== null && ref >= 0 && ref < meses.length ? ref : null;
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [dica, setDica] = useState<{ texto: string; x: number; y: number } | null>(null);
  const [aberta, setAberta] = useState<LinhaGantt | null>(null);

  const todas: LinhaGantt[] = useMemo(
    () =>
      crono.etapas
        .filter((e) => e.percentuais.some(Boolean) || e.medido_acumulado)
        .map((e) => {
          const s = situacaoEtapa(e.percentuais, e.medido_acumulado, ref);
          return { ...e, situacao: s.situacao, previstoRef: s.previsto, falta: s.falta, intervalo: intervaloEtapa(e.percentuais), maxPct: Math.max(...e.percentuais, 1) };
        }),
    [crono.etapas, ref],
  );
  const linhas = useMemo(() => {
    const f = todas.filter((l) =>
      filtro === "atrasadas" ? l.situacao === "atrasada" : filtro === "andamento" ? l.situacao !== "concluida" && (l.medido_acumulado > 0 || l.previstoRef > 0) : true,
    );
    // Atrasadas sempre no topo (a maior falta primeiro); o resto na ordem da planilha.
    const atr = f.filter((l) => l.situacao === "atrasada").sort((a, b) => b.falta - a.falta);
    return [...atr, ...f.filter((l) => l.situacao !== "atrasada")];
  }, [todas, filtro]);
  const nAtrasadas = todas.filter((l) => l.situacao === "atrasada").length;
  const curto = meses.length > 14;
  const rotuloMes = (m: string) => (curto ? NOMES_CURTOS[Number(m.slice(5, 7)) - 1]! : fmtMes(m));
  const grade = { "--n": meses.length } as React.CSSProperties;

  const mostrarDica = (e: React.MouseEvent | React.FocusEvent, l: LinhaGantt, i: number) => {
    const alvo = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const caixa = (e.currentTarget as HTMLElement).closest(".gantt")!.getBoundingClientRect();
    const p = l.percentuais[i] ?? 0;
    setDica({
      texto: `${l.descricao} · ${fmtMes(meses[i]!)}: ${fmtPct(p)} previsto (${fmtReais(valorDe(l.atual, p))})`,
      x: alvo.left - caixa.left + alvo.width / 2,
      y: alvo.top - caixa.top,
    });
  };

  return (
    <section aria-labelledby="gantt-titulo">
      <div className="gantt-cab">
        <h3 className="sectit" id="gantt-titulo">
          Etapas no tempo
        </h3>
        <div className="seg seg-pq" role="radiogroup" aria-label="Filtrar etapas">
          {(
            [
              ["todas", "Todas"],
              ["atrasadas", `Atrasadas${nAtrasadas ? ` (${nAtrasadas})` : ""}`],
              ["andamento", "Em andamento"],
            ] as const
          ).map(([k, r]) => (
            <button key={k} type="button" role="radio" aria-checked={filtro === k} className={filtro === k ? "on" : ""} onClick={() => setFiltro(k)}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* desktop e tablet: a grade de barras */}
      <div className="gantt" style={grade} onMouseLeave={() => setDica(null)}>
        <div className="g-l g-head">
          <span className="g-nome">Etapa</span>
          <span className="g-meses">
            {meses.map((m, i) => (
              <span key={m} className={`g-mes${i === refNaGrade ? " hoje" : ""}`} title={fmtMesLongo(m)}>
                {i === refNaGrade ? (
                  <>
                    <small>hoje</small>
                    <b>{rotuloMes(m)}</b>
                  </>
                ) : (
                  rotuloMes(m)
                )}
              </span>
            ))}
          </span>
          <span className="g-sit">Situação em {crono.prazo.mes_referencia ? fmtMes(crono.prazo.mes_referencia) : "—"}</span>
        </div>
        {linhas.map((l) => (
          <div key={l.etapa} className={`g-l g-${l.situacao}`}>
            <button type="button" className="g-nome" title={`${l.etapa} ${l.descricao} · ${fmtReais(l.atual)}`} onClick={() => setAberta(l)}>
              <span className="g-n">
                <span className="eap-num">{l.etapa}</span> {l.descricao}
              </span>
              <small>{fmtReais(l.atual)}</small>
            </button>
            <span className="g-meses g-trilho">
              {refNaGrade !== null ? <span className="g-hoje" style={{ gridColumn: refNaGrade + 1 }} aria-hidden="true" /> : null}
              {l.intervalo
                ? meses.slice(l.intervalo.de, l.intervalo.ate + 1).map((m, j) => {
                    const i = l.intervalo!.de + j;
                    const p = l.percentuais[i] ?? 0;
                    // Opacidade pelo % do mês em relação ao maior mês da etapa: o pico da etapa é o segmento mais forte.
                    // Mês sem % no meio da etapa (pausa) fica vazado, com contorno: a barra continua legível nos dois temas.
                    const forca = p ? 0.35 + 0.6 * (p / l.maxPct) : 0;
                    return (
                      <span
                        key={m}
                        className={`g-seg${p ? "" : " pausa"}${i === l.intervalo!.de ? " ini" : ""}${i === l.intervalo!.ate ? " fim" : ""}${forca > 0.65 ? " forte" : ""}`}
                        style={{ gridColumn: i + 1, "--forca": forca } as React.CSSProperties}
                        title={`${fmtMes(m)}: ${fmtPct(p)} previsto`}
                        onMouseEnter={(e) => mostrarDica(e, l, i)}
                        onClick={(e) => mostrarDica(e, l, i)}
                      />
                    );
                  })
                : null}
              {l.intervalo && l.medido_acumulado ? (
                <span
                  className="g-medido"
                  style={{
                    gridColumn: `${l.intervalo.de + 1} / ${l.intervalo.ate + 2}`,
                    // A barra prevista ocupa a área menos 3 px em cada ponta (margem dos segmentos ini/fim): o medido usa a mesma
                    // régua, para 100% terminar junto com a barra e nunca passar dela.
                    width: `calc((100% - 6px) * ${Math.min(1, l.medido_acumulado / 10000)})`,
                  }}
                  title={`Medido: ${fmtPct(l.medido_acumulado)} da etapa`}
                />
              ) : null}
            </span>
            <span className="g-sit">
              {l.situacao === "atrasada" || l.situacao === "concluida" ? <span className={`g-chip c-${l.situacao}`}>{ROTULO[l.situacao]}</span> : null}
              <span className="g-conta">{contaDaEtapa(l)}</span>
            </span>
          </div>
        ))}
        {!linhas.length ? <p className="mut sm g-vazio">{VAZIO[filtro]}</p> : null}
        <TotalGantt crono={crono} refNaGrade={refNaGrade} />
        {dica ? (
          <span className="g-dica" role="tooltip" style={{ left: dica.x, top: dica.y }}>
            {dica.texto}
          </span>
        ) : null}
      </div>

      {/* celular: cartões */}
      {!linhas.length ? <p className="mut sm gantt-cartoes-vazio">{VAZIO[filtro]}</p> : null}
      <ul className="gantt-cartoes">
        {linhas.map((l) => (
          <li key={l.etapa}>
            <button type="button" className={`g-cartao g-${l.situacao}`} onClick={() => setAberta(l)}>
              <span className="g-c-cab">
                <span className="g-n">
                  <span className="eap-num">{l.etapa}</span> {l.descricao}
                </span>
                {l.situacao === "atrasada" || l.situacao === "concluida" ? <span className={`g-chip c-${l.situacao}`}>{ROTULO[l.situacao]}</span> : null}
              </span>
              <span className="g-prog" aria-hidden="true">
                <span className="g-prog-prev" style={{ width: `${l.previstoRef / 100}%` }} />
                <span className="g-prog-med" style={{ width: `${l.medido_acumulado / 100}%` }} />
              </span>
              <span className="g-c-pe">
                <span>{contaDaEtapa(l)}</span>
                <span className="mut">{l.intervalo ? `${fmtMes(meses[l.intervalo.de]!)} → ${fmtMes(meses[l.intervalo.ate]!)}` : "fora do cronograma"}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {aberta ? <GavetaEtapa crono={crono} linha={aberta} meses={meses} fechar={() => setAberta(null)} /> : null}
    </section>
  );
}

/** "30% de 70% previsto" · "100% medido"; etapa que não começou não diz nada (a barra já mostra quando começa). */
function contaDaEtapa(l: LinhaGantt) {
  if (l.situacao === "concluida") return "100% medido";
  if (l.situacao === "nao_comecou") return "";
  return `${fmtPct(l.medido_acumulado)} de ${fmtPct(l.previstoRef)} previsto`;
}

/** Valor cheio, sem o "R$" (o rótulo da linha diz a moeda): o engenheiro confere centavo a centavo com a medição. */
const semRS = (c: number) => fmtReais(c).replace("R$ ", "");

/** Totais do mês, fixos embaixo: previsto (R$ e % acumulado) e medido (R$ e % acumulado). */
function TotalGantt({ crono, refNaGrade }: { crono: Cronograma; refNaGrade: number | null }) {
  const mensal = crono.mensal.slice(0, crono.meses);
  return (
    <div className="g-l g-total">
      <span className="g-nome">
        <span className="g-n">Total do mês (R$)</span>
        <small>previsto · medido</small>
      </span>
      <span className="g-meses">
        {mensal.map((m, i) => (
          <span key={m.mes} className={`g-tot${i === refNaGrade ? " hoje" : ""}`} title={`${fmtMesLongo(m.mes)}: previsto ${fmtReais(m.previsto)} (${fmtPct(m.pct_previsto_acumulado)} acumulado)${m.medido !== null ? `, medido ${fmtReais(m.medido)} (${fmtPct(m.pct_medido_acumulado ?? 0)} acumulado)` : ""}`}>
            <span className="g-tot-prev">{m.previsto ? semRS(m.previsto) : "—"}</span>
            <small>{Math.round(m.pct_previsto_acumulado / 100)}%</small>
            {m.medido !== null ? (
              <>
                <span className="g-tot-med">{semRS(m.medido)}</span>
                <small className="g-tot-med">{((m.pct_medido_acumulado ?? 0) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</small>
              </>
            ) : null}
          </span>
        ))}
      </span>
      <span className="g-sit g-tot-leg">
        <span>
          <i className="g-i-prev" /> previsto no mês · acumulado
        </span>
        <span>
          <i className="g-i-med" /> medido no mês · acumulado
        </span>
      </span>
    </div>
  );
}

/** A etapa mês a mês (previsto %, R$ e acumulado, medido acumulado) e as medições que tocaram nela. */
function GavetaEtapa({ crono, linha: l, meses, fechar }: { crono: Cronograma; linha: LinhaGantt; meses: string[]; fechar: () => void }) {
  const medicoes = [...crono.medicoes].sort((a, b) => a.numero - b.numero);
  // Medido acumulado da etapa em cada mês: o da última medição até aquele mês (a etapa que não vem repete o anterior).
  const medidoEm = (mes: string) => {
    let v: number | null = null;
    for (const m of medicoes) {
      if (m.mes > mes) break;
      const e = m.etapas.find((x) => x.etapa === l.etapa);
      if (e) v = e.pct_acumulado;
      else if (v === null) v = 0;
    }
    return v;
  };
  let acc = 0;
  const tocaram = medicoes.flatMap((m) => {
    const e = m.etapas.find((x) => x.etapa === l.etapa && x.pct_periodo);
    return e ? [{ m, e }] : [];
  });
  return (
    <Drawer titulo={`${l.etapa} · ${l.descricao}`} fechar={fechar}>
      <p className="mut sm" style={{ margin: 0 }}>
        Orçado {fmtReais(l.atual)} · <span className={`g-chip c-${l.situacao}`}>{ROTULO[l.situacao]}</span> {contaDaEtapa(l)}
      </p>
      {/* tabela comum (não a lista empilhada do celular): os cabeçalhos ficam à vista, e "5% · 5%" não perde o rótulo */}
      <div className="tbl-rola tbl-g-rola" style={{ marginTop: 16 }}>
        <table className="tbl-g-etapa">
          <thead>
            <tr>
              <th scope="col">Mês</th>
              <th scope="col" className="num">
                Previsto no mês
              </th>
              <th scope="col" className="num">
                R$ no mês
              </th>
              <th scope="col" className="num">
                Previsto acumulado
              </th>
              <th scope="col" className="num">
                Medido acumulado
              </th>
            </tr>
          </thead>
          <tbody>
            {meses.map((m, i) => {
              const p = l.percentuais[i] ?? 0;
              acc += p;
              const med = crono.prazo.mes_referencia && m <= crono.prazo.mes_referencia ? medidoEm(m) : null;
              return (
                <tr key={m} className={p ? "" : "mut"}>
                  <td>{fmtMes(m)}</td>
                  <td className="num">{p ? fmtPct(p) : "—"}</td>
                  <td className="num">{p ? fmtReais(valorDe(l.atual, p)) : "—"}</td>
                  <td className="num">{acc ? fmtPct(acc) : "—"}</td>
                  <td className={`num${med !== null && med < acc ? " t-neg" : ""}`}>{med === null ? "" : fmtPct(med)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h3 className="sectit">Medições nesta etapa</h3>
      {tocaram.length ? (
        <ul className="card lista med-lista">
          {tocaram.map(({ m, e }) => (
            <li key={m.id}>
              <div className="med-t">
                <b>
                  {m.numero}ª medição · {fmtMesLongo(m.mes)}
                </b>
                <div className="mut sm">
                  +{fmtPct(e.pct_periodo)} no mês · {fmtPct(e.pct_acumulado)} acumulado
                </div>
              </div>
              <span className="num">{fmtReais(e.valor_periodo)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mut sm">Nenhuma medição avançou esta etapa ainda.</p>
      )}
    </Drawer>
  );
}
