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

/**
 * O que a pessoa digita → milésimos. Aceita "36", "36,5", "1.200" e "1.200,5" (ponto é milhar, vírgula é decimal, como
 * se escreve no canteiro). Inteiro do começo ao fim: "0,1" vira 100, nunca 99,999… Devolve null se não for número.
 */
export function lerQtd(texto: string, { negativo = false } = {}): number | null {
  const t = texto.trim().replace(/\s/g, "").replace(/^−/, "-");
  const m = t.match(negativo ? /^(-?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,3}))?$/ : /^()(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,3}))?$/);
  if (!m) return null;
  const v = Number(m[2]!.replace(/\./g, "")) * 1000 + Number((m[3] ?? "").padEnd(3, "0") || 0);
  return Number.isSafeInteger(v) ? (m[1] ? -v : v) : null;
}

/** "1.326" ou "1.326,50" ou "R$ 1.326,50" → centavos. Null se não for valor. */
export function lerReais(texto: string): number | null {
  const t = texto.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  const m = t.match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/);
  if (!m) return null;
  const v = Number(m[1]!.replace(/\./g, "")) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
  return Number.isSafeInteger(v) ? v : null;
}

/** Milésimos → o texto que volta para o campo ("36,5", sem milhar, para editar sem tropeçar no ponto). */
export const qtdParaCampo = (m: number) => fmtQtd(m).replace(/\./g, "");
/** Centavos → texto do campo ("1326,50"). */
export const reaisParaCampo = (c: number) => `${Math.floor(c / 100)},${String(c % 100).padStart(2, "0")}`;

/** Previsão do pedido: a API grava data ISO ("2026-11-03") ou texto livre ("chega sexta"); data vira "chega 03/11". */
export function fmtPrevisao(t: string): string {
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `chega ${m[3]}/${m[2]}` : t;
}
