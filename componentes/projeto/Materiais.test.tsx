import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Obra, Orcamento, Usuario } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import type { MateriaisProjeto } from "@/lib/tradutor";
import { criarRede, json, renovarOk, USUARIO } from "@/testes/rede";
import { ProvedorCasca } from "../contexto";
import { CartaoMateriais, Materiais, situacaoNoOrcamento, useMateriais } from "./Materiais";

const OBRA = { id: "o-1", nome: "Casa Inventada", uf: "MG" } as Obra;

const MATERIAIS: MateriaisProjeto = {
  referencia: { fonte: "SINAPI", mes: "2026-09", encargos: "sem desoneração", uf: "MG" },
  itens: [
    { chave: "aco:CA50:10.0", categoria: "aco", especificacao: "Aço CA-50 Ø 10,0 mm", unidade: "kg", quantidade: 220.3, origem: ["Folha 02"],
      ajuste: "Ø 9,8 não é bitola fabricada (NBR 7480): considerado Ø 10,0", nota: null,
      referencia: { codigo: "34", descricao: "ACO CA-50, 10,0 MM, VERGALHAO", unidade: "KG", preco_centavos: 669, total_centavos: 147381 } },
    { chave: "enchimento:B8", categoria: "enchimento", especificacao: "EPS B8/30/125", unidade: "un", quantidade: 382, origem: ["Folha 01"],
      ajuste: null, nota: null, referencia: null },
    { chave: "vigota:planta", categoria: "vigota", especificacao: "Vigotas pré-moldadas (2 tipos)", unidade: "un", quantidade: 0, origem: ["Folha 03"],
      ajuste: null, nota: "Quantidade a confirmar com o fornecedor da laje", referencia: null },
  ],
  total_referencia_centavos: 147381,
  avisos: [],
  em_andamento: [],
  nao_encontradas: [],
};

const VAZIO_ORC = { versoes: [], itens: [], etapas: [], totais: {} };
const previa = (aplicar: boolean, tipo: "contrato" | "aditivo") => ({
  aplicado: aplicar, tipo, registro_id: aplicar ? "rv1" : null, versao_id: aplicar ? "v1" : null, total: 147381, n_itens: 2, erros: [], avisos: [], itens: [], ignoradas: [], n_etapas: 1, etapas: [], substitui: null,
});
const estrutura = (tipo: "contrato" | "aditivo" = "contrato") => ({ corpo }: { corpo: unknown }) => json(previa((corpo as { aplicar: boolean }).aplicar, tipo));

// a lista e o cartão, ligados como na tela do Projeto
function Tela({ ids = ["f1", "f2"] }: { ids?: string[] }) {
  const m = useMateriais(ids, "MG");
  return (
    <>
      <Materiais {...m} />
      <CartaoMateriais obra={OBRA} dados={m.dados} />
    </>
  );
}
const comCasca = (ids: string[] | undefined, usuario: Usuario = USUARIO) => (
  <ProvedorCasca usuario={usuario} demo={false}>
    <Tela ids={ids} />
  </ProvedorCasca>
);
const montar = (usuario: Usuario = USUARIO) => render(comCasca(undefined, usuario));
const rotas = (extra = {}) => ({
  "POST /srv/auth/renovar": renovarOk,
  "GET /srv/tradutor/projetos/materiais": () => json(MATERIAIS),
  "GET /srv/api/obras/o-1/orcamento": () => json(VAZIO_ORC),
  ...extra,
});
const escritas = (rede: ReturnType<typeof criarRede>) => rede.chamadas.filter((c) => c.caminho.endsWith("/orcamento/estrutura"));
const NOME_ACO = "Aço CA-50 Ø 10,0 mm (SINAPI 34)";

