/**
 * As sugestões da conversa vazia: perguntas sobre o momento da obra, tiradas do resumo que a casca já tem. Só texto,
 * sem chamar o modelo; o resumo diz em que pé a obra está e a pessoa decide se pergunta.
 */
import type { Obra, ResumoDaObra } from "@/lib/contrato";

const GERAL = "Como está a obra?";

export function sugestoesDaObra(obra: Pick<Obra, "status">, r: ResumoDaObra | null): string[] {
  if (!r) return [GERAL];
  if (obra.status === "concluida") return ["Quanto gastei no total?", "Fechou dentro do orçado?"];
  if (!r.financeiro.tem_orcamento) return ["O que falta para fechar o orçamento?", "Por onde eu começo esta obra?", GERAL];
  if (obra.status === "em_orcamento") return ["Quais itens estão sem preço?", "O que falta para aprovar o orçamento?", "Qual é a maior etapa do orçamento?"];
  const alertas = [
    r.pendencias?.propostas ? "O que está esperando a minha aprovação?" : null,
    r.entregas?.atrasadas?.length ? "Quais entregas estão atrasadas?" : null,
    r.financeiro.etapas_estouradas?.length ? "Quais etapas estouraram o orçamento?" : null,
    r.cronograma.etapas_atrasadas?.length ? "Quais etapas estão atrasadas?" : null,
    r.cronograma.cadastrado ? null : "O que falta para montar o cronograma?",
  ].filter((s): s is string => !!s);
  return ["O que preciso comprar primeiro?", ...alertas, GERAL].slice(0, 3);
}
