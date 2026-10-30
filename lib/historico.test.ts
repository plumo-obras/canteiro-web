import { describe, expect, it } from "vitest";
import { formatarHistorico, type MensagemSessao } from "./historico";

let seq = 0;
const m = (papel: "user" | "assistant", conteudo: MensagemSessao["conteudo"]): MensagemSessao => ({
  id: `s1-${String(seq).padStart(6, "0")}`,
  sessao_id: "s1",
  seq: seq++,
  papel,
  conteudo,
  criado_em: "2026-10-30T13:00:00Z",
});

describe("formatador do histórico da sessão", () => {
  it("volta com ferramentas vira um balão: textos, chips 'usou …' e o cartão do propor_*; tool_result some", () => {
    seq = 0;
    const { mensagens, propostaIds } = formatarHistorico([
      m("user", [{ type: "text", text: "(Obra em foco na tela: obra_id=o1)" }, { type: "text", text: "precisa comprar bloco?" }]),
      m("assistant", [{ type: "text", text: "Vou olhar o almoxarifado." }, { type: "tool_use", id: "tu1", name: "consultar_estoque", input: {} }]),
      m("user", [{ type: "tool_result", tool_use_id: "tu1", content: '[{"insumo":"bloco","falta":"640"}]' }]),
      m("assistant", [{ type: "text", text: "Falta **640 un**." }, { type: "tool_use", id: "tu2", name: "propor_pedido", input: {} }]),
      m("user", [{ type: "tool_result", tool_use_id: "tu2", content: [{ type: "text", text: '{"proposta_id":"p1","status":"pendente"}' }] }]),
      m("assistant", [{ type: "text", text: "Preparei a compra para você aprovar." }]),
    ]);
    expect(mensagens).toEqual([
      { id: "s1-000000", papel: "eu", texto: "precisa comprar bloco?" },
      {
        id: "s1-000001",
        papel: "agente",
        texto: "Vou olhar o almoxarifado.\n\nFalta **640 un**.\n\nPreparei a compra para você aprovar.",
        ferramentas: [
          { nome: "consultar_estoque", nivel: "consulta", resumo: "usou almoxarifado" },
          { nome: "propor_pedido", nivel: "propoe", resumo: "preparou uma proposta de pedido" },
        ],
        propostas: ["p1"],
        erro: null,
        terminou: true,
      },
    ]);
    expect(propostaIds).toEqual(["p1"]);
    expect(JSON.stringify(mensagens)).not.toContain("insumo"); // conteúdo de tool_result nunca aparece
  });

  it("vários turnos, conteúdo em texto puro e fora de ordem de seq", () => {
    seq = 0;
    const a = m("user", "oi");
    const b = m("assistant", "Olá! Em que posso ajudar?");
    const c = m("user", [{ type: "text", text: "e o aço?" }]);
    const d = m("assistant", [{ type: "text", text: "Coberto." }]);
    const { mensagens } = formatarHistorico([c, a, d, b]);
    expect(mensagens.map((x) => [x.papel, x.papel === "eu" ? x.texto : x.texto])).toEqual([
      ["eu", "oi"],
      ["agente", "Olá! Em que posso ajudar?"],
      ["eu", "e o aço?"],
      ["agente", "Coberto."],
    ]);
  });

  it("ignora resultado com erro, resultado de consulta com proposta_id e JSON quebrado", () => {
    seq = 0;
    const { mensagens, propostaIds } = formatarHistorico([
      m("user", "compra cimento"),
      m("assistant", [
        { type: "tool_use", id: "a", name: "propor_pedido" },
        { type: "tool_use", id: "b", name: "listar_pedidos" },
        { type: "tool_use", id: "c", name: "propor_ajuste_estoque" },
      ]),
      m("user", [
        { type: "tool_result", tool_use_id: "a", content: "Quantidade e valor têm de ser maiores que zero.", is_error: true },
        { type: "tool_result", tool_use_id: "b", content: '{"proposta_id":"nao-e-proposta"}' },
        { type: "tool_result", tool_use_id: "c", content: "{quebrado" },
      ]),
      m("assistant", [{ type: "text", text: "Faltou o valor." }]),
    ]);
    expect(propostaIds).toEqual([]);
    expect(mensagens[1]).toMatchObject({ texto: "Faltou o valor.", propostas: [] });
    expect((mensagens[1] as { ferramentas: unknown[] }).ferramentas).toHaveLength(3);
  });

  it("ferramenta desconhecida vira 'usou <nome>'; histórico vazio dá lista vazia", () => {
    seq = 0;
    const { mensagens } = formatarHistorico([m("user", "x"), m("assistant", [{ type: "tool_use", id: "z", name: "buscar_preco" }])]);
    expect(mensagens[1]).toMatchObject({ ferramentas: [{ resumo: "usou buscar preco", nivel: "consulta" }] });
    expect(formatarHistorico([])).toEqual({ mensagens: [], propostaIds: [] });
  });
});
