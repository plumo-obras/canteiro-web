import { describe, expect, it } from "vitest";
import type { ResumoDaObra } from "@/lib/contrato";
import { celulasPlacar } from "./Placar";

type Fin = ResumoDaObra["financeiro"];
type Cro = ResumoDaObra["cronograma"];
const fin = (f: Partial<Fin> = {}): Fin => ({ tem_orcamento: true, orcado_atual: 44044500, comprometido: 2133730, realizado: 2133730, saldo: 41910770, falta_gastar: 41910770, realizado_pct: 480, ...f });
const cro = (c: Partial<Cro> = {}): Cro => ({ cadastrado: true, termino_contratual: "2027-03", termino_projetado: null, atraso_decimos: null, ...c });
const r = (f?: Partial<Fin>, c?: Partial<Cro>) => ({ obra: {}, financeiro: fin(f), cronograma: cro(c) }) as ResumoDaObra;
const valores = (...a: Parameters<typeof celulasPlacar>) => celulasPlacar(...a).map((c) => [c.valor, c.sub]);

describe("o placar da obra", () => {
  it("com orçamento mostra o que a API mandou, sem conta na tela", () => {
    expect(valores({ verba: 52000000 }, r(), "conversa", false)).toEqual([
      ["R$ 520.000,00", "fechado com o cliente"],
      ["R$ 21.337,30", "4,8% do orçado"],
      ["R$ 419.107,70", "de R$ 440.445,00 orçados"],
      ["Sem medição", "entrega 03/2027"],
    ]);
  });

  it("sem orçamento e sem cronograma: — com o texto do protótipo", () => {
    const sem = r({ tem_orcamento: false, realizado: 0, orcado_atual: 0, falta_gastar: 0, realizado_pct: null }, { cadastrado: false, termino_contratual: null });
    expect(valores({ verba: 0 }, sem, "projeto", false)).toEqual([
      ["—", "não informado"],
      ["R$ 0,00", "nenhum gasto lançado"],
      ["—", "aparece com a estimativa"],
      ["—", "aparece com o cronograma"],
    ]);
    expect(valores({ verba: 0 }, sem, "orcamento", false)[2]).toEqual(["—", "aparece com o orçamento"]);
  });

  it("API antiga, sem os campos novos: — no Falta e sem o %", () => {
    const c = valores({ verba: 1 }, r({ falta_gastar: undefined, realizado_pct: undefined }), "conversa", false);
    expect(c[1]).toEqual(["R$ 21.337,30", ""]);
    expect(c[2]).toEqual(["—", ""]);
  });

  it("medição define o prazo; só ela diz se está no prazo", () => {
    expect(valores({ verba: 1 }, r({}, { atraso_decimos: 0 }), "conversa", false)[3]).toEqual(["No prazo", "entrega 03/2027"]);
    expect(valores({ verba: 1 }, r({}, { atraso_decimos: 14, termino_projetado: "2027-05" }), "conversa", false)[3]).toEqual(["Atrasada 1,4 mês", "previsão entrega 05/2027"]);
    expect(valores({ verba: 1 }, r({}, { atraso_decimos: 30 }), "conversa", false)[3]![0]).toBe("Atrasada 3 meses");
  });

  it("sem resposta da API não inventa R$ 0,00", () => {
    expect(celulasPlacar({ verba: 1 }, null, "conversa", true).slice(1).map((c) => c.valor)).toEqual(["—", "—", "—"]);
    expect(celulasPlacar({ verba: 1 }, null, "conversa", true)[1]!.sub).toBe("não carregou");
  });
});
