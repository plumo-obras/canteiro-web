import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Obra } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk } from "@/testes/rede";
import { Casca } from "./Casca";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const obra = (id: string, nome: string): Obra =>
  ({ id, tenant_id: "t-1", criado_em: "", nome, cidade: "", cep: "", status: "em_andamento" }) as unknown as Obra;
const OBRAS = [obra("o-casa", "Casa Vila Nova"), obra("o-emei", "EMEI Santa Clara do Sul")];

beforeEach(() => {
  criarRede({
    "POST /srv/auth/renovar": renovarOk,
    "GET /srv/api/obras": () => json(OBRAS),
    "GET /srv/api/sessoes": () => json([]),
    "GET /srv/api/propostas": () => json([]),
  });
});
afterEach(() => {
  limparSessao();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("a obra aberta sobrevive ao recarregar", () => {
  it("a obra da URL abre e continua na URL", async () => {
    window.history.replaceState(null, "", "/?obra=o-emei&tela=orcamento");
    render(<Casca demo={false} />);
    await waitFor(() => expect(localStorage.getItem("plumo.obra")).toBe("o-emei"));
    expect(window.location.search).toBe("?obra=o-emei&tela=orcamento");
  });

  it("sem obra na URL, volta na última aberta neste navegador, não na 1ª da lista", async () => {
    localStorage.setItem("plumo.obra", "o-emei");
    render(<Casca demo={false} />);
    await waitFor(() => expect(window.location.search).toBe("?obra=o-emei"));
    expect(document.body.textContent).toContain("EMEI Santa Clara do Sul");
  });

  it("obra lembrada que não existe mais cai na 1ª em andamento", async () => {
    localStorage.setItem("plumo.obra", "o-apagada");
    render(<Casca demo={false} />);
    await waitFor(() => expect(window.location.search).toBe("?obra=o-casa"));
  });

  it("a conversa aberta também fica na URL: recarregar não volta em 'Nova conversa'", async () => {
    criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/api/obras": () => json(OBRAS),
      "GET /srv/api/sessoes": () =>
        json([{ id: "s-1", tenant_id: "t-1", dono: "u-1", obra_id: "o-emei", titulo: "como tá o aço?", abas: [], total_mensagens: 2, criado_em: "", atualizado_em: "" }]),
      "GET /srv/api/sessoes/s-1/mensagens": () =>
        json([
          { id: "m1", sessao_id: "s-1", seq: 1, papel: "user", conteudo: "como tá o aço?", criado_em: "" },
          { id: "m2", sessao_id: "s-1", seq: 2, papel: "assistant", conteudo: [{ type: "text", text: "Chegou todo." }], criado_em: "" },
        ]),
      "GET /srv/api/propostas": () => json([]),
    });
    window.history.replaceState(null, "", "/?obra=o-emei&sessao=s-1");
    render(<Casca demo={false} />);
    await waitFor(() => expect(document.body.textContent).toContain("Chegou todo."));
    expect(document.querySelector(".conversa-t")?.textContent).toBe("como tá o aço?");
    expect(window.location.search).toBe("?obra=o-emei&sessao=s-1");
  });

  it("conversa nova e vazia não vai para a URL (ainda não existe no servidor)", async () => {
    window.history.replaceState(null, "", "/?obra=o-emei");
    render(<Casca demo={false} />);
    await waitFor(() => expect(document.querySelector(".conversa-t")?.textContent).toBe("Nova conversa"));
    expect(window.location.search).toBe("?obra=o-emei");
  });
});

const resumo = (id: string, tem_orcamento: boolean) => () =>
  json({
    obra: OBRAS.find((o) => o.id === id),
    financeiro: { tem_orcamento, orcado_atual: 0, comprometido: 0, realizado: 0, saldo: 0 },
    cronograma: { cadastrado: false, termino_contratual: null, termino_projetado: null, atraso_decimos: null },
  });
const rede = (extra: Parameters<typeof criarRede>[0]) =>
  criarRede({
    "POST /srv/auth/renovar": renovarOk,
    "GET /srv/api/obras": () => json(OBRAS),
    "GET /srv/api/sessoes": () => json([]),
    "GET /srv/api/propostas": () => json([]),
    ...extra,
  });
const telaAtiva = () => document.querySelector("[aria-current=page]")?.textContent;

