import { describe, expect, it } from "vitest";
import type { LinhaPedido, Pedido } from "@/lib/contrato";
import { pedidosDoItem } from "./orcamento";

const linha = (nome: string, etapa: string | null, total: number): LinhaPedido => ({
  insumo_id: nome, nome, unidade: "m³", tipo: "material", etapa, quantidade: 1000, valor_unitario: total, total, recebida: 0, falta_entregar: 1000,
});
const ped = (id: string, status: Pedido["status"], linhas: LinhaPedido[]): Pedido => ({
  id, numero: id, obra_id: "o", fornecedor: "Fornecedor Inventado", fornecedor_id: null, previsao: null, observacao: "", status,
  valor: linhas.reduce((t, l) => t + l.total, 0), recebimentos: 0, criado_em: "", linhas,
});

describe("pedidos do item (simulado, pelo nome)", () => {
  it("casa pelo nome sem acento nem caixa; o comprometido só soma a linha da mesma etapa e de aprovado em diante", () => {
    const pedidos = [
      ped("a", "aprovado", [linha("Concreto FCK 25", "1", 500), linha("Areia", "1", 70)]),
      ped("b", "em_cotacao", [linha("concreto fck 25", "1", 300)]),
      ped("c", "enviado", [linha("Concreto fck 25", null, 200)]),
      ped("d", "cancelado", [linha("Concreto fck 25", "1", 900)]),
      ped("e", "aprovado", [linha("Concreto fck 25", "2", 100)]),
    ];
    const r = pedidosDoItem({ descricao: "Concreto fck 25", etapa: "1" }, pedidos);
    expect(r.pedidos.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(r.comprometido).toBe(500);
  });

  it("sem pedido com o nome: nada", () => {
    expect(pedidosDoItem({ descricao: "Forma de madeira", etapa: "2" }, [ped("a", "aprovado", [linha("Areia", "2", 70)])])).toEqual({ pedidos: [], comprometido: 0 });
  });
});
