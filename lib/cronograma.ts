/**
 * Contas da tela do cronograma, todas em inteiros como a API: percentual em centésimos (100% = 10000) e dinheiro em
 * centavos. A API é quem grava e devolve o mensal oficial; aqui é só a prévia ao vivo do editor e da medição.
 */

export const CEM = 10000;

/** "2026-11" + 3 → "2027-02". */
export function somarMes(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** Meses entre dois "AAAA-MM" (b − a). */
export function distanciaMeses(a: string, b: string): number {
  const [aa, am] = a.split("-").map(Number) as [number, number];
  const [ba, bm] = b.split("-").map(Number) as [number, number];
  return ba * 12 + bm - (aa * 12 + am);
}

export const listaMeses = (inicio: string, meses: number) => Array.from({ length: meses }, (_, i) => somarMes(inicio, i));

const NOMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-11" → "nov/26". */
export const fmtMes = (mes: string | null) => (mes ? `${NOMES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}` : "—");
/** "2026-11" → "nov/2026". */
export const fmtMesLongo = (mes: string | null) => (mes ? `${NOMES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}` : "—");

/** 1250 → "12,5%"; 10000 → "100%". */
export const fmtPct = (c: number) => `${(c / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/**
 * Distribui 100% igual de `de` a `ate` (índices, inclusivos), o resto dos centésimos nos primeiros meses: a soma fecha
 * em 10000 exato, que é o que a API exige. Fora do intervalo fica zero.
 */
export function distribuirIgual(meses: number, de: number, ate: number): number[] {
  const a = Math.max(0, Math.min(de, ate));
  const b = Math.min(meses - 1, Math.max(de, ate));
  const n = b - a + 1;
  const base = Math.floor(CEM / n);
  let resto = CEM - base * n;
  return Array.from({ length: meses }, (_, i) => {
    if (i < a || i > b) return 0;
    const v = base + (resto > 0 ? 1 : 0);
    if (resto > 0) resto--;
    return v;
  });
}

/** Muda o número de meses sem perder o que já foi preenchido: corta no fim ou completa com zero (meses novos vazios). */
export const redimensionar = (ps: number[], meses: number) => Array.from({ length: meses }, (_, i) => ps[i] ?? 0);

export const somaPct = (ps: number[]) => ps.reduce((t, p) => t + p, 0);

/** Valor de uma fração da etapa: orçado (centavos) × centésimos ÷ 10000, arredondado ao centavo. */
export const valorDe = (atual: number, centesimos: number) => Math.round((atual * centesimos) / CEM);

/** R$ previsto por mês e acumulado, a partir da grade do editor. */
export function previsaoMensal(etapas: { atual: number; percentuais: number[] }[], meses: number) {
  const previsto = Array.from({ length: meses }, (_, i) => etapas.reduce((t, e) => t + valorDe(e.atual, e.percentuais[i] ?? 0), 0));
  let acc = 0;
  const acumulado = previsto.map((v) => (acc += v));
  return { previsto, acumulado };
}

/* ---------- Gantt: situação de cada etapa no mês de referência (o da última medição) ---------- */

export type Situacao = "concluida" | "em_dia" | "atrasada" | "nao_comecou";

/** Índice do mês no cronograma (pode passar do fim, quando a medição é depois do término); null sem referência. */
export const indiceDoMes = (inicio: string | null, mes: string | null) => (inicio && mes ? distanciaMeses(inicio, mes) : null);

/** Previsto acumulado da etapa até o índice (inclusive), em centésimos. */
export const previstoAte = (ps: number[], ate: number | null) => (ate === null || ate < 0 ? 0 : somaPct(ps.slice(0, ate + 1)));

/**
 * Situação da etapa no mês de referência: concluída (medido 100%), atrasada (medido < previsto acumulado até o mês),
 * não começou (nada previsto nem medido até lá) ou em dia (medido ≥ previsto, inclusive adiantada).
 */
export function situacaoEtapa(ps: number[], medido: number, ref: number | null): { situacao: Situacao; previsto: number; falta: number } {
  const previsto = previstoAte(ps, ref);
  const falta = Math.max(0, previsto - medido);
  if (medido >= CEM) return { situacao: "concluida", previsto, falta: 0 };
  if (medido < previsto) return { situacao: "atrasada", previsto, falta };
  if (!medido && !previsto) return { situacao: "nao_comecou", previsto, falta: 0 };
  return { situacao: "em_dia", previsto, falta: 0 };
}

/** Primeiro e último mês com % (índices); null se a etapa está fora do cronograma. */
export function intervaloEtapa(ps: number[]): { de: number; ate: number } | null {
  const de = ps.findIndex((p) => p > 0);
  if (de < 0) return null;
  let ate = ps.length - 1;
  while (ate > de && !ps[ate]) ate--;
  return { de, ate };
}

/** "192,8 mil", "1,24 mi", "850": dinheiro curto para a linha de total, onde a coluna do mês é estreita. */
export function fmtReaisCurto(c: number): string {
  const r = c / 100;
  const a = Math.abs(r);
  if (a >= 1_000_000) return `${(r / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (a >= 1_000) return `${(r / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: a >= 100_000 ? 0 : 1 })} mil`;
  return r.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
