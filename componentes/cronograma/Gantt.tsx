"use client";
/**
 * O cronograma de barras (Gantt): uma linha por etapa, com a barra do primeiro ao último mês previsto (cada mês um
 * segmento, mais forte quanto maior o % daquele mês) e, por cima, o medido em ocre, a mesma cor da curva S. À direita,
 * a situação no mês da última medição ("hoje"): concluída, em dia, atrasada ou não começou. Todos os meses cabem na
 * largura (colunas em fração), sem rolagem escondida. O filtro "Mostrar" vem de fora (fica na barra da tela, ao lado
 * das vistas). No celular o Gantt não cabe: vira a lista "Agora / Próximas / Todas", cada etapa com a barra do feito e
 * um risco no previsto até hoje.
 * Os números vêm da API (percentuais, medido, mensal); a tela só soma o previsto da etapa até o mês de referência.
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Cronograma, EtapaCronograma } from "@/lib/contrato";
import {
  fmtMes,
  fmtMesLongo,
  fmtPct,
  indiceDoMes,
  barraDaEtapa,
  intervaloEtapa,
  listaMeses,
  situacaoEtapa,
  valoresMes,
  type Situacao,
} from "@/lib/cronograma";
import { fmtReais } from "@/lib/formato";
import { Drawer } from "../Dialogo";
import { Icone } from "../Icone";
import { useCelular } from "../midia";
import c from "./cronograma.module.css";

const ROTULO: Record<Situacao, string> = { concluida: "concluída", em_dia: "em dia", atrasada: "atrasada", nao_comecou: "não começou" };
const NOMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * Rótulo do mês no cabeçalho do Gantt: "nov", "dez", "jan/27" (o ano só no primeiro mês e em janeiro, para não
 * repetir). Se não couber, um mês sim, outro não (o primeiro e janeiro sempre aparecem, porque carregam o ano).
 */
export function rotuloMesGantt(m: string, i: number, alternar: boolean): string {
  const mes = Number(m.slice(5, 7));
  const comAno = i === 0 || mes === 1;
  if (alternar && !comAno && i % 2 === 1) return "";
  return comAno ? `${NOMES[mes - 1]}/${m.slice(2, 4)}` : NOMES[mes - 1]!;
}

interface LinhaGantt extends EtapaCronograma {
  situacao: Situacao;
  previstoRef: number;
  falta: number;
  intervalo: { de: number; ate: number } | null;
  barra: ReturnType<typeof barraDaEtapa>;
}

export type FiltroGantt = "todas" | "andamento" | "atrasadas" | "proximas";
const VAZIO: Record<FiltroGantt, string> = {
  todas: "Nenhuma etapa no cronograma.",
  atrasadas: "Nenhuma etapa atrasada.",
  andamento: "Nenhuma etapa em andamento.",
  proximas: "Nenhuma etapa por começar.",
};

/** As etapas que entram no Gantt, com a situação no mês da última medição. */
function linhasDoGantt(crono: Cronograma): LinhaGantt[] {
  const ref = indiceDoMes(crono.inicio, crono.prazo.mes_referencia);
  return crono.etapas
    .filter((e) => e.percentuais.some(Boolean) || e.medido_acumulado)
    .map((e) => {
      const s = situacaoEtapa(e.percentuais, e.medido_acumulado, ref);
      return { ...e, situacao: s.situacao, previstoRef: s.previsto, falta: s.falta, intervalo: intervaloEtapa(e.percentuais), barra: barraDaEtapa(e.percentuais, e.medido_acumulado) };
    });
}

/** O dia de hoje como fração do mês (0 a 1), no fuso da obra: põe a marca de hoje no ponto certo da coluna do mês. */
export function fracaoDoMes(agora = new Date()): number {
  const [a, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora).split("-").map(Number);
  const dias = new Date(Date.UTC(a!, m!, 0)).getUTCDate();
  return (d! - 0.5) / dias;
}

