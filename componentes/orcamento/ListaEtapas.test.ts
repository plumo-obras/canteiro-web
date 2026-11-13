import { describe, expect, it } from "vitest";
import type { Orcamento } from "@/lib/contrato";
import { montarLista } from "./ListaEtapas";

const z = { cotando: 0, comprometido: 0, realizado: 0 };
const et = (etapa: string, descricao: string, atual: number, g: Partial<typeof z> = {}) => ({
  etapa, descricao, contratado: atual, aditivos: 0, atual, ...z, ...g,
  // saldo e estouro vêm prontos da API; aqui o dublê os preenche como ela faria
  saldo: atual - (g.comprometido ?? 0), estourou: (g.comprometido ?? 0) > atual,
});
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
  totais: { contratado: 14_093_709, aditivos: 0, atual: 14_093_709, saldo: 14_093_709 - 2_425_000, aditivos_pct: 0, n_itens: 3, n_etapas: 2, ...z, comprometido: 2_425_000, realizado: 2_334_000, sem_etapa: z },
};

describe("Orçamento: lista única de etapas e itens", () => {
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

  it("curva ABC: o dinheiro primeiro, a etapa pelo orçado e o item pelo total, sem os títulos de sub-etapa", () => {
    const comTotais: Orcamento = { ...orc, itens: orc.itens.map((i) => (i.numero === "3.2" ? { ...i, total: 900 } : i)) };
    const l = montarLista(comTotais, { busca: "", curva: null, ordem: "abc" });
    expect(l.map((e) => e.linha.etapa)).toEqual(["3", "1"]);
    expect(l[0]!.itens.map((i) => i.numero)).toEqual(["3.2", "3.1"]);
  });
});
