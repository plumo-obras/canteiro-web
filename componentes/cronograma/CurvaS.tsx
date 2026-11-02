/**
 * Curva S: previsto acumulado × medido acumulado, em % da obra, mês a mês. SVG à mão (uma polilinha por série): o
 * gráfico é simples demais para justificar uma biblioteca de gráficos no pacote do app.
 */
import type { MesCronograma } from "@/lib/contrato";
import { fmtMes, fmtPct } from "@/lib/cronograma";

const L = 720;
const A = 240;
const M = { e: 44, d: 16, t: 14, b: 30 };

export function CurvaS({ mensal }: { mensal: MesCronograma[] }) {
  if (!mensal.length) return null;
  const n = mensal.length;
  const x = (i: number) => M.e + (n === 1 ? (L - M.e - M.d) / 2 : (i * (L - M.e - M.d)) / (n - 1));
  const y = (c: number) => M.t + (A - M.t - M.b) * (1 - Math.min(10000, Math.max(0, c)) / 10000);
  const pts = (vs: (number | null)[]) =>
    vs
      .map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .join(" ");
  const previsto = mensal.map((m) => m.pct_previsto_acumulado);
  const medido = mensal.map((m) => m.pct_medido_acumulado);
  const ultimo = medido.reduce<number>((u, v, i) => (v === null ? u : i), -1);
  // Rótulo de mês a cada k meses, para não encavalar em cronograma longo.
  const k = Math.max(1, Math.ceil(n / 12));
  const desc =
    ultimo >= 0
      ? `Em ${fmtMes(mensal[ultimo]!.mes)}: previsto ${fmtPct(previsto[ultimo]!)}, medido ${fmtPct(medido[ultimo]!)}.`
      : "Ainda sem medição.";
  return (
    <figure className="curva-s">
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label={`Curva S: previsto acumulado e medido acumulado. ${desc}`}>
        {[0, 2500, 5000, 7500, 10000].map((c) => (
          <g key={c}>
            <line className="cs-grade" x1={M.e} x2={L - M.d} y1={y(c)} y2={y(c)} />
            <text className="cs-rot" x={M.e - 8} y={y(c) + 4} textAnchor="end">
              {c / 100}%
            </text>
          </g>
        ))}
        {mensal.map((m, i) =>
          i % k === 0 || i === n - 1 ? (
            <text key={m.mes} className="cs-rot" x={x(i)} y={A - 10} textAnchor="middle">
              {fmtMes(m.mes)}
            </text>
          ) : null,
        )}
        <polyline className="cs-prev" points={pts(previsto)} />
        {ultimo >= 0 ? <polyline className="cs-med" points={pts(medido)} /> : null}
        {medido.map((v, i) => (v === null ? null : <circle key={i} className="cs-ponto" cx={x(i)} cy={y(v)} r={3.5} />))}
      </svg>
      <figcaption className="cs-leg">
        <span>
          <i className="cs-prev" /> previsto acumulado
        </span>
        <span>
          <i className="cs-med" /> medido acumulado
        </span>
        <span className="mut">{desc}</span>
      </figcaption>
    </figure>
  );
}