export function Gantt({ crono, filtro = "todas", conversar }: { crono: Cronograma; filtro?: FiltroGantt; conversar?: () => void }) {
  const celular = useCelular();
  const meses = useMemo(() => listaMeses(crono.inicio!, crono.meses), [crono.inicio, crono.meses]);
  const ref = indiceDoMes(crono.inicio, crono.prazo.mes_referencia);
  const refNaGrade = ref !== null && ref >= 0 && ref < meses.length ? ref : null;
  // "Referência" é o mês da última medição; "hoje" é o mês do calendário. Se coincidem, uma linha só.
  const hojeIdx = indiceDoMes(crono.inicio, new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date()));
  const hojeNaGrade = hojeIdx !== null && hojeIdx >= 0 && hojeIdx < meses.length ? hojeIdx : null;
  const [dica, setDica] = useState<{ texto: string; x: number; y: number } | null>(null);
  const [aberta, setAberta] = useState<LinhaGantt | null>(null);

  const todas: LinhaGantt[] = useMemo(() => linhasDoGantt(crono), [crono]);
  const linhas = useMemo(() => {
    const f = todas.filter((l) =>
      filtro === "atrasadas"
        ? l.situacao === "atrasada"
        : filtro === "andamento"
          ? l.situacao !== "concluida" && (l.medido_acumulado > 0 || l.previstoRef > 0)
          : filtro === "proximas"
            ? l.situacao === "nao_comecou"
            : true,
    );
    // Atrasadas sempre no topo (a maior falta primeiro); o resto na ordem da planilha.
    const atr = f.filter((l) => l.situacao === "atrasada").sort((a, b) => b.falta - a.falta);
    return [...atr, ...f.filter((l) => l.situacao !== "atrasada")];
  }, [todas, filtro]);
  // Se o rótulo do mês não cabe na coluna (cronograma longo ou texto maior, como no portal), vira a inicial.
  const cab = useRef<HTMLSpanElement>(null);
  const [encolher, setEncolher] = useState(false);
  useLayoutEffect(() => {
    const el = cab.current;
    if (!el) return;
    const medir = () => {
      if (encolher) return;
      const sobra = [...el.querySelectorAll<HTMLElement>(".g-mes")].some((m) => m.scrollWidth > m.clientWidth + 1);
      if (sobra) setEncolher(true);
    };
    medir();
    const ro = new ResizeObserver(() => {
      setEncolher(false);
      requestAnimationFrame(medir);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [encolher, meses.length]);
  const alternar = encolher || meses.length > 14;
  const rotuloMes = (m: string, i: number) => rotuloMesGantt(m, i, alternar);
  const grade = { "--n": meses.length } as React.CSSProperties;
  // O balão é fixo na janela: rolar ou tocar fora dele o apaga (senão fica parado no lugar errado).
  useLayoutEffect(() => {
    if (!dica) return;
    const sumir = () => setDica(null);
    const fora = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest?.(".g-alvo")) setDica(null);
    };
    addEventListener("scroll", sumir, true);
    document.addEventListener("pointerdown", fora, true);
    return () => {
      removeEventListener("scroll", sumir, true);
      document.removeEventListener("pointerdown", fora, true);
    };
  }, [dica]);

  const mostrarDica = (e: React.MouseEvent | React.FocusEvent | React.PointerEvent, l: LinhaGantt, i: number) => {
    const alvo = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const p = l.percentuais[i] ?? 0;
    setDica({
      texto: `${l.descricao} · ${fmtMes(meses[i]!)}: ${p ? `${fmtPct(p)} previsto (${fmtReais(valoresMes(l.atual, l.percentuais)[i]!)})` : "sem previsão"}${l.medido_acumulado ? ` · medido ${fmtPct(l.medido_acumulado)} da etapa` : ""}`,
      // coordenadas da janela: o balão vai num portal fixo e é empurrado para dentro da tela (antes cortava à esquerda)
      x: alvo.left + alvo.width / 2,
      y: alvo.top,
    });
  };

  if (celular)
    return (
      <section aria-label="Etapas">
        <ListaCelular todas={todas} meses={meses} abrir={setAberta} conversar={conversar} />
        {aberta ? <GavetaEtapa crono={crono} linha={aberta} meses={meses} fechar={() => setAberta(null)} /> : null}
      </section>
    );

  return (
    <section aria-label="Etapas no tempo">
      <div className="gantt" style={grade} onMouseLeave={() => setDica(null)}>
        <div className="g-l g-head">
          <span className="g-nome">Etapa</span>
          <span className="g-meses" ref={cab}>
            {meses.map((m, i) => (
              <span key={m} className={`g-mes${i === refNaGrade ? " ref" : ""}${i === hojeNaGrade ? " hoje" : ""}`} aria-label={fmtMesLongo(m)}>
                {rotuloMes(m, i)}
              </span>
            ))}
          </span>
          <span className="g-sit g-leg">
            {refNaGrade !== null ? (
              <span>
                <i className="g-ref-leg" aria-hidden="true" /> referência {fmtMes(crono.prazo.mes_referencia)}
              </span>
            ) : null}
            {hojeNaGrade !== null && hojeNaGrade !== refNaGrade ? (
              <span>
                <i className="g-hoje-leg" aria-hidden="true" /> hoje
              </span>
            ) : null}
            {refNaGrade === null && hojeNaGrade === null ? "Situação" : null}
          </span>
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
              {/* hoje no dia certo dentro do mês (margem em % da coluna), não no começo dele */}
              {hojeNaGrade !== null && hojeNaGrade !== refNaGrade ? (
                <span className="g-cal" style={{ gridColumn: hojeNaGrade + 1, marginLeft: `${(fracaoDoMes() * 100).toFixed(1)}%` }} aria-hidden="true" />
              ) : null}
              {/* Uma barra contínua do início ao fim da etapa, com o medido por cima, mais escuro. O % de cada mês não pinta
                  a barra: fica no hover/toque (alvo transparente por mês). Mês sem previsão no meio afina a barra. */}
              {l.barra ? (
                <span className="g-barra" style={{ gridColumn: `${l.barra.de + 1} / ${l.barra.ate + 2}` }}>
                  {l.barra.medida ? (
                    <span className="g-barra-med" style={{ width: `${l.barra.medida * 100}%` }} />
                  ) : null}
                </span>
              ) : null}
              {l.intervalo
                ? meses.slice(l.intervalo.de, l.intervalo.ate + 1).map((m, j) => {
                    const i = l.intervalo!.de + j;
                    const p = l.percentuais[i] ?? 0;
                    return (
                      <span
                        key={m}
                        className={`g-alvo${p ? "" : " pausa"}`}
                        style={{ gridColumn: i + 1 }}
                        role="button"
                        tabIndex={-1}
                        aria-label={`${l.descricao}, ${fmtMesLongo(m)}: ${p ? `${fmtPct(p)} previsto` : "sem previsão"}`}
                        onPointerEnter={(e) => mostrarDica(e, l, i)}
                        onMouseEnter={(e) => mostrarDica(e, l, i)}
                        onClick={(e) => mostrarDica(e, l, i)}
                      />
                    );
                  })
                : null}
            </span>
            <span className="g-sit">
              {l.situacao === "atrasada" || l.situacao === "concluida" ? <span className={`g-chip c-${l.situacao}`}>{ROTULO[l.situacao]}</span> : null}
              <span className="g-conta">{contaDaEtapa(l)}</span>
            </span>
          </div>
        ))}
        {!linhas.length ? <p className="mut sm g-vazio">{VAZIO[filtro]}</p> : null}
        <TotalGantt crono={crono} refNaGrade={refNaGrade} />
        {dica ? <Dica {...dica} /> : null}
      </div>

      <p className={`mut sm ${c.legenda}`}>
        <span>
          <i className={c.legPrev} aria-hidden="true" /> previsto
        </span>
        <span>
          <i className={c.legMed} aria-hidden="true" /> medido
        </span>
        {refNaGrade !== null ? (
          <span>
            <i className={c.legRef} aria-hidden="true" /> última medição
          </span>
        ) : null}
        {hojeNaGrade !== null && hojeNaGrade !== refNaGrade ? (
          <span>
            <i className={c.legHoje} aria-hidden="true" /> hoje
          </span>
        ) : null}
        <span>Clique no nome da etapa para ver mês a mês.</span>
      </p>

      {aberta ? <GavetaEtapa crono={crono} linha={aberta} meses={meses} fechar={() => setAberta(null)} /> : null}
    </section>
  );
}

