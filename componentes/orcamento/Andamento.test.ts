import { describe, expect, it } from "vitest";
import type { Orcamento } from "@/lib/contrato";
import { csvAndamento, fmtPctAditivo, linhasAndamento, numeroVisivel, porDesvio } from "./Andamento";

const z = { gasto: 0 };
const et = (etapa: string, descricao: string, atual: number, g: Partial<typeof z> = {}) => ({
  etapa, descricao, contratado: atual, aditivos: 0, atual, ...z, ...g,
  // saldo e estouro vêm prontos da API; aqui o dublê os preenche como ela faria
  saldo: atual - (g.gasto ?? 0), estourou: (g.gasto ?? 0) > atual,
});
const orc = (sem = z): Orcamento => ({
  versoes: [],
  itens: [],
  etapas: [et("1", "SERVIÇOS PRELIMINARES", 4_543_363), et("3", "FUNDAÇÕES", 9_550_346, { gasto: 10_000_000 }), et("4", "SUPERESTRUTURA", 11_295_680, { gasto: 1_000_000 })],
  totais: { contratado: 25_389_389, aditivos: 0, atual: 25_389_389, saldo: 25_389_389 - 11_000_000 - sem.gasto, aditivos_pct: 0, n_itens: 3, n_etapas: 3, gasto: 11_000_000 + sem.gasto, sem_etapa: sem },
});

describe("andamento por etapa", () => {
  it("saldo, % e ordem por desvio (estouro primeiro)", () => {
    const ls = linhasAndamento(orc()).sort(porDesvio);
    expect(ls.map((l) => l.etapa)).toEqual(["3", "4", "1"]);
    expect(ls[0]).toMatchObject({ saldo: 9_550_346 - 10_000_000 });
    expect(ls[0]!.pct).toBeGreaterThan(1);
  });

  it("linha Sem etapa só quando há gasto sem etapa, e vai para o topo do desvio", () => {
    expect(linhasAndamento(orc()).some((l) => l.semEtapa)).toBe(false);
    const ls = linhasAndamento(orc({ gasto: 91_000 })).sort(porDesvio);
    expect(ls[0]).toMatchObject({ semEtapa: true, descricao: "Sem etapa", gasto: 91_000, saldo: -91_000 });
  });

  it("CSV para o Excel com total", () => {
    const linhas = csvAndamento(orc()).replace("﻿", "").trim().split("\r\n");
    expect(linhas[0]).toBe("Etapa;Descrição;Orçado atual;Gasto;Falta gastar;% gasto");
    expect(linhas[2]).toBe("3;FUNDAÇÕES;95503,46;100000,00;-4496,54;104,7");
    expect(linhas.at(-1)).toBe(";Total;253893,89;110000,00;143893,89;43,3");
  });

  it("% de aditivo com sinal, sem limite nenhum", () => {
    expect(fmtPctAditivo(294)).toBe("+2,9%");
    expect(fmtPctAditivo(102_200)).toBe("+1.022%");
    expect(fmtPctAditivo(-150)).toBe("−1,5%");
    expect(fmtPctAditivo(null)).toBe("+0%");
  });
});

describe("numeroVisivel", () => {
  it("mostra a chave da planilha e esconde a da lista padrão e a do nome", () => {
    expect(["18", "A1", "2", "alvenaria", "revestimento_interno", "fundacoes", ""].map(numeroVisivel)).toEqual(["18", "A1", "2", "", "", "", ""]);
  });
});
