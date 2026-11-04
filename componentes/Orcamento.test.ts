import { describe, expect, it } from "vitest";
import { reaisCurtos, separarVersoes } from "./Orcamento";

describe("Orçamento: versões à vista", () => {
  it("versões: à vista o contrato vigente e o último aditivo; o resto no histórico", () => {
    const v = (id: string, tipo: "contrato" | "aditivo", numero: number, ativa: boolean) => ({ id, tipo, numero, ativa });
    const r = separarVersoes([v("a2", "aditivo", 2, true), v("a1", "aditivo", 1, true), v("c2", "contrato", 0, true), v("c1", "contrato", 0, false)]);
    expect(r.principais.map((x) => x.id)).toEqual(["a2", "c2"]);
    expect(r.historico.map((x) => x.id)).toEqual(["a1", "c1"]);
  });
});

describe("Orçamento: faixa no celular", () => {
  it("valores curtos (o cheio fica no toque)", () => {
    expect(reaisCurtos(207_058_338)).toBe("R$ 2,07 mi");
    expect(reaisCurtos(2_334_000)).toBe("R$ 23,3 mil");
    expect(reaisCurtos(91_000)).toBe("R$ 910,00");
    expect(reaisCurtos(-150_000_000)).toBe("−R$ 1,5 mi");
  });
});
