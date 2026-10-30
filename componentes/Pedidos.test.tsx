import { describe, expect, it } from "vitest";
import type { Pedido } from "@/lib/contrato";
import { passosDe } from "./Pedidos";

const ped = (status: Pedido["status"]): Pedido => ({
  id: "x", tenant_id: "t", criado_em: "", numero: "PED-0157", obra_id: "o", insumo_id: "i", quantidade: 40000,
  fornecedor: "Areial", valor: 560000, status, previsao: null, rastreio: null,
});

describe("botões de pedido nomeados pela consequência", () => {
  it("cada status oferece só transições válidas, a principal primeiro", () => {
    expect(passosDe(ped("em_cotacao"), "m³").map((p) => p.rotulo)).toEqual(["Aprovar R$ 5.600,00", "Cancelar pedido"]);
    expect(passosDe(ped("enviado"), "m³").map((p) => p.para)).toEqual(["recebido", "em_transito", "cancelado"]);
    expect(passosDe(ped("recebido"), "m³")[0]!.rotulo).toBe("Conferir e dar entrada de 40 m³");
    expect(passosDe(ped("em_transito"), "m³").some((p) => p.para === "cancelado")).toBe(false);
    expect(passosDe(ped("conferido"), "m³")).toEqual([]);
    expect(passosDe(ped("recebido"), "m³").every((p) => !/avançar/i.test(p.rotulo))).toBe(true);
  });
});
