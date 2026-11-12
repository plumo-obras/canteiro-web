"use client";
/**
 * O cronograma de barras (Gantt), no desenho do protótipo: à esquerda o nome da etapa, "medido de previsto" e o selo
 * da situação; à direita a barra prevista (azul) do primeiro ao último mês com %, com o medido por dentro (ocre); uma
 * linha ocre no dia de hoje e, no pé, o total previsto de cada mês. A situação vale no mês da última medição. O filtro
 * "Mostrar" vem de fora (fica na barra da tela, ao lado das vistas). Clicar no nome abre a gaveta com a etapa mês a mês.
 * No celular o Gantt não cabe: vira a lista "Agora / Próximas / Todas", cada etapa com a barra do feito e um risco no
 * previsto até hoje.
 * Os números vêm da API (percentuais, medido, mensal); a tela só soma o previsto da etapa até o mês de referência.
 */
import { useMemo, useState } from "react";
import type { Cronograma, EtapaCronograma } from "@/lib/contrato";
import { fmtMes, fmtMesLongo, fmtPct, indiceDoMes, barraDaEtapa, intervaloEtapa, listaMeses, situacaoEtapa, valoresMes, type Situacao } from "@/lib/cronograma";
import { fmtReais } from "@/lib/formato";
import { Drawer } from "../Dialogo";
import { Icone } from "../Icone";
import { useCelular } from "../midia";
import c from "./cronograma.module.css";

const ROTULO: Record<Situacao, string> = { concluida: "concluída", em_dia: "em dia", atrasada: "atrasada", nao_comecou: "não começou" };
/** O selo da linha do Gantt: "em dia" com algo andando é "em andamento", como se fala na obra. */
const SELO: Record<Situacao, { texto: string; classe: string }> = {
  concluida: { texto: "concluída", classe: "ok" },
  em_dia: { texto: "em andamento", classe: "warn" },
  atrasada: { texto: "atrasada", classe: "bad" },
  nao_comecou: { texto: "não começou", classe: c.neutro! },
};
const NOMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * Rótulo do mês no cabeçalho do Gantt: "nov", "dez", "jan/27" (o ano só no primeiro mês e em janeiro, para não
 * repetir). Em cronograma longo, um mês sim, outro não (o primeiro e janeiro sempre aparecem, porque carregam o ano).
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

const mesDeHoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date());

