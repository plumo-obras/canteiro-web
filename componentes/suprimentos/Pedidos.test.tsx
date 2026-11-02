import { describe, expect, it } from "vitest";
import type { LinhaPedido, Pedido } from "@/lib/contrato";
import { telaDe } from "../sessoes";
import { totalLinha } from "../formularios/ModalNovoPedido";
import { acoesDe, progressoParcial, resumoLinhas, valorAReceber } from "./Pedidos";

const linha = (nome: string, quantidade: number, recebida = 0): LinhaPedido => ({
  insumo_id: nome, nome, unidade: "m³", tipo: "material", etapa: "1", quantidade, valor_unitario: 14000, total: Math.round((quantidade * 14000) / 1000), recebida,
});
const ped = (status: Pedido["status"], linhas = [linha("Areia média", 40000)]): Pedido => ({
  id: "x", numero: "PED-0157", obra_id: "o", fornecedor: "Areial", fornecedor_id: null, previsao: null, observacao: "", status,
  valor: linhas.reduce((t, l) => t + l.total, 0), recebimentos: 0, criado_em: "", linhas,
});

describe("ações do pedido nomeadas pela consequência", () => {
  it("cada status oferece só as ações válidas, a principal primeiro", () => {
    expect(acoesDe(ped("em_cotacao")).map((a) => a.rotulo)).toEqual(["Aprovar R$ 5.600,00", "Cancelar pedido"]);
    expect(acoesDe(ped("aprovado")).map((a) => a.tipo)).toEqual(["avancar", "entrega", "avancar"]);
    expect(acoesDe(ped("enviado"))[0]).toMatchObject({ tipo: "entrega", rotulo: "Registrar entrega" });
    expect(acoesDe(ped("em_transito")).some((a) => a.tipo === "avancar" && a.para === "cancelado")).toBe(false);
    expect(acoesDe(ped("parcial")).map((a) => a.tipo)).toEqual(["entrega", "encerrar"]);
    expect(acoesDe(ped("conferido"))).toEqual([]);
    expect(acoesDe(ped("cancelado"))).toEqual([]);
  });

  it("o cartão resume a 1ª linha e quantas mais", () => {
    expect(resumoLinhas(ped("aprovado"))).toEqual({ primeira: "40 m³ · Areia média", mais: 0 });
    expect(resumoLinhas(ped("aprovado", [linha("Areia", 1000), linha("Brita", 2000), linha("Pedra", 3000)])).mais).toBe(2);
  });

  it("parcial mostra o progresso pela quantidade, e o em aberto soma só o que falta", () => {
    expect(progressoParcial(ped("parcial", [linha("Areia", 25_000, 18_000)]))).toBe("chegou 18 de 25 m³");
    expect(progressoParcial(ped("parcial", [linha("A", 1000, 1000), linha("B", 2000, 2000), linha("C", 3000, 1000)]))).toBe("2 de 3 itens completos, 1 parcial");
    expect(valorAReceber(ped("parcial", [linha("Areia", 25_000, 18_000)]))).toBe(98_000); // 7 m³ × R$ 140
    expect(valorAReceber(ped("conferido", [linha("Areia", 25_000, 18_000)]))).toBe(0);
  });

  it("total da linha arredonda ao centavo como a API", () => {
    expect(totalLinha(2_500, 3_999)).toBe(9_998); // 2,5 × R$ 39,99 = 99,975 → 99,98
    expect(totalLinha(null, 100)).toBe(0);
  });

  it("links antigos de Almoxarifado e Pedidos abrem Suprimentos", () => {
    expect(telaDe("pedidos")).toBe("suprimentos");
    expect(telaDe("almoxarifado")).toBe("suprimentos");
    expect(telaDe("historico")).toBe("historico");
    expect(telaDe("xyz")).toBeUndefined();
  });
});
