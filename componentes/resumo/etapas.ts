/**
 * "Montando a obra", no topo do Resumo: os três passos para a obra rodar no app (Projeto → Orçamento → Cronograma),
 * cada um feito, atual, pedindo atenção ou ainda por vir. Não são as etapas físicas da obra (essas andam em paralelo e
 * aparecem em "Etapas em andamento"): com os três feitos a linha some. Sai só do status da obra e do
 * GET /obras/{id}/resumo; ninguém avança passo na mão.
 */
import type { Obra, ResumoDaObra } from "@/lib/contrato";

export type TelaEtapa = "projeto" | "orcamento" | "cronograma";
export type EstadoEtapa = "feita" | "atual" | "atencao" | "depois";
export interface Etapa {
  tela: TelaEtapa;
  rotulo: string;
  estado: EstadoEtapa;
  /** A frase curta embaixo do nome; vazia nos passos feitos (o ✓ já diz) e nos que ainda não chegaram. */
  detalhe: string;
  /** O que fazer no passo atual, como botão. */
  acao: string;
}

const feita = (tela: TelaEtapa, rotulo: string): Etapa => ({ tela, rotulo, estado: "feita", detalhe: "", acao: "" });
const depois = (tela: TelaEtapa, rotulo: string, detalhe = ""): Etapa => ({ tela, rotulo, estado: "depois", detalhe, acao: "" });

/**
 * `null` enquanto o resumo desta obra não chegou: sem ele não dá para saber se há orçamento, e chutar "comece pelo
 * projeto" numa obra em andamento seria afirmar o que não se sabe.
 */
export function etapasDaObra(obra: Obra, r: ResumoDaObra | null): Etapa[] | null {
  if (!r || r.obra.id !== obra.id) return null;
  const concluida = obra.status === "concluida";
  const aprovada = concluida || obra.status === "em_andamento";
  const desfazendo = obra.status === "desfazendo_aprovacao";
  const tem = r.financeiro.tem_orcamento || aprovada || desfazendo;

  const projeto: Etapa = tem ? feita("projeto", "Projeto") : { tela: "projeto", rotulo: "Projeto", estado: "atual", detalhe: "comece por aqui", acao: "Enviar as pranchas" };

  const orcamento: Etapa = aprovada
    ? feita("orcamento", "Orçamento")
    : desfazendo
      ? { tela: "orcamento", rotulo: "Orçamento", estado: "atencao", detalhe: "desfazendo a aprovação", acao: "Ver o orçamento" }
      : tem
        ? { tela: "orcamento", rotulo: "Orçamento", estado: "atual", detalhe: "para aprovar", acao: "Revisar e aprovar" }
        : depois("orcamento", "Orçamento");

  // O cronograma pode nascer ainda na fase de orçamento (o Gerar com IA prevê a obra toda): montado é feito, em qualquer fase.
  const cronograma: Etapa =
    r.cronograma.cadastrado || concluida
      ? feita("cronograma", "Cronograma")
      : aprovada
        ? { tela: "cronograma", rotulo: "Cronograma", estado: "atual", detalhe: "falta montar", acao: "Montar o cronograma" }
        : depois("cronograma", "Cronograma", tem ? "depois da aprovação" : "");

  return [projeto, orcamento, cronograma];
}

/** A linha só aparece enquanto falta algum passo: com a obra rodando, ela não diria nada de novo. */
export const montando = (etapas: Etapa[] | null): etapas is Etapa[] => !!etapas && etapas.some((e) => e.estado !== "feita");
