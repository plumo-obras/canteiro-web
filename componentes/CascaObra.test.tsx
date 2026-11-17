import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Obra } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import userEvent from "@testing-library/user-event";
import { criarRede, json, renovarOk, sse } from "@/testes/rede";
import { Casca, lerPlumo } from "./Casca";
import { grupoDaData } from "./plumo/PainelPlumo";

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

  it("vindo da Nova obra com ?importar=1, abre o import do orçamento e tira o pedido da URL", async () => {
    window.history.replaceState(null, "", "/?obra=o-emei&tela=orcamento&importar=1");
    render(<Casca demo={false} />);
    expect(await screen.findByRole("dialog", { name: "Importar planilha" })).toBeTruthy();
    await waitFor(() => expect(window.location.search).toBe("?obra=o-emei&tela=orcamento"));
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

  it("?sessao= abre o painel do Plumo naquela conversa, e ela fica na URL: recarregar não volta em 'Nova conversa'", async () => {
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
    expect(document.getElementById("painel-plumo")?.hidden).toBe(false);
    expect(document.querySelector("#painel-plumo h2")?.textContent).toBe("como tá o aço?");
    expect(window.location.search).toBe("?obra=o-emei&sessao=s-1");
  });

  it("conversa nova e vazia não vai para a URL (ainda não existe no servidor)", async () => {
    window.history.replaceState(null, "", "/?obra=o-emei&tela=conversa");
    render(<Casca demo={false} />);
    await waitFor(() => expect(document.querySelector("#painel-plumo h2")?.textContent).toBe("Nova conversa"));
    expect(document.getElementById("painel-plumo")?.hidden).toBe(false);
    await waitFor(() => expect(window.location.search).toBe("?obra=o-emei"));
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

describe("a obra abre no Resumo", () => {
  it("sem ?tela=, abre no Resumo, tenha orçamento ou não, e a URL fica limpa", async () => {
    rede({ "GET /srv/api/obras/o-emei/resumo": resumo("o-emei", false) });
    window.history.replaceState(null, "", "/?obra=o-emei");
    render(<Casca demo={false} />);
    await waitFor(() => expect(telaAtiva()).toBe("Resumo"));
    expect(window.location.search).toBe("?obra=o-emei");
  });

  it("?tela= manda mais que a regra: recarregar não tira a pessoa da tela", async () => {
    rede({ "GET /srv/api/obras/o-emei/resumo": resumo("o-emei", false) });
    window.history.replaceState(null, "", "/?obra=o-emei&tela=cronograma");
    render(<Casca demo={false} />);
    await waitFor(() => expect(telaAtiva()).toBe("Cronograma"));
    expect(window.location.search).toBe("?obra=o-emei&tela=cronograma");
  });

  it("link antigo ?tela=conversa (de quando o Plumo era aba) abre o Resumo com o painel do Plumo", async () => {
    rede({ "GET /srv/api/obras/o-emei/resumo": resumo("o-emei", false) });
    window.history.replaceState(null, "", "/?obra=o-emei&tela=conversa");
    render(<Casca demo={false} />);
    await waitFor(() => expect(telaAtiva()).toBe("Resumo"));
    expect(document.getElementById("painel-plumo")?.hidden).toBe(false);
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

  it("o resumo que chega depois não tira a pessoa da aba que ela clicou", async () => {
    let soltar = () => {};
    const resposta = new Promise<Response>((ok) => {
      soltar = () => ok(resumo("o-emei", false)());
    });
    rede({ "GET /srv/api/obras/o-emei/resumo": () => resposta });
    window.history.replaceState(null, "", "/?obra=o-emei");
    render(<Casca demo={false} />);
    await waitFor(() => expect(document.querySelector(".topo-nav")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Compras" }));
    await waitFor(() => expect(telaAtiva()).toBe("Compras"));
    soltar();
    await waitFor(() => expect(document.querySelector(".placar-v")).toBeTruthy());
    await new Promise((f) => setTimeout(f, 0));
    expect(telaAtiva()).toBe("Compras");
  });

  it("o resumo sai uma vez só ao abrir e ao trocar de obra", async () => {
    const r = rede({ "GET /srv/api/obras/o-emei/resumo": resumo("o-emei", true), "GET /srv/api/obras/o-casa/resumo": resumo("o-casa", false) });
    window.history.replaceState(null, "", "/?obra=o-emei");
    render(<Casca demo={false} />);
    const doResumo = (id: string) => r.chamadas.filter((c) => c.caminho === `/srv/api/obras/${id}/resumo`);
    await waitFor(() => expect(doResumo("o-emei")).toHaveLength(1));
    fireEvent.click(document.querySelector(".seletor-bt")!);
    fireEvent.click(screen.getByRole("menuitem", { name: /Casa Vila Nova/ }));
    await waitFor(() => expect(doResumo("o-casa")).toHaveLength(1));
    // só no fim: o tempo da troca de obra é o que deixaria aparecer uma chamada repetida
    await new Promise((f) => setTimeout(f, 0));
    expect(doResumo("o-casa")).toHaveLength(1);
    expect(doResumo("o-emei")).toHaveLength(1);
  });

  it("trocar de obra abre o Resumo da outra, de qualquer tela", async () => {
    rede({ "GET /srv/api/obras/o-emei/resumo": resumo("o-emei", true), "GET /srv/api/obras/o-casa/resumo": resumo("o-casa", false) });
    window.history.replaceState(null, "", "/?obra=o-emei&tela=suprimentos");
    render(<Casca demo={false} />);
    await waitFor(() => expect(telaAtiva()).toBe("Compras"));
    fireEvent.click(document.querySelector(".seletor-bt")!);
    fireEvent.click(screen.getByRole("menuitem", { name: /Casa Vila Nova/ }));
    await waitFor(() => expect(telaAtiva()).toBe("Resumo"));
    expect(document.querySelector(".seletor-nome")?.textContent).toBe("Casa Vila Nova");
    await waitFor(() => expect(window.location.search).toBe("?obra=o-casa"));
  });

  it("a linha do tempo do Resumo leva à aba da etapa", async () => {
    rede({ "GET /srv/api/obras/o-emei/resumo": resumo("o-emei", true) });
    window.history.replaceState(null, "", "/?obra=o-emei");
    render(<Casca demo={false} />);
    const etapas = await screen.findByRole("navigation", { name: "Etapas da obra" });
    expect([...etapas.querySelectorAll("button")].map((b) => b.querySelector("span span")?.textContent)).toEqual(["Projeto", "Orçamento", "Cronograma", "Compras", "Gastos"]);
    fireEvent.click(within(etapas).getByRole("button", { name: /^Cronograma/ }));
    await waitFor(() => expect(telaAtiva()).toBe("Cronograma"));
    expect(window.location.search).toContain("tela=cronograma");
  });
});

describe("a barra da obra", () => {
  const abrir = async () => {
    window.history.replaceState(null, "", "/?obra=o-emei");
    render(<Casca demo={false} />);
    await waitFor(() => expect(document.querySelector(".topo-nav")).toBeTruthy());
  };

  it("o Resumo e as cinco abas na ordem da obra, sem números; o Plumo não é aba", async () => {
    await abrir();
    expect([...document.querySelectorAll(".topo-nav .pilula")].map((b) => b.textContent)).toEqual(["Resumo", "Projeto", "Orçamento", "Cronograma", "Compras", "Gastos"]);
    expect(screen.getByRole("textbox", { name: "Pergunte ao Plumo, abre a conversa" })).toBeTruthy();
    // o campo do topo não é uma busca (pergunta, não procura)
    expect(screen.queryByRole("search")).toBeNull();
    expect(document.getElementById("painel-plumo")?.hidden).toBe(true);
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
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("760") || q.includes("899"), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn() }));
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
    window.history.replaceState(null, "", "/?obra=o-emei&tela=conversa");
    render(<Casca demo={false} />);
    await waitFor(() => expect(document.querySelector(".barra-inf")).toBeTruthy());
  };
  const barra = () => [...document.querySelectorAll(".barra-inf .bi-item")].map((b) => b.querySelector(".bi-rot")?.textContent);

  it("orçamento aprovado: Resumo, Compras, o Plumo no meio, Gastos e Mais", async () => {
    await abrir(resumo("o-emei", true));
    await waitFor(() => expect(barra()).toEqual(["Resumo", "Compras", "Plumo", "Gastos", "Mais"]));
    expect(document.querySelector(".bi-item")?.getAttribute("aria-label")).toBe("Resumo");
  });

  it("sem orçamento: Resumo, Projeto, o Plumo no meio, Orçamento e Mais", async () => {
    await abrir(resumo("o-emei", false));
    await waitFor(() => expect(barra()).toEqual(["Resumo", "Projeto", "Plumo", "Orçamento", "Mais"]));
  });

  it("o Plumo do meio abre o painel como folha (diálogo) e a barra some; Esc fecha", async () => {
    await abrir(resumo("o-emei", true));
    const bt = await screen.findByRole("button", { name: "Plumo" });
    fireEvent.click(bt);
    const folha = await screen.findByRole("dialog", { name: "Plumo" });
    expect(folha.getAttribute("aria-modal")).toBe("true");
    expect(bt.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(document.getElementById("painel-plumo")?.hidden).toBe(true));
  });

  it("orçamento ainda não aprovado também fica nos primeiros passos, e o resto vai para o Mais", async () => {
    await abrir(resumo("o-emei", true), "em_orcamento");
    await waitFor(() => expect(barra()).toEqual(["Resumo", "Projeto", "Plumo", "Orçamento", "Mais"]));
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    expect([...document.querySelectorAll(".folha-item")].map((b) => b.textContent)).toEqual(
      expect.arrayContaining(["Compras", "Cronograma", "Gastos", "Tributos", "Histórico", "Início", "Nova obra", "Conta"]),
    );
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

describe("o painel do Plumo", () => {
  const ev = (evento: string, dados: unknown) => `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
  const abrir = async () => {
    rede({
      "GET /srv/api/obras/o-emei/resumo": resumo("o-emei", true),
      "POST /srv/agente/conversa": () => sse(ev("texto", { delta: "Chega quinta." }) + ev("fim", { sessao_id: "srv-1", uso: { tokens: 1, custo: 0 } })),
    });
    window.history.replaceState(null, "", "/?obra=o-emei&tela=suprimentos");
    render(<Casca demo={false} />);
    await waitFor(() => expect(telaAtiva()).toBe("Compras"));
  };
  const painel = () => document.getElementById("painel-plumo")!;

  it("Enter no campo do topo manda a pergunta, abre o painel ao lado e a tela continua", async () => {
    await abrir();
    const campo = screen.getByRole("textbox", { name: "Pergunte ao Plumo, abre a conversa" });
    await userEvent.type(campo, "quando chega o aço?{Enter}");
    await waitFor(() => expect(painel().hidden).toBe(false));
    await waitFor(() => expect(painel().textContent).toContain("Chega quinta."));
    // com o painel aberto, os dois campos têm nomes diferentes para o leitor de tela
    expect(screen.getAllByRole("textbox", { name: /^Pergunte ao Plumo/ }).map((c) => (c as HTMLInputElement).labels?.[0]?.textContent)).toEqual([
      "Pergunte ao Plumo, abre a conversa",
      "Pergunte ao Plumo",
    ]);
    expect(painel().textContent).toContain("quando chega o aço?");
    expect(telaAtiva()).toBe("Compras");
    expect((campo as HTMLInputElement).value).toBe("");
  });

  it("Ctrl+K foca o campo; Esc fecha o painel e devolve o foco a quem abriu", async () => {
    await abrir();
    const campo = screen.getByRole("textbox", { name: "Pergunte ao Plumo, abre a conversa" });
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(campo).toHaveFocus();
    fireEvent.submit(campo.closest("form")!);
    await waitFor(() => expect(painel().hidden).toBe(false));
    fireEvent.keyDown(within(painel()).getByRole("textbox", { name: "Pergunte ao Plumo" }), { key: "Escape" });
    await waitFor(() => expect(painel().hidden).toBe(true));
    await waitFor(() => expect(campo).toHaveFocus());
  });

  it("ao lado da tela, Esc de fora do painel é da tela (busca, gaveta): o painel continua aberto", async () => {
    await abrir();
    fireEvent.submit(screen.getByRole("textbox", { name: "Pergunte ao Plumo, abre a conversa" }).closest("form")!);
    await waitFor(() => expect(painel().hidden).toBe(false));
    const deFora = screen.getByRole("button", { name: "Cronograma" });
    deFora.focus();
    fireEvent.keyDown(deFora, { key: "Escape" });
    await new Promise((f) => setTimeout(f, 0));
    expect(painel().hidden).toBe(false);
  });

  it("fechado, o painel não desmonta a conversa: o texto digitado continua lá", async () => {
    await abrir();
    fireEvent.submit(screen.getByRole("textbox", { name: "Pergunte ao Plumo, abre a conversa" }).closest("form")!);
    await waitFor(() => expect(painel().hidden).toBe(false));
    const caixa = within(painel()).getByRole("textbox", { name: "Pergunte ao Plumo" }) as HTMLTextAreaElement;
    fireEvent.change(caixa, { target: { value: "rascunho" } });
    fireEvent.click(within(painel()).getByRole("button", { name: "Fechar o Plumo" }));
    await waitFor(() => expect(painel().hidden).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Cronograma" }));
    fireEvent.submit(screen.getByRole("textbox", { name: "Pergunte ao Plumo, abre a conversa" }).closest("form")!);
    await waitFor(() => expect(painel().hidden).toBe(false));
    expect((within(painel()).getByRole("textbox", { name: "Pergunte ao Plumo" }) as HTMLTextAreaElement).value).toBe("rascunho");
  });

  it("a lista de conversas mora no painel, no botão Conversas", async () => {
    await abrir();
    fireEvent.submit(screen.getByRole("textbox", { name: "Pergunte ao Plumo, abre a conversa" }).closest("form")!);
    await waitFor(() => expect(painel().hidden).toBe(false));
    const bt = within(painel()).getByRole("button", { name: "Conversas" });
    fireEvent.click(bt);
    expect(within(painel()).getByRole("heading", { name: "Conversas" })).toBeTruthy();
    expect(within(painel()).getByRole("searchbox", { name: "Buscar nas conversas" })).toBeTruthy();
    fireEvent.click(within(painel()).getByRole("button", { name: "Voltar para a conversa" }));
    expect(within(painel()).getByRole("heading", { name: "Nova conversa" })).toBeTruthy();
  });

  it("o botão do Plumo das telas abre o painel em vez de trocar de tela", async () => {
    await abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Pedir ao Plumo uma cotação" }));
    await waitFor(() => expect(painel().hidden).toBe(false));
    expect(telaAtiva()).toBe("Compras");
  });

  it("lado a lado, o painel lembra se ficou aberto; mais estreito, começa fechado", () => {
    localStorage.removeItem("plumo.painelPlumo");
    expect(lerPlumo(true)).toBe(false);
    localStorage.setItem("plumo.painelPlumo", "aberto");
    expect(lerPlumo(true)).toBe(true);
    expect(lerPlumo(false)).toBe(false);
    localStorage.removeItem("plumo.painelPlumo");
  });

  it("agrupa as conversas por data", () => {
    const agora = new Date(2026, 10, 12, 15);
    expect(grupoDaData(new Date(2026, 10, 12, 9).toISOString(), agora)).toBe("Hoje");
    expect(grupoDaData(new Date(2026, 10, 9).toISOString(), agora)).toBe("Esta semana");
    expect(grupoDaData(new Date(2026, 10, 2).toISOString(), agora)).toBe("Este mês");
    expect(grupoDaData(new Date(2026, 9, 20).toISOString(), agora)).toBe("Outubro");
    expect(grupoDaData(new Date(2025, 9, 20).toISOString(), agora)).toBe("Outubro de 2025");
    expect(grupoDaData("", agora)).toBe("Mais antigas");
  });
});
