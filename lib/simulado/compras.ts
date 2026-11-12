// SIMULADO: sem API ainda — trocar por POST /pedidos/{id}/cobranca (o Plumo cobra o fornecedor) e pelas datas de
// GET /obras/{id}/cronograma quando a demonstração tiver cronograma
/**
 * O que Compras mostra e a API ainda não tem: a cobrança do pedido atrasado pelo Plumo e, só na demonstração (que não
 * tem cronograma), o "precisa até" de cada etapa. Nada vai para a rede nem é gravado; a ação avisa que é prévia.
 */
export const AVISO_PREVIA = "Prévia: ainda não é salvo.";

/** Na demonstração, cada etapa começa um mês depois da anterior, a partir do mês que vem. */
export function inicioEtapaDemo(posicao: number, hoje: Date): string {
  const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1 + posicao, 1));
  return d.toISOString().slice(0, 7);
}