beforeEach(() => {
  limparSessao();
  localStorage.clear();
});
afterEach(() => {
  limparSessao();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("Materiais das pranchas", () => {
  it("mostra cada material com o insumo do SINAPI, o ajuste da bitola e o que fica para o fornecedor", async () => {
    const rede = criarRede(rotas());
    montar();
    const lista = await screen.findByRole("list", { name: "Materiais do projeto" });
    expect(rede.chamadas.find((c) => c.caminho.endsWith("/materiais"))!.url.searchParams.get("uf")).toBe("MG");
    expect(screen.getByText(/SINAPI 09\/2026/)).toBeInTheDocument();
    const aco = within(lista).getByText("Aço CA-50 Ø 10,0 mm").closest("li")!;
    expect(aco).toHaveTextContent("SINAPI 34");
    expect(aco).toHaveTextContent("NBR 7480");
    expect(within(lista).getByText("EPS B8/30/125").closest("li")).toHaveTextContent("Sem item avulso no SINAPI");
    expect(within(lista).getByText("Vigotas pré-moldadas (2 tipos)").closest("li")).toHaveTextContent("a confirmar");
  });

  it("nada entra no orçamento sem o clique: abrir a tela só lista e conta", async () => {
    const rede = criarRede(rotas({ "POST /srv/api/obras/o-1/orcamento/estrutura": estrutura() }));
    montar();
    // só contam os que têm quantidade: a vigota "a confirmar" não vai
    expect(await screen.findByText("2 materiais saíram das pranchas.")).toBeInTheDocument();
    expect(escritas(rede)).toEqual([]);
  });

  it("levar pede a prévia, confirma e só então grava, com Desfazer", async () => {
    const rede = criarRede(rotas({ "POST /srv/api/obras/o-1/orcamento/estrutura": estrutura() }));
    const u = userEvent.setup();
    montar();
    await u.click(await screen.findByRole("button", { name: "Levar para o orçamento…" }));

    const dialogo = await screen.findByRole("dialog", { name: "Levar os materiais para o orçamento?" });
    expect(dialogo).toHaveTextContent("viram a etapa Estrutura do orçamento inicial");
    expect(dialogo).toHaveTextContent("1 material sem quantidade fica de fora.");
    expect(escritas(rede).map((c) => (c.corpo as { aplicar: boolean }).aplicar)).toEqual([false]);

    // Voltar não grava
    await u.click(within(dialogo).getByRole("button", { name: "Voltar" }));
    expect(escritas(rede).map((c) => (c.corpo as { aplicar: boolean }).aplicar)).toEqual([false]);

    await u.click(screen.getByRole("button", { name: "Levar para o orçamento…" }));
    await u.click(await screen.findByRole("button", { name: "Levar para o orçamento" }));

    expect(await screen.findByText("Materiais das pranchas no orçamento, como orçamento inicial.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeInTheDocument();
    const gravou = escritas(rede).at(-1)!.corpo as { aplicar: boolean; chave_idempotencia: string; itens: { nome: string }[] };
    expect(gravou.aplicar).toBe(true);
    expect(gravou.chave_idempotencia).toMatch(/^[0-9a-f-]{36}$/);
    expect(gravou.itens.map((i) => i.nome)).toEqual([NOME_ACO, "EPS B8/30/125"]);
  });

  it("resposta perdida: repete com a mesma chave e relê o orçamento; depois de gravar, a chave é outra", async () => {
    let tentativas = 0;
    const rede = criarRede(
      rotas({
        "POST /srv/api/obras/o-1/orcamento/estrutura": ({ corpo }: { corpo: unknown }) => {
          const aplicar = (corpo as { aplicar: boolean }).aplicar;
          if (aplicar && ++tentativas === 1) return json({ detail: "O servidor não respondeu." }, 502);
          return json(previa(aplicar, "contrato"));
        },
      }),
    );
    const leiturasDoOrcamento = () => rede.chamadas.filter((c) => c.caminho === "/srv/api/obras/o-1/orcamento").length;
    const chaves = () =>
      escritas(rede)
        .map((c) => c.corpo as { aplicar: boolean; chave_idempotencia: string })
        .filter((c) => c.aplicar)
        .map((c) => c.chave_idempotencia);
    const u = userEvent.setup();
    montar();
    const abrirEConfirmar = async () => {
      await u.click(await screen.findByRole("button", { name: "Levar para o orçamento…" }));
      await u.click(await screen.findByRole("button", { name: "Levar para o orçamento" }));
    };

    await abrirEConfirmar();
    const dialogo = await screen.findByRole("dialog", { name: "Levar os materiais para o orçamento?" });
    expect(await within(dialogo).findByText("O servidor não respondeu.")).toBeInTheDocument();
    await vi.waitFor(() => expect(leiturasDoOrcamento()).toBe(2));
    await u.click(within(dialogo).getByRole("button", { name: "Voltar" }));

    // fechar e reabrir não troca a chave: se a primeira gravou, a API devolve a mesma versão
    await abrirEConfirmar();
    await screen.findByText("Materiais das pranchas no orçamento, como orçamento inicial.");
    expect(chaves()).toHaveLength(2);
    expect(chaves()[1]).toBe(chaves()[0]);

    await abrirEConfirmar();
    await vi.waitFor(() => expect(chaves()).toHaveLength(3));
    expect(chaves()[2]).not.toBe(chaves()[0]);
  });

  it("ao mudar as folhas, tira a leitura velha até a nova chegar: nada de levar materiais antigos", async () => {
    let liberar: (r: Response) => void = () => {};
    let leituras = 0;
    criarRede(
      rotas({
        "GET /srv/tradutor/projetos/materiais": () => (++leituras === 1 ? json(MATERIAIS) : new Promise<Response>((r) => (liberar = r))),
      }),
    );
    const { rerender } = render(comCasca(["f1", "f2"]));
    await screen.findByRole("button", { name: "Levar para o orçamento…" });

    rerender(comCasca(["f1"]));
    await vi.waitFor(() => expect(screen.queryByRole("button", { name: "Levar para o orçamento…" })).toBeNull());
    expect(screen.getByText(/Levantando os materiais/)).toBeInTheDocument();

    // a 2ª leitura precisa ter saído: antes disso, ainda não há o que liberar
    await vi.waitFor(() => expect(leituras).toBe(2));
    liberar(json(MATERIAIS));
    expect(await screen.findByRole("button", { name: "Levar para o orçamento…" })).toBeInTheDocument();
  });

  it("um passo por vez: primeiro levar, em destaque; levado, o foco vai para Ver o orçamento", async () => {
    const LEVADO = {
      ...VAZIO_ORC,
      versoes: [{ id: "v1", tipo: "contrato", descricao: "Estrutura", ativa: true }],
      itens: [
        { versao_id: "v1", tipo: "item", descricao: NOME_ACO, quantidade: 220300, valor_unitario: 669 },
        { versao_id: "v1", tipo: "item", descricao: "EPS B8/30/125", quantidade: 382000, valor_unitario: 0 },
      ],
    };
    let gravou = false;
    criarRede(
      rotas({
        "GET /srv/api/obras/o-1/orcamento": () => json(gravou ? LEVADO : VAZIO_ORC),
        "POST /srv/api/obras/o-1/orcamento/estrutura": ({ corpo }: { corpo: unknown }) => {
          gravou = (corpo as { aplicar: boolean }).aplicar;
          return json(previa(gravou, "contrato"));
        },
      }),
    );
    const u = userEvent.setup();
    montar();
    const levar = await screen.findByRole("button", { name: "Levar para o orçamento…" });
    expect(levar).toHaveClass("amb");
    expect(screen.queryByRole("link", { name: "Ver o orçamento" })).toBeNull();

    await u.click(levar);
    await u.click(await screen.findByRole("button", { name: "Levar para o orçamento" }));
    const ir = await screen.findByRole("link", { name: "Ver o orçamento" });
    expect(ir).toHaveClass("amb");
    await vi.waitFor(() => expect(ir).toHaveFocus());
    expect(screen.queryByRole("button", { name: "Levar para o orçamento…" })).toBeNull();
  });

  it("pranchas que mudaram depois de levar: o destaque é ver o orçamento, levar de novo fica sem destaque", async () => {
    const orc = {
      ...VAZIO_ORC,
      versoes: [{ id: "v1", tipo: "contrato", descricao: "Estrutura", ativa: true }],
      itens: [{ versao_id: "v1", tipo: "item", descricao: "Outro material", quantidade: 1000, valor_unitario: 100 }],
    };
    criarRede(rotas({ "GET /srv/api/obras/o-1/orcamento": () => json(orc) }));
    montar();
    expect(await screen.findByRole("button", { name: "Levar para o orçamento…" })).not.toHaveClass("amb");
    expect(screen.getByRole("link", { name: "Ver o orçamento" })).toHaveClass("amb");
  });

  it("sem material com quantidade, o passo é ver o orçamento", async () => {
    criarRede(rotas({ "GET /srv/tradutor/projetos/materiais": () => json({ ...MATERIAIS, itens: [MATERIAIS.itens[2]] }) }));
    montar();
    expect(await screen.findByRole("link", { name: "Ver o orçamento" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Levar para o orçamento…" })).toBeNull();
  });

  it("em obra com contrato, o diálogo avisa que entra como aditivo e diz o valor no botão", async () => {
    const rede = criarRede(rotas({ "POST /srv/api/obras/o-1/orcamento/estrutura": estrutura("aditivo") }));
    const u = userEvent.setup();
    montar();
    await u.click(await screen.findByRole("button", { name: "Levar para o orçamento…" }));
    const dialogo = await screen.findByRole("dialog", { name: "Levar os materiais para o orçamento?" });
    expect(dialogo).toHaveTextContent("já tem orçamento inicial: os materiais entram como aditivo");
    await u.click(within(dialogo).getByRole("button", { name: /Lançar aditivo de R\$\s1\.473,81/ }));
    expect(await screen.findByText("Materiais das pranchas no orçamento, como aditivo.")).toBeInTheDocument();
    expect((escritas(rede).at(-1)!.corpo as { aplicar: boolean }).aplicar).toBe(true);
  });

  it("os mesmos materiais já no orçamento: não oferece lançar de novo", async () => {
    const orc = {
      ...VAZIO_ORC,
      versoes: [{ id: "v1", tipo: "contrato", descricao: "Estrutura", ativa: true }],
      itens: [
        { versao_id: "v1", tipo: "etapa", descricao: "Estrutura", quantidade: 0, valor_unitario: 0 },
        { versao_id: "v1", tipo: "item", descricao: NOME_ACO, quantidade: 220300, valor_unitario: 669 },
        { versao_id: "v1", tipo: "item", descricao: "EPS B8/30/125", quantidade: 382000, valor_unitario: 0 },
      ],
    };
    criarRede(rotas({ "GET /srv/api/obras/o-1/orcamento": () => json(orc) }));
    montar();
    expect(await screen.findByText("2 materiais das pranchas já estão no orçamento.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Levar para o orçamento…" })).toBeNull();
  });

  it("viewer vê a lista, mas não leva nada para o orçamento", async () => {
    const rede = criarRede(rotas());
    const u = userEvent.setup();
    montar({ ...USUARIO, papel: "viewer" });
    await u.click(await screen.findByRole("button", { name: "Ver" }));
    expect(screen.getByRole("dialog", { name: "Materiais das pranchas" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Levar para o orçamento…" })).toBeNull();
    expect(escritas(rede)).toEqual([]);
  });

  it("erro do tradutor aparece em linguagem de gente", async () => {
    criarRede(rotas({ "GET /srv/tradutor/projetos/materiais": () => json({ detail: "O tradutor de pranchas não respondeu." }, 502) }));
    montar();
    expect(await screen.findByRole("alert")).toHaveTextContent("O tradutor de pranchas não respondeu.");
  });
});

describe("situacaoNoOrcamento", () => {
  const MATERIAL = { nome: "Aço", unidade: "kg", quantidade: 1000, valor_unitario: 500 };
  const orc = (ativa: boolean, quantidade: number) =>
    ({ versoes: [{ id: "v", descricao: "Estrutura", ativa }], itens: [{ versao_id: "v", tipo: "item", descricao: "Aço", quantidade, valor_unitario: 500 }] }) as unknown as Orcamento;
  it("distingue fora, igual e de pranchas anteriores; versão desfeita não conta", () => {
    expect(situacaoNoOrcamento([MATERIAL], null)).toBe("fora");
    expect(situacaoNoOrcamento([MATERIAL], orc(true, 1000))).toBe("igual");
    expect(situacaoNoOrcamento([MATERIAL], orc(true, 2000))).toBe("anterior");
    expect(situacaoNoOrcamento([MATERIAL], orc(false, 1000))).toBe("fora");
  });
});
