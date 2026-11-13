// SIMULADO: sem API ainda — trocar pelos pedidos de cada item em GET /obras/{id}/orcamento (item → linhas de pedido)
/**
 * A coluna "Pedidos" do Orçamento, item a item. A API soma o comprometido por etapa, mas ainda não liga o item da
 * planilha à linha do pedido: o pedido nasce do insumo da lista de materiais, que só tem o nome e a etapa em comum com
 * o item. Até a ligação existir, a tela casa os dois pelo nome (sem acento e sem caixa). O comprometido do item só
 * soma a linha que traz a mesma etapa, a regra com que a API soma o da etapa: assim a linha do item nunca mostra
 * dinheiro que a linha da etapa não tem. Nada vai para a rede nem é gravado; quando a API mandar os pedidos do item,
 * este arquivo sai.
 */
import type { Pedido } from "@/lib/contrato";

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Em cotação ainda não compromete; cancelado não conta. */
const COMPROMETE = new Set<Pedido["status"]>(["aprovado", "enviado", "em_transito", "parcial", "recebido", "conferido"]);

export interface PedidosDoItem {
  pedidos: Pedido[];
  /** Soma das linhas do item nos pedidos de aprovado em diante (centavos). */
  comprometido: number;
}

export function pedidosDoItem(item: { descricao: string; etapa: string }, pedidos: Pedido[]): PedidosDoItem {
  const nome = normal(item.descricao);
  let comprometido = 0;
  const achados: Pedido[] = [];
  for (const p of pedidos) {
    if (p.status === "cancelado") continue;
    const linhas = p.linhas.filter((l) => normal(l.nome) === nome && (!l.etapa || l.etapa === item.etapa));
    if (!linhas.length) continue;
    achados.push(p);
    if (COMPROMETE.has(p.status)) comprometido += linhas.filter((l) => l.etapa === item.etapa).reduce((t, l) => t + l.total, 0);
  }
  return { pedidos: achados, comprometido };
}
