import { describe, expect, it } from "vitest";
import { diaCurto, diaPorExtenso, hojeNaObra, indiceDoMes, saudacao } from "./dia";

describe("o dia da obra", () => {
  it("no fuso da obra, não no do navegador", () => {
    expect(saudacao(new Date("2026-11-09T12:00:00Z"))).toBe("Bom dia."); // 9 h em São Paulo
    expect(saudacao(new Date("2026-11-09T18:00:00Z"))).toBe("Boa tarde.");
    expect(saudacao(new Date("2026-11-10T01:00:00Z"))).toBe("Boa noite."); // 22 h do dia 9
    expect(hojeNaObra(new Date("2026-11-10T01:00:00Z"))).toBe("2026-11-09");
    expect(diaPorExtenso("2026-11-09")).toBe("Segunda, 09/11");
    expect(diaCurto("2026-11-12")).toBe("qui 12");
  });

  it("conta os meses desde o início do cronograma", () => {
    expect(indiceDoMes("2026-08", "2026-11")).toBe(3);
    expect(indiceDoMes("2026-11", "2027-01")).toBe(2);
    expect(indiceDoMes("2026-11", "2026-10")).toBe(-1);
  });
});
