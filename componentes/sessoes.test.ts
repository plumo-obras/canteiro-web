import { describe, expect, it } from "vitest";
import type { SessaoApi } from "@/lib/historico";
import type { EventoConversa } from "@/lib/contrato";
import { novaPergunta, novaSessao, redutorSessoes, type MsgAgente } from "./sessoes";

const api = (id: string, extra: Partial<SessaoApi> = {}): SessaoApi => ({
  id, tenant_id: "t", dono: "u", obra_id: "o2", titulo: `t-${id}`, abas: [], total_mensagens: 4, criado_em: "", atualizado_em: "", ...extra,
});

describe("sessões da lateral", () => {
  it("lista do servidor entra depois das locais, sem repetir a que já está aberta aqui, e sem mensagens", () => {
    const local = novaSessao("o1");
    const ss = redutorSessoes([local], {
      tipo: "listadas",
      obraPadrao: "o1",
      sessoes: [api(local.servidorId!), api("a"), api("b", { obra_id: null, total_mensagens: 0 })],
    });
    expect(ss.map((s) => s.id)).toEqual([local.id, "a", "b"]);
    expect(ss[1]).toMatchObject({ servidorId: "a", obraId: "o2", carregada: false, mensagens: [] });
    expect(ss[2]).toMatchObject({ obraId: "o1", carregada: true }); // sem obra cai na padrão; vazia não precisa buscar
  });

  it("carregou preenche; falhou guarda o erro e 'tentar de novo' limpa", () => {
    let ss = redutorSessoes([], { tipo: "listadas", obraPadrao: "o1", sessoes: [api("a")] });
    ss = redutorSessoes(ss, { tipo: "falhouCarga", sessaoId: "a", erro: "rede" });
    expect(ss[0]!.erroCarga).toBe("rede");
    ss = redutorSessoes(ss, { tipo: "falhouCarga", sessaoId: "a", erro: null });
    ss = redutorSessoes(ss, { tipo: "carregou", sessaoId: "a", mensagens: [{ id: "m", papel: "eu", texto: "oi" }] });
    expect(ss[0]).toMatchObject({ carregada: true, erroCarga: null, mensagens: [{ texto: "oi" }] });
  });

  it("sessão nova vai para o topo", () => {
    const a = novaSessao("o1");
    const b = novaSessao("o1");
    expect(redutorSessoes(redutorSessoes([], { tipo: "nova", sessao: a }), { tipo: "nova", sessao: b }).map((s) => s.id)).toEqual([b.id, a.id]);
  });

  describe("texto antes e depois de uma ferramenta", () => {
    const tocar = (eventos: EventoConversa[]) => {
      const s = novaSessao("o1");
      const { eu, agente } = novaPergunta("e aí, como tá a obra?");
      let ss = redutorSessoes([s], { tipo: "perguntou", sessaoId: s.id, eu, agente });
      for (const evento of eventos) ss = redutorSessoes(ss, { tipo: "evento", sessaoId: s.id, msgId: agente.id, evento });
      return (ss[0]!.mensagens[1] as MsgAgente).texto;
    };
    const t = (delta: string): EventoConversa => ({ tipo: "texto", delta });
    const f: EventoConversa = { tipo: "ferramenta", nome: "listar_pedidos", nivel: "consulta", resumo: "usou pedidos" };

    it("a fala depois da ferramenta vira outro parágrafo (antes grudava: 'da obra.A obra')", () => {
      expect(tocar([t("Vou olhar o "), t("andamento da obra."), f, t("A obra "), t("está em dia.")])).toBe(
        "Vou olhar o andamento da obra.\n\nA obra está em dia.",
      );
    });

    it("não dobra a linha em branco nem põe uma no começo do balão", () => {
      expect(tocar([t("Olhei.\n\n"), f, t("Tudo certo.")])).toBe("Olhei.\n\nTudo certo.");
      expect(tocar([t("- item\n"), f, t("Fim.")])).toBe("- item\n\nFim.");
      expect(tocar([f, t("Todos "), t("os aços chegaram.")])).toBe("Todos os aços chegaram.");
      // o espaço da ponta não vira recuo (4 espaços seriam bloco de código)
      expect(tocar([t("aços. "), f, t("    Todos")])).toBe("aços.\n\nTodos");
    });

    it("só uma quebra por ferramenta: o resto da fala segue no mesmo parágrafo", () => {
      expect(tocar([t("a."), f, f, t("B "), t("c.")])).toBe("a.\n\nB c.");
    });

    it("descartar logo depois da ferramenta ainda tira a fala, sem deixar linha em branco sobrando", () => {
      expect(tocar([t("Deixa eu ver."), f, { tipo: "descartar", texto: "Deixa eu ver." }, t("Pronto.")])).toBe("Pronto.");
    });
  });
});
