import { describe, expect, it } from "vitest";
import type { ResumoDaObra } from "@/lib/contrato";
import { sugestoesDaObra } from "./sugestoes";

const r = (fin: Partial<ResumoDaObra["financeiro"]>, resto: Partial<ResumoDaObra> = {}, cro: Partial<ResumoDaObra["cronograma"]> = { cadastrado: true }) =>
  ({ obra: {}, financeiro: { tem_orcamento: true, ...fin }, cronograma: cro, ...resto }) as ResumoDaObra;
const emObra = { status: "em_andamento" as const };

describe("as sugestões da conversa acompanham o momento da obra", () => {
  it("sem resumo, só a pergunta que serve para qualquer obra", () => {
    expect(sugestoesDaObra(emObra, null)).toEqual(["Como está a obra?"]);
  });

  it("sem orçamento fala em fechar o orçamento", () => {
    expect(sugestoesDaObra({ status: "em_orcamento" }, r({ tem_orcamento: false }))[0]).toBe("O que falta para fechar o orçamento?");
  });

  it("orçamento ainda aberto fala em preço e aprovação", () => {
    expect(sugestoesDaObra({ status: "em_orcamento" }, r({})).slice(0, 2)).toEqual(["Quais itens estão sem preço?", "O que falta para aprovar o orçamento?"]);
  });

  it("aprovado fala em comprar, e os alertas entram na frente da geral", () => {
    expect(sugestoesDaObra(emObra, r({}))).toEqual(["O que preciso comprar primeiro?", "Como está a obra?"]);
    expect(sugestoesDaObra(emObra, r({}, { pendencias: { propostas: 2 } }))).toEqual(["O que preciso comprar primeiro?", "O que está esperando a minha aprovação?", "Como está a obra?"]);
  });

  it("sem cronograma lembra de montar, e nunca passa de três", () => {
    expect(sugestoesDaObra(emObra, r({}, {}, { cadastrado: false }))).toContain("O que falta para montar o cronograma?");
    const cheia = r({ etapas_estouradas: [{}] }, { pendencias: { propostas: 1 }, entregas: { atrasadas: [{}] } }, { cadastrado: false });
    expect(sugestoesDaObra(emObra, cheia)).toHaveLength(3);
  });

  it("obra concluída olha para trás", () => {
    expect(sugestoesDaObra({ status: "concluida" }, r({}))).toEqual(["Quanto gastei no total?", "Fechou dentro do orçado?"]);
  });
});
