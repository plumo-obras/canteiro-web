import { describe, expect, it } from "vitest";
import { fmtDiaHora, fmtHora, fmtQtd, fmtQtdUn, fmtReais, fmtPrevisao, lerQtd, lerReais, qtdParaCampo, reaisParaCampo } from "./formato";

describe("fmtQtd (milésimos → pt-BR), igual a canteiro_dominio.tipos.fmt_qtd", () => {
  it.each([
    [1500, "1,5"],
    [2_760_000, "2.760"],
    [0, "0"],
    [1, "0,001"],
    [1_234_567_890, "1.234.567,89"],
    [3_940_000, "3.940"],
  ])("%i → %s", (m, s) => expect(fmtQtd(m)).toBe(s));

  it("mantém o sinal abaixo de 1 (ajuste negativo de contagem)", () => {
    expect(fmtQtd(-500)).toBe("-0,5");
    expect(fmtQtd(-190_000)).toBe("-190");
  });

  it("junta a unidade", () => expect(fmtQtdUn(40_000, "m³")).toBe("40 m³"));
});

describe("fmtReais (centavos → pt-BR)", () => {
  it.each([
    [129_990, "R$ 1.299,90"],
    [5, "R$ 0,05"],
    [0, "R$ 0,00"],
    [2_112_000, "R$ 21.120,00"],
    [-4_680_00, "-R$ 4.680,00"],
  ])("%i → %s", (c, s) => expect(fmtReais(c)).toBe(s));
});

describe("hora no fuso de São Paulo", () => {
  it("formata independente do fuso do navegador", () => {
    expect(fmtHora("2026-10-30T13:32:00Z")).toBe("10:32");
    expect(fmtDiaHora("2026-10-30T13:32:00Z")).toBe("30/10 10:32");
  });
});

describe("lerQtd (texto digitado → milésimos)", () => {
  it.each([
    ["36", 36_000],
    ["36,5", 36_500],
    ["0,001", 1],
    ["1.200", 1_200_000],
    ["1200", 1_200_000],
    ["1.200,25", 1_200_250],
    [" 40 ", 40_000],
  ])("%s → %i", (t, m) => expect(lerQtd(t)).toBe(m));
  it.each(["", "abc", "1,2345", "1.20", "-3", "3,"])("recusa %j", (t) => expect(lerQtd(t)).toBeNull());
  it("aceita sinal só quando pedido (ajuste de contagem)", () => {
    expect(lerQtd("-12", { negativo: true })).toBe(-12_000);
    expect(lerQtd("−0,5", { negativo: true })).toBe(-500);
  });
  it("volta para o campo sem o ponto de milhar", () => expect(qtdParaCampo(1_200_500)).toBe("1200,5"));
});

describe("lerReais (texto digitado → centavos)", () => {
  it.each([
    ["1326", 132_600],
    ["1.326,5", 132_650],
    ["R$ 1.326,50", 132_650],
    ["0,05", 5],
  ])("%s → %i", (t, c) => expect(lerReais(t)).toBe(c));
  it.each(["", "1,234", "x"])("recusa %j", (t) => expect(lerReais(t)).toBeNull());
  it("volta para o campo", () => expect(reaisParaCampo(132_650)).toBe("1326,50"));
});

describe("fmtPrevisao", () => {
  it("data ISO vira dia/mês; texto livre passa igual", () => {
    expect(fmtPrevisao("2026-11-03")).toBe("chega 03/11");
    expect(fmtPrevisao("chega sexta")).toBe("chega sexta");
  });
});
