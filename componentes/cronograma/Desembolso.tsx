"use client";
/**
 * Desembolso: quanto já saiu e quanto ainda vai sair até o fim da obra, mês a mês. É a planilha que o engenheiro manda
 * ao dono na reta final. A API faz a conta (GET /obras/{id}/desembolso) e devolve dois cenários: pelo cronograma (o
 * resto empurrado pelo atraso) e no ritmo de hoje (o resto esticado pelo ritmo medido). Nenhum acerta sozinho; a tela
 * mostra a faixa entre os dois e deixa escolher qual desenhar.
 */
import { useState } from "react";
import type { Desembolso as DadosDesembolso, MesDesembolso, Obra } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { centavosCsv, gerarCsv, baixarCsv } from "@/lib/csv";
import { fmtMes, fmtMesLongo, fmtPct } from "@/lib/cronograma";
import { fmtReais } from "@/lib/formato";
import { FaixaNumeros } from "../CabecalhoPagina";
import { useCasca } from "../contexto";
import { Icone } from "../Icone";
import { useCarregar } from "../useCarregar";

export type Cenario = "ritmo" | "cronograma";

/** Os dois cenários só diferem com medição e a obra abaixo do ritmo do plano. */
export const temDoisCenarios = (d: DadosDesembolso) => d.base === "medicao" && d.termino_no_ritmo !== d.termino_projetado;

export const vaiSair = (m: MesDesembolso, c: Cenario) => (c === "ritmo" ? m.projetado_no_ritmo : m.projetado);

/** A frase do término: a faixa entre os dois cenários, ou um mês só. */
export function textoTermino(d: DadosDesembolso): string | null {
  if (!d.termino_projetado) return null;
  if (!temDoisCenarios(d)) return `Último pagamento previsto em ${fmtMesLongo(d.termino_projetado)}.`;
  return (
    `Último pagamento entre ${fmtMesLongo(d.termino_projetado)}, se a obra voltar ao ritmo do cronograma, e ` +
    `${fmtMesLongo(d.termino_no_ritmo)}, no ritmo de hoje (${fmtPct(d.ritmo_pct)} do planejado).`
  );
}

/** As ressalvas que mudam a leitura do número; cada uma só aparece quando vale. */
export function avisos(d: DadosDesembolso): string[] {
  const t = d.totais;
  const a: string[] = [];
  if (d.base === "gastos")
    a.push("Ainda sem medição: o avanço de cada etapa sai do que já foi gasto. Com as medições lançadas, a projeção passa a usar o executado e o ritmo da obra.");
  if (t.entregue_sem_pagamento > 0)
    a.push(`${fmtReais(t.entregue_sem_pagamento)} de pedidos entregues sem pagamento registrado entram como devidos neste mês.`);
  const devido = d.etapas.reduce((s, e) => s + e.devido_agora, 0);
  if (devido > 0) a.push(`${fmtReais(devido)} já foram medidos e ainda não pagos: entram como devidos neste mês.`);
  if (t.sem_mes > 0) a.push(`${fmtReais(t.sem_mes)} de etapas fora do cronograma estão no "falta sair", mas sem mês.`);
  if (d.base === "medicao" && d.atraso_meses > 0)
    a.push(`O resto do cronograma foi empurrado ${d.atraso_meses} ${d.atraso_meses === 1 ? "mês" : "meses"}, o atraso medido em ${fmtMesLongo(d.mes_referencia)}.`);
  return a;
}

export function csvDesembolso(d: DadosDesembolso): string {
  const dois = temDoisCenarios(d);
  const cab = ["Mês", "Previsto no cronograma", "Pago", ...(dois ? ["Vai sair (ritmo de hoje)", "Vai sair (cronograma)"] : ["Vai sair"])];
  const linhas = d.meses.map((m) => [
    m.mes,
    centavosCsv(m.previsto),
    centavosCsv(m.pago),
    ...(dois ? [centavosCsv(m.projetado_no_ritmo), centavosCsv(m.projetado)] : [centavosCsv(m.projetado)]),
  ]);
  const t = d.totais;
  const fim = [
    [],
    ["Já pago", centavosCsv(t.pago)],
    ["Falta sair", centavosCsv(t.falta)],
    ["Custo final projetado", centavosCsv(t.custo_final)],
    ["Orçado atual", centavosCsv(t.orcado)],
    ...(t.sem_mes ? [["Fora do cronograma (sem mês)", centavosCsv(t.sem_mes)]] : []),
  ];
  return gerarCsv([cab, ...linhas, ...fim]);
}

