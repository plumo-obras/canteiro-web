/**
 * Orçamento contra o valor do contrato com o cliente (o campo `verba` da obra). A régua é de 10%: erro de orçamento de
 * 10–15% é o normal do mercado (a entrevista com engenheiro colocou "excelente" até 10%), então só passa disso é que
 * vira alerta.
 */
import { fmtReais } from "@/lib/formato";

export const REGUA_VERBA = 0.1;
/** Menos de R$ 1,00 de diferença é arredondamento (planilha × contrato assinado): bate. */
export const MARGEM_CENTAVOS = 100;

/** Diferença real mas pequena não pode virar "0% abaixo": abaixo de 1%, uma casa decimal. */
function fmtPct(d: number): string {
  const p = Math.abs(d) * 100;
  return `${p < 1 ? p.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : Math.round(p)}%`;
}

export function compararVerba(total: number, verba: number): { tom: "ok" | "atencao" | "acima"; texto: string } | null {
  if (!verba || !total) return null;
  const dif = total - verba;
  if (Math.abs(dif) < MARGEM_CENTAVOS)
    return { tom: "ok", texto: dif ? `bate com o valor do contrato (diferença de ${fmtReais(Math.abs(dif))})` : `bate com o valor do contrato (${fmtReais(verba)})` };
  const d = (total - verba) / verba;
  const pct = fmtPct(d);
  const de = `o valor do contrato (${fmtReais(verba)})`;
  if (d > REGUA_VERBA) return { tom: "acima", texto: `${pct} acima d${de}` };
  if (d > 0) return { tom: "atencao", texto: `${pct} acima d${de}, dentro da margem de ${REGUA_VERBA * 100}%` };
  return { tom: "ok", texto: `${pct} abaixo d${de}` };
}

export function ComparaVerba({ total, verba }: { total: number; verba: number }) {
  const c = compararVerba(total, verba);
  if (!c) return verba ? null : <small>Sem valor do contrato informado para comparar.</small>;
  return <small className={`verba-${c.tom}`}>{c.texto}</small>;
}

/** A versão curta, para a pílula ao lado do número: "8% acima do contrato", "3% abaixo do contrato". */
export function tagVerba(total: number, verba: number): { texto: string; tom: "ok" | "atencao" | "acima" } | null {
  const c = compararVerba(total, verba);
  if (!c) return null;
  if (Math.abs(total - verba) < MARGEM_CENTAVOS) return { texto: "bate com o contrato", tom: "ok" };
  const pct = fmtPct((total - verba) / verba);
  return { texto: total > verba ? `${pct} acima do contrato` : `${pct} abaixo do contrato`, tom: c.tom };
}
