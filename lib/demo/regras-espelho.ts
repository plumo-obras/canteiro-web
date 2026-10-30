/**
 * Espelho de canteiro_dominio.regras usado SÓ pelo modo de demonstração, para o Next se passar pela API enquanto ela
 * não existe. Fora do modo de demonstração quem faz a conta é a API; a tela nunca chama estas funções.
 */
import type { Conta, Movimento, StatusPedido } from "../contrato";

export class RegraViolada extends Error {}

export function contaDeFalta(p: {
  precisa: number;
  saldo: number;
  a_caminho?: number;
  cotando?: number;
  transferencia?: number;
}): Conta {
  const { precisa, saldo, a_caminho = 0, cotando = 0, transferencia = 0 } = p;
  const falta = Math.max(0, precisa - Math.max(0, saldo) - a_caminho - cotando - transferencia);
  return { precisa, saldo, a_caminho, cotando, transferencia, falta, comprar: falta };
}

export function efeitoNoSaldo(m: Pick<Movimento, "tipo" | "quantidade">): number {
  if (m.tipo === "ajuste") return m.quantidade;
  if (m.quantidade <= 0) throw new RegraViolada("A quantidade do movimento tem de ser maior que zero.");
  return m.tipo === "entrada" || m.tipo === "transferencia_entrada" ? m.quantidade : -m.quantidade;
}

export const TRANSICOES: Record<StatusPedido, StatusPedido[]> = {
  em_cotacao: ["aprovado", "cancelado"],
  aprovado: ["enviado", "cancelado"],
  enviado: ["em_transito", "recebido", "cancelado"],
  em_transito: ["recebido"],
  recebido: ["conferido"],
  conferido: [],
  cancelado: [],
};

export const A_CAMINHO: StatusPedido[] = ["aprovado", "enviado", "em_transito", "recebido"];
export const EM_COTACAO: StatusPedido[] = ["em_cotacao"];

export function validarTransicao(de: StatusPedido, para: StatusPedido) {
  if (!TRANSICOES[de]?.includes(para)) throw new RegraViolada(`O pedido não pode ir de '${de}' para '${para}'.`);
}
