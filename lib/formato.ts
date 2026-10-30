/**
 * Formatação pt-BR a partir de inteiros (milésimos e centavos), como canteiro_dominio.tipos.fmt_qtd/fmt_reais.
 * Só aritmética inteira: passar por float faria 0,1 + 0,2 aparecer na tela de estoque.
 */

const milhar = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** 1500 → "1,5"; 2760000 → "2.760"; -500 → "-0,5". */
export function fmtQtd(m: number): string {
  const sinal = m < 0 ? "-" : "";
  const a = Math.abs(Math.trunc(m));
  const frac = String(a % 1000).padStart(3, "0").replace(/0+$/, "");
  return `${sinal}${milhar(Math.floor(a / 1000))}${frac ? "," + frac : ""}`;
}

/** 129990 → "R$ 1.299,90". */
export function fmtReais(c: number): string {
  const sinal = c < 0 ? "-" : "";
  const a = Math.abs(Math.trunc(c));
  return `${sinal}R$ ${milhar(Math.floor(a / 100))},${String(a % 100).padStart(2, "0")}`;
}

/** Quantidade com a unidade do insumo: "2.760 un", "1,5 m³". */
export const fmtQtdUn = (m: number, un: string) => (un ? `${fmtQtd(m)} ${un}` : fmtQtd(m));

// O canteiro e o escritório estão no mesmo fuso; fixar evita que um navegador em UTC mostre outra hora.
const FUSO = "America/Sao_Paulo";
const fHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO });
const fDia = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: FUSO });

/** "10:32" */
export const fmtHora = (iso: string | Date) => fHora.format(new Date(iso));
/** "30/10 10:32" */
export const fmtDiaHora = (iso: string | Date) => `${fDia.format(new Date(iso))} ${fHora.format(new Date(iso))}`;