export type MostrarCelular = "agora" | "proximas" | "todas";

/** O filtro do celular: Agora (atrasadas e em andamento, as atrasadas primeiro), Próximas (não começaram) ou Todas. */
export function filtroCelular<T extends { situacao: Situacao; falta: number }>(ls: T[], k: MostrarCelular): T[] {
  if (k === "proximas") return ls.filter((l) => l.situacao === "nao_comecou");
  if (k === "todas") return ls;
  const atr = ls.filter((l) => l.situacao === "atrasada").sort((a, b) => b.falta - a.falta);
  return [...atr, ...ls.filter((l) => l.situacao === "em_dia")];
}

const SELO_CEL: Record<Situacao, string> = { concluida: "ok", em_dia: "ok", atrasada: "bad", nao_comecou: "" };

/**
 * No celular, no lugar do Gantt: uma lista por etapa com a barra do feito (ocre) e um risco no previsto até hoje. Abre
 * em "Agora"; se nada está andando, em "Todas". Tocar na etapa abre a mesma gaveta do Gantt.
 */
function ListaCelular({ todas, meses, abrir, conversar }: { todas: LinhaGantt[]; meses: string[]; abrir: (l: LinhaGantt) => void; conversar?: () => void }) {
  const [mostrar, setMostrar] = useState<MostrarCelular>(() => (filtroCelular(todas, "agora").length ? "agora" : "todas"));
  const itens = filtroCelular(todas, mostrar);
  const quando = (l: LinhaGantt) => (l.intervalo ? `${fmtMes(meses[l.intervalo.de]!)} → ${fmtMes(meses[l.intervalo.ate]!)}` : "fora do cronograma");
  const selo = (l: LinhaGantt) =>
    l.situacao === "nao_comecou" && l.intervalo ? `começa ${fmtMes(meses[l.intervalo.de]!)}` : l.situacao === "em_dia" ? "em dia" : ROTULO[l.situacao];
  return (
    <>
      <div className={c.celTopo}>
        <div className="seg seg-pq" role="group" aria-label="Mostrar">
          {(
            [
              ["agora", "Agora"],
              ["proximas", "Próximas"],
              ["todas", "Todas"],
            ] as const
          ).map(([k, r]) => (
            <button key={k} type="button" aria-pressed={mostrar === k} className={mostrar === k ? "on" : ""} onClick={() => setMostrar(k)}>
              {r}
            </button>
          ))}
        </div>
        <p className={`mut sm ${c.legenda}`}>
          <span>
            <i className={c.legMed} aria-hidden="true" /> feito
          </span>
          <span>
            <i className={c.legRisco} aria-hidden="true" /> previsto até hoje
          </span>
        </p>
      </div>
      {itens.length ? (
        <ul className={c.celLista}>
          {itens.map((l) => (
            <li key={l.etapa}>
              <button type="button" className={c.celItem} onClick={() => abrir(l)}>
                <span className={c.celCab}>
                  <span className={c.celNome}>
                    <span className="eap-num">{l.etapa}</span> {l.descricao}
                  </span>
                  <span className={`pill ${SELO_CEL[l.situacao]}`}>{selo(l)}</span>
                </span>
                <span className={c.celBarra} aria-hidden="true">
                  <span className={c.celFeito} style={{ width: `${Math.min(100, l.medido_acumulado / 100)}%` }} />
                  {l.previstoRef > 0 ? <span className={c.celRisco} style={{ left: `${Math.min(100, l.previstoRef / 100)}%` }} /> : null}
                </span>
                <span className="mut sm">
                  {fmtPct(l.medido_acumulado)} feito · {fmtPct(l.previstoRef)} previsto · {quando(l)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mut sm">{mostrar === "proximas" ? VAZIO.proximas : mostrar === "agora" ? "Nenhuma etapa andando agora." : VAZIO.todas}</p>
      )}
      {conversar ? (
        <button type="button" className={`btn amb ${c.celPlumo}`} onClick={conversar}>
          <Icone nome="spark" tam={16} />
          Contar ao Plumo como está a obra
        </button>
      ) : null}
      <p className={`mut sm ${c.celNota}`}>O Gantt completo, mês a mês, fica no computador.</p>
    </>
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
  const vsMes = valoresMes(l.atual, l.percentuais);
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
                  <td className="num">{p ? fmtReais(vsMes[i]!) : "—"}</td>
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

/** O balão do Gantt: num portal com position:fixed, acima do ponto, empurrado para caber na janela. */
function Dica({ texto, x, y }: { texto: string; x: number; y: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(8, Math.min(innerWidth - w - 8, x - w / 2));
    const top = y - h - 8 < 8 ? y + 28 : y - h - 8;
    setPos({ left, top });
  }, [texto, x, y]);
  return createPortal(
    <span ref={ref} className="g-dica" role="tooltip" style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? -9999, transform: "none" }}>
      {texto}
    </span>,
    document.body,
  );
}
