import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Obra, Usuario, VersaoOrcamento } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, USUARIO } from "@/testes/rede";
import { ProvedorCasca } from "./contexto";
import { Orcamento, soDasPranchas } from "./Orcamento";

const OBRA = { id: "o1", nome: "Casa Inventada", status: "em_orcamento", verba: 62000000 } as Obra;
const orc = (arquivo: string, precos: number[]) => ({
  versoes: [{ id: "v1", tipo: "contrato", numero: 0, descricao: "Estrutura", arquivo, ativa: true, itens: precos.length, etapas: 1, total: 0, registro_id: "r1" }],
  itens: precos.map((valor_unitario, i) => ({ id: `i${i}`, versao_id: "v1", tipo: "item", etapa: "1", descricao: `Item ${i}`, unidade: "kg", quantidade: 1000, valor_unitario, total: valor_unitario, curva: null })),
  etapas: [{ etapa: "1", descricao: "Estrutura", contratado: 0, aditivos: 0, atual: 0, cotando: 0, comprometido: 0, realizado: 0, saldo: 0, estourou: false }],
  totais: { contratado: 0, aditivos: 0, atual: 0, saldo: 0, cotando: 0, comprometido: 0, realizado: 0, aditivos_pct: 0, n_itens: precos.length, n_etapas: 1, sem_etapa: {} },
});
const montar = (dados: unknown, usuario: Usuario = USUARIO) => {
  criarRede({
    "POST /srv/auth/renovar": renovarOk,
    "GET /srv/api/obras/o1/orcamento": () => json(dados),
    "GET /srv/api/obras/o1/insumos": () => json([]),
  });
  render(
    <ProvedorCasca usuario={usuario} demo={false}>
      <Orcamento obra={OBRA} />
    </ProvedorCasca>,
  );
};
const PRANCHAS = "Estrutura (projeto).csv";

beforeEach(limparSessao);
afterEach(() => {
  limparSessao();
  vi.unstubAllGlobals();
});

