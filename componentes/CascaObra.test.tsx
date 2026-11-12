import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Obra } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk } from "@/testes/rede";
import { Casca, lerPainel } from "./Casca";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

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

  it("o placar e a tela convivem sem chave repetida", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    window.history.replaceState(null, "", "/?obra=o-emei&tela=pedidos");
    render(<Casca demo={false} />);
    await waitFor(() => expect(telaAtiva()).toBe("Compras"));
    expect(erro.mock.calls.filter((c) => String(c[0]).includes("same key"))).toEqual([]);
    erro.mockRestore();
  });

  describe("com a API lenta", () => {
    const adiado = (id: string, tem: boolean) => {
      let soltar = () => {};
      const resposta = new Promise<Response>((ok) => {
        soltar = () => ok(resumo(id, tem)());
      });
      return { rota: () => resposta, soltar: () => soltar() };
    };

    it("a obra troca na hora, antes de o resumo chegar", async () => {
      const lento = adiado("o-casa", false);
      rede({ "GET /srv/api/obras/o-emei/resumo": resumo("o-emei", true), "GET /srv/api/obras/o-casa/resumo": lento.rota });
      window.history.replaceState(null, "", "/?obra=o-emei");
      render(<Casca demo={false} />);
      await waitFor(() => expect(telaAtiva()).toBe("Mestre de obras"));
      fireEvent.click(document.querySelector(".seletor-bt")!);
      fireEvent.click(screen.getByRole("menuitem", { name: /Casa Vila Nova/ }));
      await waitFor(() => expect(document.querySelector(".seletor-nome")?.textContent).toBe("Casa Vila Nova"));
      expect(telaAtiva()).toBe("Mestre de obras");
      lento.soltar();
      await waitFor(() => expect(telaAtiva()).toBe("Projeto"));
    });

    it("a resposta atrasada não tira a pessoa da aba que ela clicou", async () => {
      const lento = adiado("o-emei", false);
      const r = rede({ "GET /srv/api/obras/o-emei/resumo": lento.rota });
      window.history.replaceState(null, "", "/?obra=o-emei");
      render(<Casca demo={false} />);
      await waitFor(() => expect(document.querySelector(".topo-nav")).toBeTruthy());
      fireEvent.click(screen.getByRole("button", { name: "Compras" }));
      await waitFor(() => expect(telaAtiva()).toBe("Compras"));
      lento.soltar();
      await waitFor(() => expect(document.querySelector(".placar-v")).toBeTruthy());
      await waitFor(() => expect(r.chamadas.some((c) => c.caminho.endsWith("/resumo"))).toBe(true));
      await new Promise((f) => setTimeout(f, 0));
      expect(telaAtiva()).toBe("Compras");
    });

    it("clicar na mesma aba em que já está também conta como escolha", async () => {
      const lento = adiado("o-emei", false);
      rede({ "GET /srv/api/obras/o-emei/resumo": lento.rota });
      window.history.replaceState(null, "", "/?obra=o-emei");
      render(<Casca demo={false} />);
      await waitFor(() => expect(telaAtiva()).toBe("Mestre de obras"));
      fireEvent.click(document.querySelector(".topo-mestre")!);
      lento.soltar();
      await waitFor(() => expect(window.location.search).toContain("tela=conversa"));
      expect(telaAtiva()).toBe("Mestre de obras");
    });
  });

  it("o resumo sai uma vez só ao abrir e ao trocar de obra", async () => {
    const r = rede({ "GET /srv/api/obras/o-emei/resumo": resumo("o-emei", true), "GET /srv/api/obras/o-casa/resumo": resumo("o-casa", false) });
    window.history.replaceState(null, "", "/?obra=o-emei");
    render(<Casca demo={false} />);
    const doResumo = (id: string) => r.chamadas.filter((c) => c.caminho === `/srv/api/obras/${id}/resumo`);
    // O Mestre já está ativo antes de o resumo sair (a chamada ainda espera o token): esperar a aba não garante a chamada.
    await waitFor(() => expect(doResumo("o-emei")).toHaveLength(1));
    await waitFor(() => expect(telaAtiva()).toBe("Mestre de obras"));
    fireEvent.click(document.querySelector(".seletor-bt")!);
    fireEvent.click(screen.getByRole("menuitem", { name: /Casa Vila Nova/ }));
    await waitFor(() => expect(telaAtiva()).toBe("Projeto"));
    // só no fim: o tempo da troca de obra é o que deixaria aparecer uma chamada repetida
    expect(doResumo("o-casa")).toHaveLength(1);
    expect(doResumo("o-emei")).toHaveLength(1);
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
    expect([...document.querySelectorAll(".topo-nav .pilula")].map((b) => b.textContent)).toEqual(["Projeto", "Cronograma", "Orçamento", "Compras", "Gastos"]);
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
  const abrir = async (resposta: ReturnType<typeof resumo>, status = "em_andamento") => {
    rede({ "GET /srv/api/obras": () => json(OBRAS.map((o) => ({ ...o, status }))), "GET /srv/api/obras/o-emei/resumo": resposta });
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("760"), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn() }));
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
    window.history.replaceState(null, "", "/?obra=o-emei&tela=conversa");
    render(<Casca demo={false} />);
    await waitFor(() => expect(document.querySelector(".barra-inf")).toBeTruthy());
  };
  const barra = () => [...document.querySelectorAll(".barra-inf .bi-item")].map((b) => b.querySelector(".bi-rot")?.textContent);

  it("orçamento aprovado: Mestre, Cronograma, Compras, Gastos e Mais", async () => {
    await abrir(resumo("o-emei", true));
    await waitFor(() => expect(barra()).toEqual(["Mestre", "Cronograma", "Compras", "Gastos", "Mais"]));
    expect(document.querySelector(".bi-item")?.getAttribute("aria-label")).toBe("Mestre de obras");
  });

  it("sem orçamento: Mestre, Projeto, Orçamento, Gastos e Mais", async () => {
    await abrir(resumo("o-emei", false));
    await waitFor(() => expect(barra()).toEqual(["Mestre", "Projeto", "Orçamento", "Gastos", "Mais"]));
  });

  it("orçamento ainda não aprovado também fica nos primeiros passos, e o resto vai para o Mais", async () => {
    await abrir(resumo("o-emei", true), "em_orcamento");
    await waitFor(() => expect(barra()).toEqual(["Mestre", "Projeto", "Orçamento", "Gastos", "Mais"]));
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    expect([...document.querySelectorAll(".folha-item")].map((b) => b.textContent)).toEqual(expect.arrayContaining(["Compras", "Cronograma", "Tributos", "Histórico"]));
  });
});

