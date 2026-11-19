import { describe, expect, it } from "vitest";
import type { Obra, ResumoDaObra } from "@/lib/contrato";
import { etapasDaObra, montando } from "./etapas";

const obra = (status: Obra["status"]): Obra => ({ id: "o1", nome: "Casa", status }) as unknown as Obra;
const resumo = (o: Obra, f: Partial<ResumoDaObra["financeiro"]> = {}, c: Partial<ResumoDaObra["cronograma"]> = {}): ResumoDaObra => ({
  obra: o,
  financeiro: { tem_orcamento: false, orcado_atual: 0, gasto: 0, saldo: 0, ...f },
  cronograma: { cadastrado: false, termino_contratual: null, termino_projetado: null, atraso_decimos: null, ...c },
});
/** "Projeto:feita" … um passo por item, fácil de ler no erro. */
const linha = (o: Obra, r: ResumoDaObra | null) => etapasDaObra(o, r)?.map((e) => `${e.rotulo}:${e.estado}${e.detalhe ? ` ${e.detalhe}` : ""}${e.acao ? ` [${e.acao}]` : ""}`);

describe("etapasDaObra (Montando a obra)", () => {
  it("sem o resumo desta obra não afirma nada", () => {
    const o = obra("em_andamento");
    expect(etapasDaObra(o, null)).toBeNull();
    expect(etapasDaObra(o, resumo({ ...o, id: "outra" } as Obra))).toBeNull();
    expect(montando(null)).toBe(false);
  });

  it("sem orçamento: começa pelo projeto, com o botão de enviar as pranchas", () => {
    const o = obra("em_orcamento");
    expect(linha(o, resumo(o))).toEqual(["Projeto:atual comece por aqui [Enviar as pranchas]", "Orçamento:depois", "Cronograma:depois"]);
  });

  it("orçamento montado e ainda não aprovado: o passo é aprovar; o cronograma vem depois da aprovação", () => {
    const o = obra("em_orcamento");
    expect(linha(o, resumo(o, { tem_orcamento: true }))).toEqual(["Projeto:feita", "Orçamento:atual para aprovar [Revisar e aprovar]", "Cronograma:depois depois da aprovação"]);
  });

  it("cronograma gerado ainda no orçamento já conta como feito", () => {
    const o = obra("em_orcamento");
    expect(linha(o, resumo(o, { tem_orcamento: true }, { cadastrado: true }))?.[2]).toBe("Cronograma:feita");
  });

  it("aprovada sem cronograma: falta montar o cronograma", () => {
    const o = obra("em_andamento");
    expect(linha(o, resumo(o, { tem_orcamento: true }))).toEqual(["Projeto:feita", "Orçamento:feita", "Cronograma:atual falta montar [Montar o cronograma]"]);
  });

  it("aprovada com cronograma: os três passos feitos e a linha sai de cena", () => {
    const o = obra("em_andamento");
    const etapas = etapasDaObra(o, resumo(o, { tem_orcamento: true }, { cadastrado: true }));
    expect(etapas?.every((e) => e.estado === "feita")).toBe(true);
    expect(montando(etapas)).toBe(false);
  });

  it("concluída: tudo feito, mesmo sem cronograma gravado", () => {
    const o = obra("concluida");
    expect(montando(etapasDaObra(o, resumo(o, { tem_orcamento: true })))).toBe(false);
  });

  it("desfazendo a aprovação: a linha volta, com o Orçamento pedindo atenção", () => {
    const o = obra("desfazendo_aprovacao");
    const etapas = etapasDaObra(o, resumo(o, { tem_orcamento: true }, { cadastrado: true }));
    expect(etapas?.map((e) => `${e.rotulo}:${e.estado}${e.detalhe ? ` ${e.detalhe}` : ""}`)).toEqual(["Projeto:feita", "Orçamento:atencao desfazendo a aprovação", "Cronograma:feita"]);
    expect(montando(etapas)).toBe(true);
  });
});