/** "38 mil" na linha do total: a coluna do mês é estreita, e o valor cheio fica no title. */
export function fmtMil(centavos: number): string {
  const r = centavos / 100;
  if (Math.abs(r) >= 1_000_000) return `${(r / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(r) >= 1_000) return `${Math.round(r / 1_000).toLocaleString("pt-BR")} mil`;
  return r ? r.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—";
}

export function Gantt({ crono, filtro = "todas", conversar }: { crono: Cronograma; filtro?: FiltroGantt; conversar?: () => void }) {
  const celular = useCelular();
  const meses = useMemo(() => listaMeses(crono.inicio!, crono.meses), [crono.inicio, crono.meses]);
  const hojeIdx = indiceDoMes(crono.inicio, mesDeHoje());
  const hojeNaGrade = hojeIdx !== null && hojeIdx >= 0 && hojeIdx < meses.length ? hojeIdx : null;
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

  if (celular)
    return (
      <section aria-label="Etapas">
        <ListaCelular todas={todas} meses={meses} abrir={setAberta} conversar={conversar} />
        {aberta ? <GavetaEtapa crono={crono} linha={aberta} meses={meses} fechar={() => setAberta(null)} /> : null}
      </section>
    );

  const n = meses.length;
  const alternar = n > 14;
  const pct = (x: number) => `${((x / n) * 100).toFixed(3)}%`;
  const celulas = meses.map((m) => <span key={m} className={c.gCel} />);
  const mensal = crono.mensal.slice(0, n);
  return (
    <section aria-label="Etapas no tempo">
      <div className={c.gantt}>
        <div className={c.gGrade} style={{ "--n": n } as React.CSSProperties}>
          {/* a linha de hoje atravessa a grade toda: posicionada sobre a área dos meses, no dia do mês */}
          {hojeNaGrade !== null ? (
            <span
              className={c.gHoje}
              style={{ left: `calc(var(--nomeW) + (100% - var(--nomeW)) * ${((hojeNaGrade + fracaoDoMes()) / n).toFixed(4)})` }}
              aria-hidden="true"
            />
          ) : null}
          <div className={`${c.gLinha} ${c.gCab}`}>
            <span className={`${c.meta} ${c.gNome}`}>Etapa</span>
            <span className={c.gMeses}>
              {meses.map((m, i) => (
                <span key={m} className={`${c.meta} ${c.gMes}`} aria-label={fmtMesLongo(m)}>
                  {rotuloMesGantt(m, i, alternar)}
                </span>
              ))}
            </span>
          </div>
          {linhas.map((l) => (
            <div key={l.etapa} className={c.gLinha}>
              <div className={c.gNome}>
                <button type="button" className={c.gNomeBt} title={`${l.descricao} · ${fmtReais(l.atual)}`} onClick={() => setAberta(l)}>
                  {l.etapa} · {l.descricao}
                </button>
                <span className={c.gConta}>
                  <span className={c.meta}>{contaDaEtapa(l)}</span>
                  <span className={`pill ${c.selo} ${SELO[l.situacao].classe}`}>{SELO[l.situacao].texto}</span>
                </span>
              </div>
              <div className={c.gMeses}>
                {celulas}
                {l.barra ? (
                  <span
                    className={c.gBarra}
                    style={{ left: pct(l.barra.de), width: pct(l.barra.ate - l.barra.de + 1) }}
                    title={`${fmtMes(meses[l.barra.de]!)} → ${fmtMes(meses[l.barra.ate]!)} · medido ${fmtPct(l.medido_acumulado)}`}
                  >
                    {l.barra.medida ? <span className={c.gMedido} style={{ display: "block", width: `${l.barra.medida * 100}%` }} /> : null}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
          {!linhas.length ? <p className={`${c.meta} ${c.gVazio}`}>{VAZIO[filtro]}</p> : null}
          <div className={`${c.gLinha} ${c.gTotal}`}>
            <span className={`${c.meta} ${c.gNome}`}>Total do mês</span>
            <span className={c.gMeses}>
              {mensal.map((m) => (
                <span key={m.mes} title={`${fmtMesLongo(m.mes)}: previsto ${fmtReais(m.previsto)} (${fmtPct(m.pct_previsto_acumulado)} acumulado)${m.medido !== null ? `, medido ${fmtReais(m.medido)}` : ""}`}>
                  {fmtMil(m.previsto)}
                </span>
              ))}
            </span>
          </div>
        </div>
      </div>
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

/**
 * No celular, no lugar do Gantt: a legenda, o filtro e uma etapa por linha com a barra do feito (ocre) e um risco no
 * previsto até hoje. Abre em "Agora"; se nada está andando, em "Todas". Tocar na etapa abre a mesma gaveta do Gantt.
 */
function ListaCelular({ todas, meses, abrir, conversar }: { todas: LinhaGantt[]; meses: string[]; abrir: (l: LinhaGantt) => void; conversar?: () => void }) {
  const [mostrar, setMostrar] = useState<MostrarCelular>(() => (filtroCelular(todas, "agora").length ? "agora" : "todas"));
  const itens = filtroCelular(todas, mostrar);
  const quando = (l: LinhaGantt) => (l.intervalo ? `${NOMES[Number(meses[l.intervalo.de]!.slice(5, 7)) - 1]} → ${NOMES[Number(meses[l.intervalo.ate]!.slice(5, 7)) - 1]}` : "fora do cronograma");
  const selo = (l: LinhaGantt) =>
    l.situacao === "nao_comecou" && l.intervalo ? { texto: `começa ${NOMES[Number(meses[l.intervalo.de]!.slice(5, 7)) - 1]}`, classe: c.neutro! } : SELO[l.situacao];
  return (
    <>
      <p className={c.celLegenda}>
        <span>
          <i className={c.legMed} aria-hidden="true" /> feito
        </span>
        <span>
          <i className={c.legRisco} aria-hidden="true" /> previsto até hoje
        </span>
      </p>
      <div className={`seg ${c.celSeg}`} role="group" aria-label="Mostrar">
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
      {itens.length ? (
        <ul className={c.celLista}>
          {itens.map((l) => (
            <li key={l.etapa}>
              <button type="button" className={c.celItem} onClick={() => abrir(l)}>
                <span className={c.celTopo}>
                  <span className={c.celNome}>
                    {l.etapa} · {l.descricao}
                  </span>
                  <span className={`pill ${c.selo} ${selo(l).classe}`}>{selo(l).texto}</span>
                </span>
                <span className={c.celBarra} aria-hidden="true">
                  <span className={c.celFeito} style={{ width: `${Math.min(100, l.medido_acumulado / 100)}%` }} />
                  {l.previstoRef > 0 ? <span className={c.celRisco} style={{ left: `${Math.min(100, l.previstoRef / 100)}%` }} /> : null}
                </span>
                <span className={c.meta}>
                  {fmtPct(l.medido_acumulado)} feito · {fmtPct(l.previstoRef)} previsto · {quando(l)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={c.meta}>{mostrar === "proximas" ? VAZIO.proximas : mostrar === "agora" ? "Nenhuma etapa andando agora." : VAZIO.todas}</p>
      )}
      {conversar ? (
        <button type="button" className={`btn amb ${c.celPlumo}`} onClick={conversar}>
          <Icone nome="spark" tam={16} />
          Contar ao Plumo como está a obra
        </button>
      ) : null}
      <p className={c.celNota}>
        Ele propõe a medição; você confirma.
        <br />O Gantt completo fica no computador.
      </p>
    </>
  );
}

/** "85% de 90% previsto": o medido contra o previsto até o mês de referência. */
function contaDaEtapa(l: LinhaGantt) {
  return `${fmtPct(l.medido_acumulado)} de ${fmtPct(l.previstoRef)} previsto`;
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

