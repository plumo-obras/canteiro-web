// SIMULADO: sem API ainda — trocar por GET /obras/{id}/cronograma quando a demonstração ganhar cronograma de verdade
/**
 * O cronograma fictício da demonstração. A demo não tem cronograma (o GET volta vazio e o PUT é "indisponível"), e a
 * tela vazia não mostra o que o produto faz. Só a tela usa isto, e só com `demo` ligado e o GET vazio: obra com dado
 * real nunca passa por aqui. Nada vai para a rede nem é gravado; as ações em cima dele avisam que é prévia.
 * Os números seguem as mesmas regras da API (centésimos e centavos, cada etapa somando 100%), para o Gantt, a curva S e
 * a gaveta da etapa desenharem sem caso especial.
 */
import type { Cronograma, Medicao, MesCronograma } from "@/lib/contrato";
import { CEM, listaMeses, somarMes, valorDe, valoresMes } from "@/lib/cronograma";

export const AVISO_PREVIA = "Prévia: ainda não é salvo.";

/** Etapa, orçado (R$ inteiros) e % por mês, a partir do 1º mês; o resto dos meses fica zero. */
const ETAPAS: [string, string, number, number[]][] = [
  ["1", "Fundações", 76_000, [9000, 1000]],
  ["2", "Estrutura", 120_000, [800, 3200, 3000, 3000]],
  ["3", "Alvenaria", 48_000, [0, 0, 0, 4000, 4000, 2000]],
  ["4", "Hidráulica embutida", 30_000, [0, 0, 0, 0, 5000, 5000]],
  ["5", "Cobertura", 36_000, [0, 0, 0, 0, 0, 5000, 5000]],
  ["6", "Revestimentos", 70_000, [0, 0, 0, 0, 0, 0, 3000, 4000, 3000]],
  ["7", "Acabamento", 72_000, [0, 0, 0, 0, 0, 0, 0, 0, 3000, 3500, 3500]],
];
const MESES = 11;
/** Medido acumulado na 1ª (e única) medição, no mês de hoje: as duas primeiras etapas andando, em dia. */
const MEDIDO: Record<string, number> = { "1": 9000, "2": 800 };

/** "AAAA-MM" de hoje no fuso da obra: a obra fictícia começa este mês, para a linha de hoje cair no Gantt. */
export function mesDaObra(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(agora).slice(0, 7);
}

/**
 * `reais`: as etapas do orçamento da obra (número, nome e orçado). Com elas, o cronograma fictício usa as mesmas etapas
 * e valores das outras telas e só inventa a distribuição pelos meses; sem elas, usa as sete etapas de exemplo.
 */
export function cronogramaSimulado(agora = new Date(), reais?: { etapa: string; descricao: string; atual: number }[]): Cronograma {
  const inicio = mesDaObra(agora);
  const meses = listaMeses(inicio, MESES);
  const base = reais?.length
    ? reais.map((e, i) => [e.etapa, e.descricao, e.atual, ETAPAS[i % ETAPAS.length]![3], i] as const)
    : ETAPAS.map(([etapa, descricao, r, ps], i) => [etapa, descricao, r * 100, ps, i] as const);
  const etapas = base.map(([etapa, descricao, atual, ps, i]) => ({
    etapa,
    descricao,
    atual,
    percentuais: Array.from({ length: MESES }, (_, m) => ps[m] ?? 0),
    medido_acumulado: MEDIDO[String(i + 1)] ?? 0,
  }));
  const total = etapas.reduce((t, e) => t + e.atual, 0);
  const porMes = etapas.map((e) => valoresMes(e.atual, e.percentuais));
  const medidoValor = etapas.reduce((t, e) => t + valorDe(e.atual, e.medido_acumulado), 0);
  const pctMedido = Math.round((medidoValor * CEM) / total);
  let acc = 0;
  const mensal: MesCronograma[] = meses.map((mes, i) => {
    const previsto = porMes.reduce((t, vs) => t + (vs[i] ?? 0), 0);
    acc += previsto;
    const medido = i === 0 ? medidoValor : null;
    return {
      mes,
      previsto,
      previsto_acumulado: acc,
      pct_previsto_acumulado: Math.round((acc * CEM) / total),
      medido,
      medido_acumulado: medido,
      pct_medido_acumulado: medido === null ? null : pctMedido,
    };
  });
  const medicao: Medicao = {
    id: "simulada-1",
    numero: 1,
    mes: inicio,
    etapas: etapas
      .filter((e) => e.medido_acumulado)
      .map((e) => ({ etapa: e.etapa, pct_acumulado: e.medido_acumulado, pct_periodo: e.medido_acumulado, valor_periodo: valorDe(e.atual, e.medido_acumulado) })),
    valor: medidoValor,
    pct_obra_acumulado: pctMedido,
    observacao: "",
    quem: "Demonstração",
    criado_em: agora.toISOString(),
  };
  const fim = somarMes(inicio, MESES - 1);
  return {
    inicio,
    meses: MESES,
    revisoes: 0,
    etapas,
    mensal,
    medicoes: [medicao],
    prazo: {
      termino_contratual: fim,
      termino_projetado: fim,
      atraso_meses: 0,
      atraso_decimos: 0,
      pct_previsto_na_medicao: mensal[0]!.pct_previsto_acumulado,
      pct_medido: pctMedido,
      mes_referencia: inicio,
    },
  };
}
