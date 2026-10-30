/** "agora há pouco", "há 3 h", "ontem", "há 5 dias", "12/09": a última atividade lida de relance no cartão. */
const fDia = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const diaSP = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

export function haQuanto(iso: string, agora = new Date()): string {
  const t = new Date(iso);
  const min = Math.floor((agora.getTime() - t.getTime()) / 60_000);
  if (min < 2) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  // Dias contados pelo calendário do canteiro, não por 24 h: "ontem" às 8h é ontem mesmo que faça 14 h.
  const dias = Math.round((Date.parse(diaSP(agora)) - Date.parse(diaSP(t))) / 86_400_000);
  if (dias === 0) return `há ${Math.floor(min / 60)} h`;
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;
  return `em ${fDia.format(t)}`;
}

/** "Paula (leitura)" → "Paula"; "Marina Duarte" → "Marina". */
export const primeiroNome = (nome: string) => nome.replace(/\(.*?\)/g, "").trim().split(/\s+/)[0] || nome;
