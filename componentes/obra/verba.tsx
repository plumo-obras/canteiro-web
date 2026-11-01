/**
 * Orçamento contra a verba do dono. A régua é de 10%: erro de orçamento de 10–15% é o normal do mercado (a
 * entrevista com engenheiro colocou "excelente" até 10%), então só passa disso é que vira alerta.
 */
import { fmtReais } from "@/lib/formato";

export const REGUA_VERBA = 0.1;

export function compararVerba(total: number, verba: number): { tom: "ok" | "atencao" | "acima"; texto: string } | null {
  if (!verba || !total) return null;
  const d = (total - verba) / verba;
  const pct = `${Math.round(Math.abs(d) * 100)}%`;
  if (d > REGUA_VERBA) return { tom: "acima", texto: `${pct} acima da verba de ${fmtReais(verba)}` };
  if (d > 0) return { tom: "atencao", texto: `${pct} acima da verba de ${fmtReais(verba)}, dentro da margem de ${REGUA_VERBA * 100}%` };
  return { tom: "ok", texto: d === 0 ? `igual à verba de ${fmtReais(verba)}` : `${pct} abaixo da verba de ${fmtReais(verba)}` };
}

export function ComparaVerba({ total, verba }: { total: number; verba: number }) {
  const c = compararVerba(total, verba);
  if (!c) return verba ? null : <small>Sem verba informada para comparar.</small>;
  return <small className={`verba-${c.tom}`}>{c.texto}</small>;
}
