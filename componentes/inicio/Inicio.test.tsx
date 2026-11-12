import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ResumoObra, Usuario } from "@/lib/contrato";
import type { SessaoApi } from "@/lib/historico";
import { criarRede, json } from "@/testes/rede";
import { Inicio, avisosDe, hrefDaObra, resumoDoDia, saudacao } from "./Inicio";

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
    expect(hrefDaObra("a", ss, "aprovacoes")).toBe("/?obra=a&sessao=s-a2&tela=aprovacoes");
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
    expect(sem).toHaveTextContent("sem orçamento");
    expect(com).toHaveTextContent("em orçamento");
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
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(`${saudacao()}, Marina`);
    const lista = await screen.findByRole("list", { name: "Obras" });
    const cartoes = within(lista)
      .getAllByRole("listitem")
      .filter((li) => li.parentElement === lista);
    // em andamento primeiro
    expect(cartoes[0]!.textContent).toContain("Casa Vila Nova");
    expect(cartoes[0]!.textContent).toContain("3 pedidos a receber");
    expect(cartoes[0]!.textContent).toContain("1 insumo a comprar");
    // o cartão inteiro é o link; sem botão "Abrir obra"
    expect(screen.queryByRole("link", { name: "Abrir obra" })).toBeNull();
    const abrir = within(lista).getAllByRole("link");
    expect(abrir[0]!.getAttribute("href")).toBe("/?obra=a&sessao=s1");
    expect(abrir[1]!.getAttribute("href")).toBe("/?obra=b");
    expect(within(cartoes[0]!).getByText("2 aprovações")).toBeTruthy();
    expect(await screen.findByText("Duas obras, três coisas esperando você.")).toBeTruthy();
    // sem pendência nenhuma: uma linha só, nada de "nenhuma/nada"
    expect(cartoes.at(-1)!.textContent).toContain("Tudo em dia");
    expect(cartoes.at(-1)!.textContent).not.toMatch(/nenhum|nada/);
    expect(cartoes.at(-1)!.textContent).toContain("Sem atividade ainda");
    // com uma obra só esperando, a etiqueta do topo leva direto à tela dela
    const avisos = screen.getByRole("navigation", { name: "Esperando você" });
    expect(within(avisos).getByRole("link", { name: /2 aprovações/ }).getAttribute("href")).toBe("/?obra=a&sessao=s1&tela=aprovacoes");
    expect(within(avisos).getByRole("link", { name: /1 comprovante para conferir/ }).getAttribute("href")).toBe("/?obra=a&sessao=s1&tela=suprimentos");
  });

  it("etiqueta que soma várias obras filtra os cartões; a situação mostra os contadores", async () => {
    const r = (id: string, nome: string, pendencias: number, status: ResumoObra["obra"]["status"] = "em_andamento") => ({
      obra: obra(id, nome, status), pendencias, falta_comprar: 0, pedidos_abertos: 0, valor_pedidos_abertos: 0, nf_para_conferir: 0, ultima_atividade: null,
    });
    criarRede({
      "GET /srv/api/obras/resumo": () => json([r("a", "Obra A", 1), r("b", "Obra B", 2), r("c", "Obra C", 0, "em_orcamento")]),
      "GET /srv/api/sessoes": () => json([]),
    });
    render(<Inicio usuario={eu} />);
    const situacao = await screen.findByRole("group", { name: "Situação" });
    expect(within(situacao).getByRole("button", { name: "Em andamento 2" })).toBeTruthy();
    expect(within(situacao).getByRole("button", { name: "Concluídas" })).toBeTruthy();
    const etiqueta = within(screen.getByRole("navigation", { name: "Esperando você" })).getByRole("button", { name: /3 aprovações/ });
    await userEvent.click(etiqueta);
    expect(etiqueta.getAttribute("aria-pressed")).toBe("true");
    const nomes = within(screen.getByRole("list", { name: "Obras" }))
      .getAllByRole("heading")
      .map((h) => h.textContent);
    expect(nomes).toEqual(["Obra A", "Obra B"]);
  });
});

describe("resumoDoDia", () => {
  it("fala os números pequenos por extenso, no feminino", () => {
    const r = (pendencias: number, nf: number) =>
      ({ obra: obra("x", "X"), pendencias, nf_para_conferir: nf, falta_comprar: 0, pedidos_abertos: 0, valor_pedidos_abertos: 0, ultima_atividade: null }) as ResumoObra;
    expect(resumoDoDia([r(1, 1), r(0, 0), r(0, 0)])).toBe("Três obras, duas coisas esperando você.");
    expect(resumoDoDia([r(0, 0)])).toBe("Uma obra, nada esperando você.");
    expect(resumoDoDia(Array.from({ length: 12 }, () => r(1, 0)))).toBe("12 obras, 12 coisas esperando você.");
  });

  it("saúda pela hora do canteiro", () => {
    expect(saudacao(new Date("2026-11-12T11:00:00Z"))).toBe("Bom dia"); // 08h em São Paulo
    expect(saudacao(new Date("2026-11-12T17:00:00Z"))).toBe("Boa tarde"); // 14h
    expect(saudacao(new Date("2026-11-12T23:00:00Z"))).toBe("Boa noite"); // 20h
  });
});

describe("avisosDe", () => {
  it("um aviso por tipo, somando as obras, aprovações antes, e nada com zero", () => {
    const r = (id: string, pendencias: number, nf: number) =>
      ({ obra: obra(id, `Obra ${id}`), pendencias, nf_para_conferir: nf, falta_comprar: 0, pedidos_abertos: 0, valor_pedidos_abertos: 0, ultima_atividade: null }) as ResumoObra;
    const avisos = avisosDe([r("a", 0, 2), r("b", 1, 0), r("c", 2, 1)]);
    expect(avisos.map((a) => [a.texto, a.curto, a.tela, a.obraIds])).toEqual([
      ["3 aprovações", "3 aprovações", "aprovacoes", ["b", "c"]],
      ["3 comprovantes para conferir", "3 comprovantes", "suprimentos", ["a", "c"]],
    ]);
    expect(avisosDe([r("a", 0, 0)])).toEqual([]);
  });
});
