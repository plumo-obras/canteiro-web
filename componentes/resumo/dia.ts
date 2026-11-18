/** O dia da obra, sempre no fuso dela (São Paulo), não no do navegador: quem abre de longe não pode ler "bom dia" às 22 h. */
const FUSO = "America/Sao_Paulo";
const noFuso = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { ...o, timeZone: FUSO });
const meioDia = (d: string) => new Date(`${d}T12:00:00-03:00`);

export function saudacao(agora = new Date()): string {
  const h = Number(noFuso({ hour: "numeric", hourCycle: "h23" }).format(agora));
  return h < 12 ? "Bom dia." : h < 18 ? "Boa tarde." : "Boa noite.";
}

/** "AAAA-MM-DD" de hoje na obra. */
export const hojeNaObra = (agora = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(agora);

/** AAAA-MM de hoje na obra. */
export const mesDeHoje = (agora = new Date()) => hojeNaObra(agora).slice(0, 7);

/** "2026-11-09" → "Segunda, 09/11". */
export function diaPorExtenso(d: string): string {
  const dia = noFuso({ weekday: "long" }).format(meioDia(d)).replace("-feira", "");
  return `${dia[0]!.toUpperCase()}${dia.slice(1)}, ${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

/** "2026-11-12" → "qui 12". */
export const diaCurto = (d: string) => `${noFuso({ weekday: "short" }).format(meioDia(d)).replace(".", "")} ${d.slice(8, 10)}`;

/** Meses de `inicio` até `mes` (ambos AAAA-MM): 0 no mês do início. */
export const indiceDoMes = (inicio: string, mes: string) =>
  (Number(mes.slice(0, 4)) - Number(inicio.slice(0, 4))) * 12 + Number(mes.slice(5, 7)) - Number(inicio.slice(5, 7));
