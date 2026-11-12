// SIMULADO: sem API ainda — trocar por POST /pedidos/{id}/cobranca (o Plumo cobra o fornecedor) e pelas datas de
// GET /obras/{id}/cronograma quando a demonstração tiver cronograma
/**
 * O que Compras mostra e a API ainda não tem: a cobrança do pedido atrasado pelo Plumo e, só na demonstração (que não
 * tem cronograma), o "precisa até" de cada etapa. Nada vai para a rede nem é gravado; a ação avisa que é prévia.
 */
import { cronogramaSimulado } from "./cronograma";

export const AVISO_PREVIA = "Prévia: ainda não é salvo.";

/**
 * Na demonstração, o mês em que a etapa começa no cronograma simulado (lib/simulado/cronograma.ts): Compras e
 * Cronograma contam a mesma história.
 */
export function inicioEtapaDemo(posicao: number, hoje: Date): string {
  const c = cronogramaSimulado(hoje);
  const e = c.etapas[posicao % c.etapas.length]!;
  const i = Math.max(0, e.percentuais.findIndex((p) => p > 0));
  return c.mensal[i]?.mes ?? c.inicio!;
}
