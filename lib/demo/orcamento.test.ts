import { describe, expect, it } from "vitest";
import { lerPlanilhaDemo } from "./orcamento";

describe("lerPlanilhaDemo", () => {
  it("'PREÇO(R$)' ao lado do total é o preço unitário, como na API", () => {
    const csv = "ITEM;CÓDIGO;DESCRIÇÃO;UNIDADE;QUANT.;PREÇO(R$);PREÇO TOTAL (R$)\n1.1.1;;Mestre de obras;H;1056,00;35,10;37065,60\n";
    const s = lerPlanilhaDemo(csv, "sinapi.csv").sugestao;
    expect([s.item, s.codigo, s.nome, s.unidade, s.quantidade, s.valor_unitario, s.valor_total]).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("sem total ao lado, 'Preço' fica sem palpite", () => {
    const s = lerPlanilhaDemo("Descrição;Unidade;Quantidade;Preço\nCal;sc;30;18,50\n", "p.csv").sugestao;
    expect(s.valor_unitario).toBeNull();
  });
});
