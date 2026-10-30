import { describe, expect, it } from "vitest";
import { criarLeitorSSE, interpretarEvento, lerSSE } from "./sse";
import { sse } from "@/testes/rede";

describe("leitor SSE", () => {
  it("monta eventos que chegam partidos em qualquer ponto", async () => {
    const texto =
      'event: ferramenta\ndata: {"nome":"consultar_estoque","nivel":"consulta","resumo":"usou almoxarifado"}\n\n' +
      'event: texto\ndata: {"delta":"Faltam 34 sc"}\n\n' +
      ": comentário de keep-alive\n\n" +
      'event: fim\ndata: {"sessao_id":"s1","uso":{"tokens":10,"custo":3}}\n\n';
    for (const tam of [1, 3, 7, 1000]) {
      const r = sse(texto, tam);
      const evs = [];
      for await (const e of lerSSE(r.body!)) evs.push(e);
      expect(evs.map((e) => e.evento)).toEqual(["ferramenta", "texto", "fim"]);
    }
  });

  it("aceita CRLF partido entre pedaços, várias linhas data e evento sem linha em branco final", () => {
    const l = criarLeitorSSE();
    const a = l.empurrar("event: texto\r");
    const b = l.empurrar("\ndata: linha 1\r\ndata: linha 2\r\n\r\nevent: fim\ndata: {}");
    const c = l.fim();
    expect(a).toEqual([]);
    expect(b).toEqual([{ evento: "texto", dados: "linha 1\nlinha 2" }]);
    expect(c).toEqual([{ evento: "fim", dados: "{}" }]);
  });

  it("traduz os eventos do contrato e ignora os desconhecidos", () => {
    expect(interpretarEvento({ evento: "texto", dados: '{"delta":"oi"}' })).toEqual({ tipo: "texto", delta: "oi" });
    expect(interpretarEvento({ evento: "erro", dados: '{"mensagem":"Sem créditos"}' })).toEqual({ tipo: "erro", mensagem: "Sem créditos" });
    expect(interpretarEvento({ evento: "erro", dados: "texto cru" })).toEqual({ tipo: "erro", mensagem: "texto cru" });
    expect(interpretarEvento({ evento: "novidade", dados: "{}" })).toBeNull();
    const p = { id: "p1", titulo: "Comprar" };
    expect(interpretarEvento({ evento: "proposta", dados: JSON.stringify(p) })).toMatchObject({ tipo: "proposta", proposta: p });
    expect(interpretarEvento({ evento: "proposta", dados: JSON.stringify({ proposta: p }) })).toMatchObject({ tipo: "proposta", proposta: p });
  });
});
