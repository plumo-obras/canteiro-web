import { describe, expect, it } from "vitest";
import type { Cronograma, Orcamento } from "@/lib/contrato";
import { barraDaEtapa } from "@/lib/cronograma";
import { montarLista } from "./orcamento/ListaEtapas";
import { separarVersoes } from "./Orcamento";
import { linhasTabela } from "./cronograma/Tabela";

const z = { cotando: 0, comprometido: 0, realizado: 0 };
const et = (etapa: string, descricao: string, atual: number, g: Partial<typeof z> = {}) => ({ etapa, descricao, contratado: atual, aditivos: 0, atual, ...z, ...g });
const item = (etapa: string, n: string, descricao: string, curva: "A" | "B" | "C", tipo: "item" | "etapa" = "item", nivel = 2) =>
  ({ id: `${etapa}-${n}`, obra_id: "o", versao_id: "v", ordem: 0, tipo, numero: n, nivel, etapa, codigo: "", fonte: "", descricao, unidade: "m³", quantidade: 1000, valor_unitario: 100, total: 100, linha: 1, curva }) as Orcamento["itens"][number];
const orc: Orcamento = {
  versoes: [],
  itens: [
    item("1", "1", "SERVIÇOS PRELIMINARES", "C", "etapa", 1),
    item("1", "1.1", "Placa de obra", "C"),
    item("3", "3", "FUNDAÇÕES", "C", "etapa", 1),
    item("3", "3.1", "Concreto fck 25", "A"),
    item("3", "3.2", "Forma de madeira", "B"),
  ],
  etapas: [et("1", "SERVIÇOS PRELIMINARES", 4_543_363), et("3", "FUNDAÇÕES", 9_550_346, { comprometido: 2_425_000, realizado: 2_334_000 })],
  totais: { contratado: 14_093_709, aditivos: 0, atual: 14_093_709, n_itens: 3, n_etapas: 2, ...z, comprometido: 2_425_000, realizado: 2_334_000, sem_etapa: z },
};

describe("Onda 3: orçamento numa lista só", () => {
  it("sem filtro: todas as etapas com os seus itens, a do desvio em cima; a linha de etapa raiz não vira item", () => {
    const l = montarLista(orc, { busca: "", curva: null, ordem: "desvio" });
    expect(l.map((e) => e.linha.etapa)).toEqual(["3", "1"]);
    expect(l[0]!.itens.map((i) => i.numero)).toEqual(["3.1", "3.2"]);
    expect(l.every((e) => !e.achou)).toBe(true);
    expect(montarLista(orc, { busca: "", curva: null, ordem: "planilha" }).map((e) => e.linha.etapa)).toEqual(["1", "3"]);
  });
  it("busca e curva filtram os itens, somem etapas sem resultado e abrem as que têm", () => {
    const b = montarLista(orc, { busca: "concreto", curva: null, ordem: "planilha" });
    expect(b.map((e) => [e.linha.etapa, e.itens.map((i) => i.numero), e.achou])).toEqual([["3", ["3.1"], true]]);
    expect(montarLista(orc, { busca: "", curva: "C", ordem: "planilha" }).map((e) => e.linha.etapa)).toEqual(["1"]);
    expect(montarLista(orc, { busca: "xyz", curva: null, ordem: "planilha" })).toEqual([]);
  });
  it("versões: à vista o contrato vigente e o último aditivo; o resto no histórico", () => {
    const v = (id: string, tipo: "contrato" | "aditivo", numero: number, ativa: boolean) => ({ id, tipo, numero, ativa });
    const r = separarVersoes([v("a2", "aditivo", 2, true), v("a1", "aditivo", 1, true), v("c2", "contrato", 0, true), v("c1", "contrato", 0, false)]);
    expect(r.principais.map((x) => x.id)).toEqual(["a2", "c2"]);
    expect(r.historico.map((x) => x.id)).toEqual(["a1", "c1"]);
  });
});

describe("Onda 3: Gantt com barra única e tabela físico-financeira", () => {
  it("a barra vai do primeiro ao último mês com %, com as pausas no meio e a fração medida", () => {
    expect(barraDaEtapa([0, 2500, 0, 0, 7500, 0], 3000)).toEqual({ de: 1, ate: 4, pausas: [2, 3], medida: 0.3 });
    expect(barraDaEtapa([5000, 5000], 12000)!.medida).toBe(1);
    expect(barraDaEtapa([0, 0], 0)).toBeNull();
  });
  it("a tabela traz só as etapas do cronograma, com o R$ de cada mês cheio", () => {
    const c = { etapas: [{ etapa: "3", descricao: "FUNDAÇÕES", atual: 9_550_346, percentuais: [500, 2500, 4000, 3000], medido_acumulado: 0 }, { etapa: "9", descricao: "X", atual: 100, percentuais: [0, 0, 0, 0], medido_acumulado: 0 }] } as unknown as Cronograma;
    const t = linhasTabela(c);
    expect(t.map((l) => l.etapa)).toEqual(["3"]);
    expect(t[0]!.meses.map((m) => m.valor)).toEqual([477_517, 2_387_587, 3_820_138, 2_865_104]);
  });
});

import { reaisCurtos } from "./Orcamento";
describe("Onda 3: faixa do Orçamento no celular", () => {
  it("valores curtos (o cheio fica no toque)", () => {
    expect(reaisCurtos(207_058_338)).toBe("R$ 2,07 mi");
    expect(reaisCurtos(2_334_000)).toBe("R$ 23,3 mil");
    expect(reaisCurtos(91_000)).toBe("R$ 910,00");
    expect(reaisCurtos(-150_000_000)).toBe("−R$ 1,5 mi");
  });
});