describe("a obra abre onde faz sentido", () => {
  it("sem orçamento, cai em Projeto", async () => {
    rede({ "GET /srv/api/obras/o-emei/resumo": resumo("o-emei", false) });
    window.history.replaceState(null, "", "/?obra=o-emei");
    render(<Casca demo={false} />);
    await waitFor(() => expect(telaAtiva()).toBe("Projeto"));
    await waitFor(() => expect(window.location.search).toBe("?obra=o-emei&tela=projeto"));
  });

  it("com orçamento, abre no Mestre de obras", async () => {
    rede({ "GET /srv/api/obras/o-emei/resumo": resumo("o-emei", true) });
    window.history.replaceState(null, "", "/?obra=o-emei");
    render(<Casca demo={false} />);
    await waitFor(() => expect(telaAtiva()).toBe("Mestre de obras"));
    expect(window.location.search).toBe("?obra=o-emei");
  });

  it("?tela= manda mais que a regra: recarregar não tira a pessoa da tela", async () => {
    rede({ "GET /srv/api/obras/o-emei/resumo": resumo("o-emei", false) });
    window.history.replaceState(null, "", "/?obra=o-emei&tela=conversa");
    render(<Casca demo={false} />);
    await waitFor(() => expect(telaAtiva()).toBe("Mestre de obras"));
    await waitFor(() => expect(window.location.search).toBe("?obra=o-emei&tela=conversa"));
  });

  it("link antigo continua abrindo a tela certa", async () => {
    window.history.replaceState(null, "", "/?obra=o-emei&tela=pedidos");
    render(<Casca demo={false} />);
    await waitFor(() => expect(telaAtiva()).toBe("Compras"));
  });

  it("trocar de obra segue a mesma regra", async () => {
    rede({ "GET /srv/api/obras/o-emei/resumo": resumo("o-emei", true), "GET /srv/api/obras/o-casa/resumo": resumo("o-casa", false) });
    window.history.replaceState(null, "", "/?obra=o-emei");
    render(<Casca demo={false} />);
    await waitFor(() => expect(telaAtiva()).toBe("Mestre de obras"));
    fireEvent.click(document.querySelector(".seletor-bt")!);
    fireEvent.click(screen.getByRole("menuitem", { name: /Casa Vila Nova/ }));
    await waitFor(() => expect(telaAtiva()).toBe("Projeto"));
    expect(document.querySelector(".seletor-nome")?.textContent).toBe("Casa Vila Nova");
  });
});

describe("a barra da obra", () => {
  const abrir = async () => {
    window.history.replaceState(null, "", "/?obra=o-emei");
    render(<Casca demo={false} />);
    await waitFor(() => expect(document.querySelector(".topo-nav")).toBeTruthy());
  };

  it("cinco abas, nesta ordem e sem números", async () => {
    await abrir();
    expect([...document.querySelectorAll(".topo-nav .pilula")].map((b) => b.textContent)).toEqual(["Projeto", "Orçamento", "Compras", "Cronograma", "Gastos"]);
  });

  it("o sino conta as pendências da obra aberta e abre as Aprovações", async () => {
    const proposta = (id: string, obra_id: string) => ({ id, obra_id, status: "pendente", titulo: id });
    rede({ "GET /srv/api/propostas": () => json([proposta("p1", "o-emei"), proposta("p2", "o-emei"), proposta("p3", "o-casa")]) });
    await abrir();
    const sino = await screen.findByRole("button", { name: "Aprovações: 2 coisas esperando você" });
    fireEvent.click(sino);
    await waitFor(() => expect(sino.getAttribute("aria-current")).toBe("page"));
    expect(window.location.search).toContain("tela=aprovacoes");
  });

  it("o ⋯ leva a Tributos, Histórico e Dados da obra", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Mais: Tributos, Histórico, Dados da obra" }));
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Tributos", "Histórico", "Dados da obra"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Histórico" }));
    await waitFor(() => expect(window.location.search).toContain("tela=historico"));
  });

  it("na demonstração, Gastos e Tributos somem da barra e do ⋯", async () => {
    window.history.replaceState(null, "", "/?obra=o-emei");
    render(<Casca demo={true} />);
    await waitFor(() => expect(document.querySelector(".topo-nav")).toBeTruthy());
    expect([...document.querySelectorAll(".topo-nav .pilula")].map((b) => b.textContent)).not.toContain("Gastos");
    expect(screen.getByRole("button", { name: "Mais: Histórico, Dados da obra" })).toBeTruthy();
  });
});

describe("a barra do celular", () => {
  it("Hoje, Compras, Gastos, Cronograma e Mais", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("760"), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn() }));
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
    window.history.replaceState(null, "", "/?obra=o-emei");
    render(<Casca demo={false} />);
    await waitFor(() => expect(document.querySelector(".barra-inf")).toBeTruthy());
    expect([...document.querySelectorAll(".barra-inf .bi-item")].map((b) => b.getAttribute("aria-label"))).toEqual(["Hoje", "Compras", "Gastos", "Cronograma", "Mais"]);
  });
});
