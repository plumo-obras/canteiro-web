import { describe, expect, it } from "vitest";
import { interpretarEvento } from "@/lib/sse";
import { novaPergunta, novaSessao, redutorSessoes, type MsgAgente } from "./sessoes";

describe("o agente refaz a resposta (evento descartar)", () => {
  const preparar = () => {
    const s = novaSessao("o1");
    const { eu, agente } = novaPergunta("quanto falta?");
    const ev = (e: Parameters<typeof interpretarEvento>[0]) => ({
      tipo: "evento" as const, sessaoId: s.id, msgId: agente.id, evento: interpretarEvento(e)!,
    });
    let ss = redutorSessoes([s], { tipo: "perguntou", sessaoId: s.id, eu, agente });
    const texto = () => (ss[0]!.mensagens.at(-1) as MsgAgente).texto;
    return { ev, aplicar: (a: ReturnType<typeof ev>) => (ss = redutorSessoes(ss, a)), texto };
  };

  it("tira do balão só o texto da tentativa abortada e segue com a nova", () => {
    const { ev, aplicar, texto } = preparar();
    aplicar(ev({ evento: "texto", dados: '{"delta":"Faltam 640 un. "}' }));
    aplicar(ev({ evento: "texto", dados: '{"delta":"Vou propor o ped"}' }));
    aplicar(ev({ evento: "descartar", dados: '{"texto":"Vou propor o ped"}' }));
    expect(texto()).toBe("Faltam 640 un. ");
    aplicar(ev({ evento: "texto", dados: '{"delta":"Proponho o pedido."}' }));
    expect(texto()).toBe("Faltam 640 un. Proponho o pedido.");
  });

  it("não corta nada se o balão não termina naquele texto", () => {
    const { ev, aplicar, texto } = preparar();
    aplicar(ev({ evento: "texto", dados: '{"delta":"Faltam 640 un."}' }));
    aplicar(ev({ evento: "descartar", dados: '{"texto":"outra coisa"}' }));
    expect(texto()).toBe("Faltam 640 un.");
  });
});