describe("o selo da obra não promete orçamento que não existe", () => {
  const abrir = async (tem: boolean) => {
    rede({ "GET /srv/api/obras": () => json(OBRAS.map((o) => ({ ...o, status: "em_orcamento" }))), "GET /srv/api/obras/o-emei/resumo": resumo("o-emei", tem) });
    window.history.replaceState(null, "", "/?obra=o-emei&tela=conversa");
    render(<Casca demo={false} />);
  };
  const selo = () => document.querySelector(".seletor-st")?.textContent;

  it("sem orçamento, 'começando'", async () => {
    await abrir(false);
    await waitFor(() => expect(selo()).toBe("começando"));
  });

  it("com orçamento, 'em orçamento'", async () => {
    await abrir(true);
    await waitFor(() => expect(selo()).toBe("em orçamento"));
  });
});

describe("a conversa vazia pergunta sobre o momento da obra", () => {
  it("sem orçamento, sugere fechar o orçamento", async () => {
    rede({ "GET /srv/api/obras/o-emei/resumo": resumo("o-emei", false) });
    window.history.replaceState(null, "", "/?obra=o-emei&tela=conversa");
    render(<Casca demo={false} />);
    expect(await screen.findByRole("button", { name: "O que falta para fechar o orçamento?" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Quanto falta de cimento?" })).toBeNull();
  });
});

describe("painel de conversas", () => {
  afterEach(() => localStorage.removeItem("plumo.painel"));

  it("começa fechado e só fica aberto para quem abriu", () => {
    localStorage.removeItem("plumo.painel");
    expect(lerPainel()).toBe(false);
    localStorage.setItem("plumo.painel", "fechado");
    expect(lerPainel()).toBe(false);
    localStorage.setItem("plumo.painel", "aberto");
    expect(lerPainel()).toBe(true);
  });
});