describe("avisos do Orçamento", () => {
  it("itens sem preço: avisa na tela e o aprovar pede confirmação explícita", async () => {
    montar(orc("planilha.xlsx", [0, 0, 500]));
    expect(await screen.findByText("2 itens sem preço.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Aprovar" }));
    const dialogo = screen.getByRole("dialog", { name: "Aprovar o orçamento?" });
    expect(dialogo).toHaveTextContent("2 itens estão sem preço.");
    expect(within(dialogo).getByRole("button", { name: "Aprovar mesmo assim" })).toBeInTheDocument();
  });

  it("todos com preço: sem aviso e o botão de sempre", async () => {
    montar(orc("planilha.xlsx", [500, 700]));
    await userEvent.setup().click(await screen.findByRole("button", { name: "Aprovar" }));
    const dialogo = screen.getByRole("dialog", { name: "Aprovar o orçamento?" });
    expect(within(dialogo).getByRole("button", { name: "Aprovar orçamento" })).toBeInTheDocument();
    expect(screen.queryByText(/sem preço/)).toBeNull();
  });

  it("veio só das pranchas: diz o que falta e abre o caminho para completar", async () => {
    montar(orc(PRANCHAS, [500]));
    expect(await screen.findByText(/só o que as pranchas trazem/)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Cobertura, piso, instalações e mão de obra ainda não estão nele.");
    expect(within(screen.getByRole("note")).getByRole("button", { name: "Somar a planilha da obra" })).toBeInTheDocument();
  });

  it("viewer lê o aviso, sem o botão de importar", async () => {
    montar(orc(PRANCHAS, [500]), { ...USUARIO, papel: "viewer" });
    expect(await screen.findByText(/só o que as pranchas trazem/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Somar a planilha da obra" })).toBeNull();
  });

  it("aditivo de verdade: % neutro sobre o orçamento aprovado, sem citar lei nem pintar de vermelho", async () => {
    const base = orc("planilha.xlsx", [500]);
    montar({
      ...base,
      versoes: [...base.versoes, { ...base.versoes[0], id: "v2", tipo: "aditivo", numero: 1, total: 50_000 }],
      totais: { ...base.totais, contratado: 5_000_000, aditivos: 5_000_000, atual: 10_000_000, aditivos_pct: 10_000 },
    });
    expect(await screen.findByText("+100% sobre o orçamento aprovado")).not.toHaveClass("bad");
    expect(screen.getByRole("button", { name: "+100% aditivo" })).not.toHaveClass("t-acima");
    expect(screen.queryByText(/8\.666|limite legal|obra pública/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("sem aditivo, sem selo de aditivo", async () => {
    montar(orc("planilha.xlsx", [500]));
    await screen.findByText(/maior etapa/);
    expect(screen.queryByText(/aditivo/)).toBeNull();
  });

  it("a versão inicial aparece como orçamento inicial, nunca contrato", async () => {
    montar({ ...orc("planilha.xlsx", [500]), versoes: [...orc("planilha.xlsx", [500]).versoes, { ...orc("x", [1]).versoes[0], id: "v2", tipo: "aditivo", numero: 1 }] });
    expect(await screen.findByText("Orçamento inicial")).toBeInTheDocument();
    expect(screen.queryByText("Contrato")).toBeNull();
  });
});

describe("Desfazer da aprovação pela metade", () => {
  const PARADA = { ...OBRA, status: "desfazendo_aprovacao", desfazendo_registro_id: "r7" } as Obra;
  const insumo = (id: string) => ({ insumo: { id, nome: id, unidade: "kg", precisa_ate_o_fim: 1000, valor_unitario: 100 }, conta: { precisa: 1000, falta: 1000, comprar: 1000, saldo: 0, a_caminho: 0, cotando: 0, transferencia: 0 } });
  const abrir = (desfazer: () => Response, usuario: Usuario = USUARIO) => {
    const rede = criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/api/obras/o1/orcamento": () => json(orc("planilha.xlsx", [500])),
      "GET /srv/api/obras/o1/insumos": () => json([insumo("a"), insumo("b")]),
      "POST /srv/api/registro/r7/desfazer": desfazer,
    });
    render(
      <ProvedorCasca usuario={usuario} demo={false}>
        <Orcamento obra={PARADA} />
      </ProvedorCasca>,
    );
    return rede;
  };

  it("avisa quantos itens ficaram, sem oferecer aprovar nem comprar", async () => {
    abrir(() => json({}));
    expect(await screen.findByText(/parou no meio: 2 itens ainda em Compras/)).toBeInTheDocument();
    expect(screen.getByText("desfazendo a aprovação")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprovar" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Comprar o que vem primeiro" })).toBeNull();
  });

  it("Continuar chama o Desfazer do registro e avisa", async () => {
    const rede = abrir(() => json({ id: "r8", texto: "Desfeito", criado_em: "2026-11-09T10:00:00Z" }));
    await userEvent.setup().click(await screen.findByRole("button", { name: "Continuar o Desfazer" }));
    expect(await screen.findByText("Aprovação desfeita. A obra voltou para em orçamento.")).toBeInTheDocument();
    expect(rede.chamadas.some((c) => c.metodo === "POST" && c.caminho === "/srv/api/registro/r7/desfazer")).toBe(true);
  });

  it("a recusa da API fica à vista no aviso, dizendo o que resolver", async () => {
    abrir(() => json({ detail: "Aço já tem pedido (PED-0170); cancele o pedido antes de desfazer a aprovação." }, 409));
    await userEvent.setup().click(await screen.findByRole("button", { name: "Continuar o Desfazer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("cancele o pedido antes de desfazer");
  });

  it("não manda tocar no preço, que está travado", async () => {
    abrir(() => json({}));
    await screen.findByText(/parou no meio/);
    expect(screen.queryByText(/Toque no preço/)).toBeNull();
  });

  it("viewer lê o aviso, sem o botão", async () => {
    abrir(() => json({}), { ...USUARIO, papel: "viewer" });
    expect(await screen.findByText(/parou no meio/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuar o Desfazer" })).toBeNull();
  });
});

describe("soDasPranchas", () => {
  const v = (arquivo: string, ativa = true) => ({ arquivo, ativa });
  it("só quando tudo o que vale saiu do Projeto", () => {
    expect(soDasPranchas([])).toBe(false);
    expect(soDasPranchas([v(PRANCHAS)])).toBe(true);
    expect(soDasPranchas([v(PRANCHAS), v("planilha.xlsx")])).toBe(false);
    expect(soDasPranchas([v(PRANCHAS), v("planilha.xlsx", false)])).toBe(true);
  });
});

describe("versões depois de somar a planilha", () => {
  const somado = () => {
    const d = orc("planilha.xlsx", [500, 700]);
    d.versoes = [
      { ...d.versoes[0]!, id: "v2", total: 120000, itens: 2, registro_id: "r2", substitui: "v1", origem: "somar", rotulo: "Orçamento com a planilha somada", desfazer_texto: "Volta o orçamento para antes de somar a planilha (R$ 500,00, 1 item)." } as (typeof d.versoes)[number],
      { ...d.versoes[0]!, arquivo: PRANCHAS, ativa: false, total: 50000, itens: 1, registro_id: "r1" },
    ];
    return d;
  };

  it("a versão das pranchas aparece como Materiais das pranchas, sem o nome interno do arquivo (mesmo na API antiga, sem rótulo)", async () => {
    montar(somado());
    const versoes = await screen.findByRole("region", { name: "Versões do orçamento" });
    expect(within(versoes).getAllByText(/Materiais das pranchas/).length).toBeGreaterThan(0);
    expect(within(versoes).queryByText(/\(projeto\)\.csv/)).toBeNull();
  });

  it("a situação vem da API: a versão trocada pela reordenação é 'substituída', não 'desfeita'", async () => {
    const d = somado();
    const [somada, pranchas] = d.versoes as (VersaoOrcamento & Record<string, unknown>)[];
    d.versoes = [
      { ...somada!, id: "v3", ativa: true, substitui: "v2", situacao: "vigente" },
      { ...somada!, ativa: false, situacao: "substituida" },
      { ...pranchas!, situacao: "substituida" },
    ] as unknown as typeof d.versoes;
    montar(d);
    const versoes = await screen.findByRole("region", { name: "Versões do orçamento" });
    expect(within(versoes).getAllByText("substituída")).toHaveLength(2);
    expect(within(versoes).queryByText("desfeita")).toBeNull();
  });

  it("o Desfazer do somar mostra o texto que a API mandou", async () => {
    montar(somado());
    await userEvent.setup().click(await screen.findByRole("button", { name: "Desfazer Orçamento inicial" }));
    expect(await screen.findByText("Volta o orçamento para antes de somar a planilha (R$ 500,00, 1 item).")).toBeInTheDocument();
  });
});

describe("ordem das etapas antes de aprovar", () => {
  const etapa = (n: string, descricao: string) => ({ etapa: n, descricao, contratado: 0, aditivos: 0, atual: 1000, cotando: 0, comprometido: 0, realizado: 0, saldo: 1000, estourou: false });
  const dados = (nomes: string[]) => ({
    ...orc("planilha.xlsx", []),
    itens: [],
    etapas: nomes.map((d, i) => etapa(String(i + 1), d)),
  });
  const montarOrdem = (obra: Obra, usuario: Usuario = USUARIO, recusa?: string, segurar?: Promise<void>) => {
    let atual = ["Estrutura", "Serviços preliminares", "Fundação"];
    let gravou = false;
    const rede = criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/api/obras/o1/orcamento": async () => {
        if (gravou && segurar) await segurar;
        return json(dados(atual));
      },
      "GET /srv/api/obras/o1/insumos": () => json([]),
      "POST /srv/api/obras/o1/orcamento/etapas/ordem": ({ corpo }) => {
        if (recusa) return json({ detail: recusa }, 409);
        gravou = true;
        const ordem = (corpo as { ordem: string[] }).ordem;
        atual = ordem.map((k) => atual[Number(k) - 1]!);
        return json({ versao_id: "v9", registro_id: "r9", etapas: atual.map((d, i) => ({ etapa: String(i + 1), descricao: d })) }, 201);
      },
    });
    render(
      <ProvedorCasca usuario={usuario} demo={false}>
        <Orcamento obra={obra} />
      </ProvedorCasca>,
    );
    return rede;
  };

  it("descer manda a ordem inteira com uma chave, avisa com Desfazer e o foco segue a etapa", async () => {
    const rede = montarOrdem(OBRA);
    const u = userEvent.setup();
    expect(await screen.findByRole("button", { name: "Subir Estrutura" })).toBeDisabled();
    await u.click(screen.getByRole("button", { name: "Descer Estrutura" }));
    expect(await screen.findByText("Estrutura desceu: agora é a etapa 2.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeInTheDocument();
    const post = rede.chamadas.find((c) => c.metodo === "POST" && c.caminho.endsWith("/etapas/ordem"))!;
    expect(post.corpo).toMatchObject({ ordem: ["2", "1", "3"], chave_idempotencia: expect.any(String) });
    await waitFor(() => expect(screen.getByRole("group", { name: "Ordem de Estrutura: etapa 2 de 3" })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Descer Estrutura" })).toHaveFocus());
  });

  it("etapa com lançamento: o 409 da API aparece como veio, e a ordem não muda", async () => {
    const DETAIL = "Já há lançamento (gasto, pedido, tópico ou cronograma) na etapa 1 Estrutura: renumerar levaria o lançamento para outra etapa.";
    montarOrdem(OBRA, USUARIO, DETAIL);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Descer Estrutura" }));
    expect(await screen.findByText(DETAIL)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Ordem de Estrutura: etapa 1 de 3" })).toBeInTheDocument();
  });

  it("até o orçamento renumerado chegar, as setas ficam desligadas; a ordem vai com a versão que a tela via", async () => {
    let soltar!: () => void;
    const rede = montarOrdem(OBRA, USUARIO, undefined, new Promise<void>((r) => (soltar = r)));
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Descer Estrutura" }));
    await screen.findByText("Estrutura desceu: agora é a etapa 2.");
    // a tela ainda mostra a numeração velha: um 2º toque moveria a etapa errada
    expect(screen.getByRole("button", { name: "Descer Serviços preliminares" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Subir Fundação" })).toBeDisabled();
    expect(rede.chamadas.find((c) => c.caminho.endsWith("/etapas/ordem"))!.corpo).toMatchObject({ versao_id: "v1" });
    soltar();
    await waitFor(() => expect(screen.getByRole("button", { name: "Subir Fundação" })).toBeEnabled());
    expect(screen.getByRole("group", { name: "Ordem de Estrutura: etapa 2 de 3" })).toBeInTheDocument();
  });

  it("depois de um erro, repetir a mesma ordem vai com chave nova", async () => {
    const rede = montarOrdem(OBRA, USUARIO, "O orçamento mudou desde que você abriu a tela; recarregue e confira a ordem.");
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Descer Estrutura" }));
    await screen.findByText(/O orçamento mudou/);
    await waitFor(() => expect(screen.getByRole("button", { name: "Descer Estrutura" })).toBeEnabled());
    await u.click(screen.getByRole("button", { name: "Descer Estrutura" }));
    await waitFor(() => expect(rede.chamadas.filter((c) => c.caminho.endsWith("/etapas/ordem"))).toHaveLength(2));
    const [a, b] = rede.chamadas.filter((c) => c.caminho.endsWith("/etapas/ordem")).map((c) => (c.corpo as { chave_idempotencia: string }).chave_idempotencia);
    expect(a).not.toBe(b);
  });

  it("Descer da 1ª de 3: manda [2, 1, 3], a tela mostra a ordem nova, o aviso fixo tem Fechar, e a etapa movida fica sob o ponteiro", async () => {
    // a altura de cada linha vem da posição dela na lista: 60 px por etapa
    const topo = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const lis = [...(this.parentElement?.children ?? [])].filter((x) => x.classList.contains("le-l"));
      const i = lis.indexOf(this);
      return { top: i < 0 ? 0 : 100 + i * 60 } as DOMRect;
    });
    const rolar = vi.fn();
    vi.stubGlobal("scrollBy", rolar);
    const rede = montarOrdem(OBRA);
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Descer Estrutura" }));
    expect(rede.chamadas.find((c) => c.caminho.endsWith("/etapas/ordem"))!.corpo).toMatchObject({ ordem: ["2", "1", "3"] });
    await waitFor(() => expect(screen.getByRole("group", { name: "Ordem de Estrutura: etapa 2 de 3" })).toBeInTheDocument());
    const nomes = within(screen.getByRole("list", { name: "Etapas do orçamento" })).getAllByRole("group").map((g) => g.getAttribute("aria-label"));
    expect(nomes).toEqual(["Ordem de Serviços preliminares: etapa 1 de 3", "Ordem de Estrutura: etapa 2 de 3", "Ordem de Fundação: etapa 3 de 3"]);
    expect(screen.getByRole("button", { name: "Fechar aviso" })).toBeInTheDocument();
    // a Estrutura desceu uma linha (60 px): a página rola junto, e o próximo toque no mesmo lugar cai nela de novo
    await waitFor(() => expect(rolar).toHaveBeenCalledWith(0, 60));
    expect(screen.getByRole("group", { name: "Ordem de Estrutura: etapa 2 de 3" }).closest("li")).toHaveClass("movida");
    topo.mockRestore();
  });

  it("aprovado: sem as setas", async () => {
    montarOrdem({ ...OBRA, status: "em_andamento" } as Obra);
    expect(await screen.findByText("Serviços preliminares")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Descer / })).toBeNull();
  });

  it("viewer não vê as setas", async () => {
    montarOrdem(OBRA, { ...USUARIO, papel: "viewer" });
    expect(await screen.findByText("Serviços preliminares")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Descer / })).toBeNull();
  });
});
