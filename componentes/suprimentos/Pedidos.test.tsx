import { describe, expect, it } from "vitest";
import type { LinhaPedido, Pedido } from "@/lib/contrato";
import { telaDe } from "../sessoes";
import { totalLinha } from "../formularios/ModalNovoPedido";
import { acoesDe, diasDeAtraso, estadoDoPedido, linhasDaChegada, porUrgencia, progressoParcial, resumoLinhas, seloDoPedido, semOsAbertos, valorAReceber } from "./Pedidos";

// falta_entregar vem da API (0 em conferido/cancelado); o padrão do dublê é o de um pedido aberto
const linha = (nome: string, quantidade: number, recebida = 0, falta = Math.max(0, quantidade - recebida)): LinhaPedido => ({
  insumo_id: nome, nome, unidade: "m³", tipo: "material", etapa: "1", quantidade, valor_unitario: 14000, total: Math.round((quantidade * 14000) / 1000), recebida,
  falta_entregar: falta,
});
const ped = (status: Pedido["status"], linhas = [linha("Areia média", 40000)]): Pedido => ({
  id: "x", numero: "PED-0157", obra_id: "o", fornecedor: "Areial", fornecedor_id: null, previsao: null, observacao: "", status,
  valor: linhas.reduce((t, l) => t + l.total, 0), recebimentos: 0, criado_em: "", linhas,
});

