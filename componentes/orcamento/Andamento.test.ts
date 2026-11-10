import { describe, expect, it } from "vitest";
import type { Orcamento } from "@/lib/contrato";
import { csvAndamento, fmtPctAditivo, linhasAndamento, porDesvio } from "./Andamento";

const z = { cotando: 0, comprometido: 0, realizado: 0 };
const et = (etapa: string, descricao: string, atual: number, g: Partial<typeof z> = {}) => ({
  etapa, descricao, contratado: atual, aditivos: 0, atual, ...z, ...g,
  // saldo e estouro vêm prontos da API; aqui o dublê os preenche como ela faria
  saldo: atual - (g.comprometido ?? 0), estourou: (g.comprometido ?? 0) > atual,
});
const orc = (sem = z): Orcamento => ({
  versoes: [],
  itens: [],
  etapas: [et("1", "SERVIÇOS PRELIMINARES", 4_543_363), et("3", "FUNDAÇÕES", 9_550_346, { comprometido: 10_000_000, realizado: 6_000_000, cotando: 50_000 }), et("4", "SUPERESTRUTURA", 11_295_680, { comprometido: 1_000_000 })],
  totais: { contratado: 25_389_389, aditivos: 0, atual: 25_389_389, saldo: 25_389_389 - 11_000_000 - sem.comprometido, aditivos_pct: 0, n_itens: 3, n_etapas: 3, cotando: 50_000 + sem.cotando, comprometido: 11_000_000 + sem.comprometido, realizado: 6_000_000 + sem.realizado, sem_etapa: sem },
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
    const ls = linhasAndamento(orc({ cotando: 0, comprometido: 91_000, realizado: 0 })).sort(porDesvio);
    expect(ls[0]).toMatchObject({ semEtapa: true, descricao: "Sem etapa", comprometido: 91_000, saldo: -91_000 });
  });

  it("CSV para o Excel com total", () => {
    const linhas = csvAndamento(orc()).replace("﻿", "").trim().split("\r\n");
    expect(linhas[0]).toBe("Etapa;Descrição;Orçado atual;Em cotação;Comprometido;Realizado;Saldo a comprometer;% comprometido");
    expect(linhas[2]).toBe("3;FUNDAÇÕES;95503,46;500,00;100000,00;60000,00;-4496,54;104,7");
    expect(linhas.at(-1)).toBe(";Total;253893,89;500,00;110000,00;60000,00;143893,89;43,3");
  });

  it("% de aditivo com sinal, sem limite nenhum", () => {
    expect(fmtPctAditivo(294)).toBe("+2,9%");
    expect(fmtPctAditivo(102_200)).toBe("+1.022%");
    expect(fmtPctAditivo(-150)).toBe("−1,5%");
    expect(fmtPctAditivo(null)).toBe("+0%");
  });
});