export function Desembolso({ obra }: { obra: Obra }) {
  const { versao } = useCasca();
  const { dado, erro } = useCarregar(() => api.desembolso(obra.id), [obra.id, versao]);
  const [cenario, setCenario] = useState<Cenario>("ritmo");
  const [tabela, setTabela] = useState(false);
  if (erro)
    return (
      <div className="aviso-erro" role="alert">
        <Icone nome="alert" tam={15} />
        Não foi possível montar o desembolso: {erro}
      </div>
    );
  if (!dado) return null;
  const t = dado.totais;
  const dois = temDoisCenarios(dado);
  const c: Cenario = dois ? cenario : "cronograma";
  const termino = textoTermino(dado);
  const notas = avisos(dado);
  const nome = obra.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

  return (
    <section className="desemb" aria-labelledby="desemb-tit">
      <h3 className="sectit" id="desemb-tit">
        Desembolso
      </h3>
      <p className="mut desemb-sub">Quanto já saiu e quanto ainda vai sair até o fim da obra.</p>
      <FaixaNumeros
        principal={{ rotulo: "Falta sair", valor: fmtReais(t.falta) }}
        itens={[
          { rotulo: "Já pago", valor: fmtReais(t.pago) },
          {
            rotulo: "Custo final projetado",
            valor: fmtReais(t.custo_final),
            // curto: a pílula não quebra linha e, no celular, "R$ 8.000,00 acima do orçado" passava da borda
            sub: `orçado ${fmtReais(t.orcado)}`,
            tag: t.desvio > 0 ? `+${fmtReais(t.desvio)}` : "no orçado",
            tom: t.desvio > 0 ? "acima" : "ok",
          },
        ]}
        rodape={termino}
      />
      {dois ? (
        <div className="seg seg-pq desemb-cen" role="radiogroup" aria-label="Cenário do gráfico">
          {(
            [
              ["ritmo", "No ritmo de hoje"],
              ["cronograma", "Se voltar ao cronograma"],
            ] as const
          ).map(([k, r]) => (
            <button key={k} type="button" role="radio" aria-checked={c === k} className={c === k ? "on" : ""} onClick={() => setCenario(k)}>
              {r}
            </button>
          ))}
        </div>
      ) : null}
      <GraficoDesembolso d={dado} cenario={c} />
      {notas.length ? (
        <ul className="desemb-notas">
          {notas.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      <div className="desemb-acoes">
        <button type="button" className="btn" aria-expanded={tabela} onClick={() => setTabela((v) => !v)}>
          {tabela ? "Esconder mês a mês" : "Ver mês a mês"}
        </button>
        <button type="button" className="btn" onClick={() => baixarCsv(`desembolso-${nome}-${dado.mes_atual}.csv`, csvDesembolso(dado))}>
          <Icone nome="planilha" tam={15} />
          Baixar planilha
        </button>
      </div>
      {tabela ? <TabelaDesembolso d={dado} cenario={c} /> : null}
    </section>
  );
}

function TabelaDesembolso({ d, cenario }: { d: DadosDesembolso; cenario: Cenario }) {
  return (
    <div className="card desemb-tab">
      <table>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col" className="num desemb-prev">
              Previsto
            </th>
            <th scope="col" className="num">
              Pago
            </th>
            <th scope="col" className="num">
              Vai sair
            </th>
          </tr>
        </thead>
        <tbody>
          {d.meses.map((m) => (
            <tr key={m.mes} className={m.mes === d.mes_atual ? "desemb-hoje" : undefined}>
              <th scope="row">{fmtMes(m.mes)}</th>
              <td className="num desemb-prev">{m.previsto ? fmtReais(m.previsto) : "—"}</td>
              <td className="num">{m.pago ? fmtReais(m.pago) : "—"}</td>
              <td className="num">{vaiSair(m, cenario) ? fmtReais(vaiSair(m, cenario)) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const L = 720;
const A = 240;
const M = { e: 92, d: 12, t: 14, b: 32 };   // margem esquerda larga: no celular o rótulo "1,2 mi" cresce

/** Barras por mês: o pago (cheio) e o que vai sair (claro), com o previsto do cronograma em tracejado. SVG à mão, como a curva S. */
function GraficoDesembolso({ d, cenario }: { d: DadosDesembolso; cenario: Cenario }) {
  const ms = d.meses;
  if (!ms.length) return null;
  const n = ms.length;
  const topo = Math.max(1, ...ms.map((m) => Math.max(m.pago + vaiSair(m, cenario), m.previsto)));
  const larg = (L - M.e - M.d) / n;
  const x = (i: number) => M.e + i * larg;
  const y = (v: number) => M.t + (A - M.t - M.b) * (1 - v / topo);
  const k = Math.max(1, Math.ceil(n / 12));
  const grade = [0, 0.5, 1].map((f) => f * topo);
  // o tracejado para no último mês do cronograma: depois dele, zero seria lido como "previsto nada"
  const ultimoPrev = ms.reduce((u, m, i) => (m.previsto ? i : u), -1);
  const prev = ms
    .slice(0, ultimoPrev + 1)
    .map((m, i) => `${(x(i) + larg / 2).toFixed(1)},${y(m.previsto).toFixed(1)}`)
    .join(" ");
  const temPrev = ms.some((m) => m.previsto);
  const fim = cenario === "ritmo" ? d.termino_no_ritmo : d.termino_projetado;
  const desc = `Desembolso por mês. Já pago ${fmtReais(d.totais.pago)}; falta sair ${fmtReais(d.totais.falta)}${fim ? `, até ${fmtMesLongo(fim)}` : ""}.`;
  const bw = Math.max(2, larg * 0.62);
  return (
    <figure className="curva-s desemb-graf">
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label={desc}>
        {grade.map((v) => (
          <g key={v}>
            <line className="cs-grade" x1={M.e} x2={L - M.d} y1={y(v)} y2={y(v)} />
            <text className="cs-rot" x={M.e - 8} y={y(v) + 4} textAnchor="end">
              {curto(v)}
            </text>
          </g>
        ))}
        {ms.map((m, i) => {
          const cx = x(i) + (larg - bw) / 2;
          const s = vaiSair(m, cenario);
          return (
            <g key={m.mes}>
              {m.pago ? <rect className="db-pago" x={cx} width={bw} y={y(m.pago)} height={y(0) - y(m.pago)} rx={1.5} /> : null}
              {s ? <rect className="db-falta" x={cx} width={bw} y={y(m.pago + s)} height={y(m.pago) - y(m.pago + s)} rx={1.5} /> : null}
              {i % k === 0 || i === n - 1 ? (
                <text className={`cs-rot${i % (k * 3) && i !== n - 1 ? " cs-sec" : ""}`} x={x(i) + larg / 2} y={A - 10} textAnchor="middle">
                  {fmtMes(m.mes)}
                </text>
              ) : null}
            </g>
          );
        })}
        {temPrev ? <polyline className="cs-prev" points={prev} /> : null}
      </svg>
      <figcaption className="cs-leg">
        <span>
          <i className="db-i db-pago" /> pago
        </span>
        <span>
          <i className="db-i db-falta" /> vai sair{cenarioTexto(d, cenario)}
        </span>
        {temPrev ? (
          <span>
            <i className="cs-prev" /> previsto no cronograma
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}

const cenarioTexto = (d: DadosDesembolso, c: Cenario) => (!temDoisCenarios(d) ? "" : c === "ritmo" ? " (no ritmo de hoje)" : " (pelo cronograma)");

/** Rótulo do eixo, sem "R$" (no celular a fonte cresce e o prefixo não cabia na margem): "250 mil", "1,2 mi". */
export function curto(c: number): string {
  const r = c / 100;
  if (r >= 1e6) return `${(r / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (r >= 1e3) return `${Math.round(r / 1e3).toLocaleString("pt-BR")} mil`;
  return String(Math.round(r));
}