describe("ações do pedido nomeadas pela consequência", () => {
  it("cada status oferece só as ações válidas, a principal primeiro", () => {
    expect(acoesDe(ped("em_cotacao")).map((a) => a.rotulo)).toEqual(["Aprovar R$ 5.600,00", "Cancelar pedido"]);
    expect(acoesDe(ped("aprovado")).map((a) => a.tipo)).toEqual(["chegou", "entrega", "avancar"]);
    expect(acoesDe(ped("enviado"))[0]).toMatchObject({ tipo: "chegou", rotulo: "Chegou" });
    expect(acoesDe(ped("em_transito")).some((a) => a.tipo === "avancar" && a.para === "cancelado")).toBe(false);
    expect(acoesDe(ped("parcial")).map((a) => a.tipo)).toEqual(["chegou", "entrega", "encerrar"]);
    expect(acoesDe(ped("conferido"))).toEqual([]);
    expect(acoesDe(ped("cancelado"))).toEqual([]);
  });

  it("na tela são dois estados, com o status do domínio por trás", () => {
    for (const st of ["aprovado", "enviado", "em_transito"] as const) expect(estadoDoPedido(ped(st)).texto).toBe("Pedido feito");
    expect(estadoDoPedido({ ...ped("aprovado"), previsao: "2026-11-12" }).texto).toBe("Pedido feito · chega 12/11");
    expect(estadoDoPedido(ped("em_cotacao"))).toMatchObject({ grupo: "feito", texto: "Pedido feito · falta aprovar" });
    expect(estadoDoPedido(ped("parcial", [linha("Areia", 25_000, 18_000)])).texto).toBe("Pedido feito · chegou 18 de 25 m³");
    const chegou = { ...ped("conferido", [linha("Areia", 25_000, 25_000, 0)]), recebido_em: "2026-11-06" };
    expect(estadoDoPedido(chegou)).toMatchObject({ grupo: "chegou", texto: "Chegou 06/11" });
    expect(estadoDoPedido({ ...chegou, pago: chegou.valor }).texto).toBe("Chegou 06/11 · pago");
    expect(estadoDoPedido(ped("conferido", [linha("Areia", 25_000, 18_000, 0)])).texto).toBe("Chegou em parte");
    expect(estadoDoPedido(ped("cancelado")).grupo).toBe("cancelado");
  });

  it("Chegou entrega só o que falta em cada linha", () => {
    expect(linhasDaChegada(ped("parcial", [linha("A", 1000, 1000), linha("B", 2000, 500)]))).toEqual([{ indice: 1, quantidade: 1500 }]);
  });

  it("o cartão resume a 1ª linha e quantas mais", () => {
    expect(resumoLinhas(ped("aprovado"))).toEqual({ primeira: "Areia média · 40 m³", mais: 0 });
    expect(resumoLinhas(ped("aprovado", [linha("Areia", 1000), linha("Brita", 2000), linha("Pedra", 3000)])).mais).toBe(2);
  });

  it("parcial mostra o progresso pela quantidade, e o em aberto soma só o que falta", () => {
    expect(progressoParcial(ped("parcial", [linha("Areia", 25_000, 18_000)]))).toBe("chegou 18 de 25 m³");
    expect(progressoParcial(ped("parcial", [linha("A", 1000, 1000), linha("B", 2000, 2000), linha("C", 3000, 1000)]))).toBe("2 de 3 itens completos, 1 parcial");
    expect(valorAReceber(ped("parcial", [linha("Areia", 25_000, 18_000)]))).toBe(98_000); // 7 m³ × R$ 140
    // conferido: a API manda falta_entregar 0 e a tela confia nela, sem refazer a regra do status
    expect(valorAReceber(ped("conferido", [linha("Areia", 25_000, 18_000, 0)]))).toBe(0);
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

  it("o selo do cartão fala como o protótipo, e o atraso sai da previsão contra hoje", () => {
    const hoje = "2026-11-12";
    expect(seloDoPedido(ped("em_cotacao"), hoje)).toMatchObject({ texto: "falta aprovar", tom: "warn" });
    expect(seloDoPedido({ ...ped("enviado"), previsao: "2026-11-14" }, hoje)).toMatchObject({ texto: "chega 14/11", tom: "info" });
    expect(seloDoPedido({ ...ped("em_transito"), previsao: "2026-10-28" }, hoje)).toMatchObject({ texto: "atrasado 15 dias", curto: "atrasado", tom: "bad" });
    expect(seloDoPedido({ ...ped("aprovado"), previsao: "2026-11-11" }, hoje).texto).toBe("atrasado 1 dia");
    const chegou = ped("conferido", [linha("Areia", 25_000, 25_000, 0)]);
    expect(seloDoPedido({ ...chegou, pago: chegou.valor }, hoje)).toMatchObject({ texto: "chegou · pago", curto: "chegou", tom: "ok" });
    expect(seloDoPedido(ped("aprovado"), hoje)).toMatchObject({ texto: "a caminho", tom: "info" });
  });

  it("chegou ou em cotação não atrasam; previsão em texto livre (API antiga) também não", () => {
    const hoje = "2026-11-12";
    expect(diasDeAtraso({ ...ped("conferido"), previsao: "2026-10-01" }, hoje)).toBe(0);
    expect(diasDeAtraso({ ...ped("em_cotacao"), previsao: "2026-10-01" }, hoje)).toBe(0);
    expect(diasDeAtraso({ ...ped("enviado"), previsao: "chega quinta" }, hoje)).toBe(0);
    expect(diasDeAtraso({ ...ped("parcial", [linha("Areia", 25_000, 18_000)]), previsao: "2026-11-02" }, hoje)).toBe(10);
  });

  it("pedido que chegou em parte e veio nas duas buscas aparece uma vez só (sem chave repetida)", () => {
    const parcial = { ...ped("parcial"), id: "p-1" };
    const chegou = { ...ped("conferido"), id: "p-2" };
    expect(semOsAbertos([{ ...parcial, status: "conferido" as const }, chegou], [parcial]).map((p) => p.id)).toEqual(["p-2"]);
  });

  it("o que espera alguém vem primeiro: aprovar, depois o atrasado", () => {
    const hoje = "2026-11-12";
    const lista = [{ ...ped("enviado"), id: "a", previsao: "2026-11-20" }, { ...ped("enviado"), id: "b", previsao: "2026-11-01" }, { ...ped("em_cotacao"), id: "c" }];
    expect([...lista].sort(porUrgencia(hoje)).map((p) => p.id)).toEqual(["c", "b", "a"]);
  });
});
