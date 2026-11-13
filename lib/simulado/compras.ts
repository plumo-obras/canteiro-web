// SIMULADO: sem API ainda — trocar por POST /pedidos/{id}/cobranca (o Plumo cobra o fornecedor)
/**
 * O que Compras mostra e a API ainda não tem: a cobrança do pedido atrasado pelo Plumo. Nada vai para a rede nem é
 * gravado; a ação avisa que é prévia. O "precisa até" de cada etapa já vem do cronograma de verdade.
 */
export { AVISO_PREVIA, AVISO_PREVIA_ENVIO } from "./aviso";
