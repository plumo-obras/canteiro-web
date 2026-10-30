import { describe, expect, it } from "vitest";
import type { SessaoApi } from "@/lib/historico";
import { novaSessao, redutorSessoes } from "./sessoes";

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
});
