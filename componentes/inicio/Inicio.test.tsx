import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ResumoObra, Usuario } from "@/lib/contrato";
import type { SessaoApi } from "@/lib/historico";
import { criarRede, json } from "@/testes/rede";
import { Inicio, hrefDaObra } from "./Inicio";

vi.mock("@/lib/sessao", () => ({ comAcesso: (u: string, i: RequestInit) => fetch(u, i) }));
afterEach(() => vi.unstubAllGlobals());

const obra = (id: string, nome: string, status: ResumoObra["obra"]["status"] = "em_andamento") => ({
  id, nome, status, cidade: "Campinas", cep: "", verba: 0, tenant_id: "t", criado_em: "",
});
const sessao = (id: string, obra_id: string | null) => ({ id, obra_id }) as SessaoApi;
const eu: Usuario = { id: "u", nome: "Marina Duarte", tenant_id: "t", papel: "admin" };

describe("hrefDaObra", () => {
  it("abre a sessão mais recente da obra ou uma nova", () => {
    const ss = [sessao("s-b", "b"), sessao("s-a2", "a"), sessao("s-a1", "a")];
    expect(hrefDaObra("a", ss)).toBe("/?obra=a&sessao=s-a2");
    expect(hrefDaObra("c", ss)).toBe("/?obra=c");
  });
});

describe("Inicio", () => {
  it("obra sem orçamento não diz 'Em orçamento'", async () => {
    criarRede({
      "GET /srv/api/obras/resumo": () =>
        json([
          { obra: obra("a", "Obra Sem Nada", "em_orcamento"), pendencias: 0, falta_comprar: 0, pedidos_abertos: 0, valor_pedidos_abertos: 0, nf_para_conferir: 0, ultima_atividade: null, tem_orcamento: false },
          { obra: obra("b", "Obra Orcada", "em_orcamento"), pendencias: 0, falta_comprar: 0, pedidos_abertos: 0, valor_pedidos_abertos: 0, nf_para_conferir: 0, ultima_atividade: null, tem_orcamento: true },
        ]),
      "GET /srv/api/sessoes": () => json([]),
    });
    render(<Inicio usuario={eu} />);
    const sem = (await screen.findByRole("heading", { name: "Obra Sem Nada" })).closest("a")!;
    const com = screen.getByRole("heading", { name: "Obra Orcada" }).closest("a")!;
    expect(sem).toHaveTextContent("Sem orçamento");
    expect(com).toHaveTextContent("Em orçamento");
  });

  it("saúda pelo primeiro nome e mostra um cartão por obra com o que pede ação", async () => {
    criarRede({
      "GET /srv/api/obras/resumo": () =>
        json([
          { obra: obra("b", "Reforma Loja", "concluida"), pendencias: 0, falta_comprar: 0, pedidos_abertos: 0, valor_pedidos_abertos: 0, nf_para_conferir: 0, ultima_atividade: null },
          { obra: obra("a", "Casa Vila Nova"), pendencias: 2, falta_comprar: 1, pedidos_abertos: 3, valor_pedidos_abertos: 2980000, nf_para_conferir: 1, ultima_atividade: new Date().toISOString() },
        ]),
      "GET /srv/api/sessoes": () => json([sessao("s1", "a")]),
    });
    render(<Inicio usuario={eu} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Olá, Marina");
    const cartoes = await screen.findAllByRole("listitem");
    // em andamento primeiro
    expect(cartoes[0]!.textContent).toContain("Casa Vila Nova");
    expect(cartoes[0]!.textContent).toContain("3 pedidos a receber · R$ 29.800,00");
    expect(cartoes[0]!.textContent).toContain("1 insumo a comprar");
    // o cartão inteiro é o link; sem botão "Abrir obra"
    expect(screen.queryByRole("link", { name: "Abrir obra" })).toBeNull();
    const abrir = screen.getAllByRole("link").filter((l) => l.getAttribute("href")?.startsWith("/?obra="));
    expect(abrir[0]!.getAttribute("href")).toBe("/?obra=a&sessao=s1");
    expect(abrir[1]!.getAttribute("href")).toBe("/?obra=b");
    expect(screen.getAllByText(/2 aprovações esperando você/).length).toBeGreaterThan(0);
    // sem pendência nenhuma: uma linha só, nada de "nenhuma/nada"
    expect(cartoes.at(-1)!.textContent).toContain("Tudo em dia");
    expect(cartoes.at(-1)!.textContent).not.toMatch(/nenhum|nada/);
    expect(cartoes.at(-1)!.textContent).toContain("Sem atividade ainda");
  });
});
