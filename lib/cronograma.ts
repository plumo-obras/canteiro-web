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

/**
 * R$ de cada mês da etapa, arredondando o ACUMULADO e tirando o anterior (o mesmo método da API, valores_mes em
 * servicos/cronograma.py): assim a soma dos meses fecha no orçado da etapa, sem os centavos que o arredondamento mês a
 * mês deixava (2.094.833,44 contra 2.094.833,38).
 */
export function valoresMes(atual: number, percentuais: number[]): number[] {
  let acum = 0;
  let antes = 0;
  return percentuais.map((p) => {
    acum += p;
    const ate = Math.round((atual * acum) / CEM);
    const v = ate - antes;
    antes = ate;
    return v;
  });
}

/** R$ previsto por mês e acumulado, a partir da grade do editor. */
export function previsaoMensal(etapas: { atual: number; percentuais: number[] }[], meses: number) {
  const porEtapa = etapas.map((e) => valoresMes(e.atual, Array.from({ length: meses }, (_, i) => e.percentuais[i] ?? 0)));
  const previsto = Array.from({ length: meses }, (_, i) => porEtapa.reduce((t, vs) => t + vs[i]!, 0));
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

/**
 * A barra única do Gantt: vai do primeiro ao último mês com %, os meses sem % no meio são pausas (a barra afina ali)
 * e o medido cobre a fração medida da barra inteira (0 a 1). null = etapa fora do cronograma.
 */
export function barraDaEtapa(ps: number[], medido: number): { de: number; ate: number; pausas: number[]; medida: number } | null {
  const iv = intervaloEtapa(ps);
  if (!iv) return null;
  const pausas: number[] = [];
  for (let i = iv.de; i <= iv.ate; i++) if (!ps[i]) pausas.push(i);
  return { ...iv, pausas, medida: Math.max(0, Math.min(1, medido / CEM)) };
}

/**
 * Colar um bloco copiado do Excel (TSV: linhas por \n, colunas por \t) na grade a partir da célula (r, c). O que passa
 * da última linha ou coluna é ignorado; o "%" e espaços em volta de cada valor saem. Devolve uma grade nova.
 */
export function colarBloco(grade: string[][], r: number, c: number, tsv: string): string[][] {
  const linhas = tsv.replace(/\r/g, "").replace(/\n+$/, "").split("\n").map((l) => l.split("\t"));
  const nova = grade.map((l) => [...l]);
  linhas.forEach((cols, i) => {
    const rr = r + i;
    if (rr >= nova.length) return;
    cols.forEach((v, j) => {
      const cc = c + j;
      if (cc >= nova[rr]!.length) return;
      nova[rr]![cc] = v.trim().replace(/%$/, "").trim();
    });
  });
  return nova;
}

/** A coluna Soma do editor: "100%" (fecha), "" (etapa vazia) ou "85% · faltam 15" / "110% · sobram 10". */
export function textoSoma(total: number): { texto: string; ok: boolean } {
  if (total === CEM) return { texto: "100%", ok: true };
  if (!total) return { texto: "—", ok: true };
  const dif = Math.abs(CEM - total) / 100;
  const n = dif.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return { texto: `${fmtPct(total)} · ${total < CEM ? `faltam ${n}` : `sobram ${n}`}`, ok: false };
}

/* ───────────────────────── gerar cronograma a partir do orçamento ─────────────────────────
 * A "intermediária": propõe a distribuição das etapas pelos meses, sequenciando por fase de obra. É proposta — a
 * pessoa revisa no editor e aprova ao salvar. (A versão com LLM, mais nuance e dependências, vai no agente.)
 */

/** Fases da obra, na ordem em que acontecem; cada uma com termos (sem acento) para casar com a descrição da etapa. */
const FASES: string[][] = [
  ["prelimin", "canteiro", "demol", "tapume", "servicos iniciais", "terraplen", "movimento de terra"],
  ["funda", "infraestrutura", "baldrame", "sapata", "estaca", "radier", "coroamento"],
  ["estrutura", "superestrutura", "pilar", "viga", "laje", "concreto", "forma", "arma", "aco"],
  ["alvenaria", "vedacao", "parede", "tijolo", "bloco ceramic"],
  ["cobertura", "telhado", "telha", "madeiramento"],
  ["instala", "eletric", "hidraul", "sanitar", "esgoto", "tubula", "agua fria"],
  ["revestim", "contrapiso", "reboco", "chapisco", "emboco", "piso", "ceramic", "azulejo", "forro", "gesso", "impermeab"],
  ["esquadri", "porta", "janela", "vidro", "ferragem"],
  ["pintura", "tinta", "textura", "massa corrida"],
  ["acabamento", "louca", "metal", "bancada", "soleira", "rodape", "marmore", "granito"],
  ["limpeza final", "entrega", "paisag"],
];

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Em que fase de obra cai a etapa (índice em FASES), ou -1 se nenhuma palavra bate. */
export function faseDaEtapa(descricao: string): number {
  const d = semAcento(descricao);
  for (let f = 0; f < FASES.length; f++) if (FASES[f]!.some((t) => d.includes(t))) return f;
  return -1;
}

/** Reparte `meses` inteiros entre as etapas conforme o valor, cada uma com no mínimo 1, somando `meses`. */
export function repartirMeses(pesos: number[], meses: number): number[] {
  const n = pesos.length;
  if (n === 0) return [];
  if (meses <= n) return pesos.map(() => 1); // mais etapas que meses: 1 cada (vão se sobrepor; a pessoa ajusta)
  const soma = pesos.reduce((s, p) => s + Math.max(0, p), 0) || n;
  const bruto = pesos.map((p) => (Math.max(0, p) / soma) * meses);
  const base = bruto.map((b) => Math.max(1, Math.floor(b)));
  let resto = meses - base.reduce((s, b) => s + b, 0);
  const porResto = bruto.map((b, i) => ({ i, f: b - Math.floor(b) })).sort((a, z) => z.f - a.f).map((x) => x.i);
  let k = 0;
  while (resto > 0) { const i = porResto[k % n]!; base[i] = (base[i] ?? 0) + 1; resto--; k++; }
  k = 0;
  const porFolga = [...porResto].reverse();
  let guarda = 0;
  while (resto < 0 && guarda++ < n * meses) { const i = porFolga[k % n]!; if ((base[i] ?? 0) > 1) { base[i] = (base[i] ?? 0) - 1; resto++; } k++; }
  return base;
}

export interface EtapaParaGerar {
  etapa: string;
  descricao: string;
  atual: number;
}

/**
 * Propõe o cronograma a partir do orçamento: ordena as etapas pela fase de obra (as sem fase ficam na ordem original,
 * depois), dá a cada uma uma duração proporcional ao valor e as põe em sequência, distribuindo o % igualmente nos meses
 * da etapa. Cada etapa soma 100% (CEM) ou fica zerada. É proposta: a pessoa revisa no editor e aprova ao salvar.
 */
export function gerarCronograma(etapas: EtapaParaGerar[], meses: number): { etapa: string; percentuais: number[] }[] {
  const vazio = (): number[] => Array.from({ length: Math.max(0, meses) }, () => 0);
  if (!etapas.length || meses < 1) return etapas.map((e) => ({ etapa: e.etapa, percentuais: vazio() }));
  const ordenadas = etapas
    .map((e, i) => ({ e, i, f: faseDaEtapa(e.descricao) }))
    .sort((a, z) => {
      const fa = a.f === -1 ? FASES.length : a.f;
      const fz = z.f === -1 ? FASES.length : z.f;
      return fa === fz ? a.i - z.i : fa - fz;
    });
  const dur = repartirMeses(ordenadas.map((o) => o.e.atual), meses);
  const porEtapa = new Map<string, number[]>();
  let cursor = 0;
  ordenadas.forEach((o, k) => {
    const len = Math.max(1, dur[k] ?? 1);
    const de = Math.min(cursor, Math.max(0, meses - 1));
    const ate = Math.min(de + len - 1, meses - 1);
    porEtapa.set(o.e.etapa, distribuirIgual(meses, de, ate));
    cursor = Math.min(ate + 1, meses - 1);
  });
  return etapas.map((e) => ({ etapa: e.etapa, percentuais: porEtapa.get(e.etapa) ?? vazio() }));
}
