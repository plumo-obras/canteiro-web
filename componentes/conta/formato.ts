import { fmtReais } from "@/lib/formato";

/** Microdólares (inteiros) → "US$ 1,23"; abaixo de meio centavo, "< US$ 0,01" em vez de um zero enganoso. */
export function fmtDolares(micro: number): string {
  if (micro > 0 && micro < 5_000) return "< US$ 0,01";
  return fmtReais(Math.round(micro / 10_000)).replace("R$", "US$");
}

/** 1234567 → "1,2 mi"; 12345 → "12 mil": tokens são ordem de grandeza, não contabilidade. */
export function fmtTokens(n: number): string {
  const f = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: v < 10 ? 1 : 0 });
  if (n >= 1_000_000) return `${f(n / 1_000_000)} mi`;
  if (n >= 1_000) return `${f(n / 1_000)} mil`;
  return String(n);
}

/** AAAA-MM-DD no fuso do canteiro (o mesmo de UsoIA.dia na API). */
export const diaSP = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

/** Os últimos `n` dias terminando hoje, do mais antigo ao mais novo. */
export function ultimosDias(n: number, hoje = new Date()): string[] {
  const base = Date.parse(`${diaSP(hoje)}T12:00:00Z`);
  return Array.from({ length: n }, (_, i) => new Date(base - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

/** "2026-10-03" → "03/10". */
export const diaCurto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

export const ROTULO_ROTA: Record<string, string> = {
  conversa: "Conversas",
  briefing: "Resumo diário",
  whatsapp: "WhatsApp",
  nf: "Leitura de NF",
};
