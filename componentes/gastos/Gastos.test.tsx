import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CampoRevisao, ComprovanteDetalhe, Obra } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, USUARIO, type Rota } from "@/testes/rede";
import { DURA_COM_ACAO, ProvedorCasca, useCasca } from "../contexto";
import { Gastos } from "../Gastos";
import { EnviarComprovante } from "./EnviarComprovante";
import { Revisao } from "./Revisao";

const OBRA = { id: "o1", tenant_id: "t-1", nome: "EMEI Santa Clara do Sul", status: "em_andamento" } as Obra;

const campo = (estado: CampoRevisao["estado"], rotulos: [string | number, string][], escolhido: number | null): CampoRevisao => ({
  estado,
  opcoes: rotulos.map(([valor, rotulo]) => ({ valor, rotulo, motivo: "lido", fornecedor_id: null })),
  escolhido,
});

const COMPROVANTE = {
  id: "c1",
  obra_id: "o1",
  tipo_conteudo: "image/png",
  tamanho: 1,
  legenda: "",
  quem: "Fulano",
  status: "a_revisar" as const,
  leitura: null,
  erro_leitura: null,
  lido_em: null,
  gasto_id: null,
  motivo_descarte: "",
  criado_em: "2026-11-05T10:00:00Z",
};

const DETALHE: ComprovanteDetalhe = {
  ...COMPROVANTE,
  revisao: {
    valor: campo("lido", [[48600, "R$ 486,00"]], 0),
    data_pagamento: campo("conferir", [["2026-11-03", "03/11/2026"], ["2026-11-02", "02/11/2026"]], null),
    favorecido: campo("lido", [["Madeireira Inventada", "Madeireira Inventada"]], 0),
    descricao: campo("lido", [["tábuas para forma", "tábuas para forma"]], 0),
    classificacao: { estado: "conferir", escolhido: null, opcoes: [{ etapa: "fundacao", topico_id: null, rotulo: "Fundação", motivo: "forma" }] },
    tipo_documento: "recibo",
    situacao_pagamento: "pago",
    avisos: [],
    observacoes: null,
  },
} as ComprovanteDetalhe;

const ARVORE = [
  { chave: "fundacao", nome: "Fundação", inclui: "", fixa: true, topicos: [] },
  { chave: "eletrica", nome: "Instalações elétricas", inclui: "", fixa: true, topicos: [] },
];

const GASTO = {
  id: "g1",
  obra_id: "o1",
  comprovante_id: null,
  valor: 35000,
  data_pagamento: "2026-11-04",
  favorecido: "Elétrica Exemplo",
  fornecedor_id: null,
  descricao: "mão de obra do quadro",
  etapa: "eletrica",
  topico_id: null,
  pedido_id: null,
  quem: "Fulano",
  estornado: false,
  criado_em: "2026-11-05T10:00:00Z",
};

function rede(extra: Record<string, Rota> = {}) {
  return criarRede({
    "POST /srv/auth/renovar": renovarOk,
    "GET /srv/api/comprovantes/c1": () => json(DETALHE),
    "GET /srv/api/comprovantes/c1/arquivo": () => new Response(new Blob(["x"], { type: "image/png" })),
    "GET /srv/api/obras/o1/arvore": () => json(ARVORE),
    "GET /srv/api/obras/o1/pedidos": () => json([]),
    "GET /srv/api/obras/o1/comprovantes": () => json([]),
    "GET /srv/api/obras/o1/gastos": () => json([GASTO]),
    "GET /srv/api/obras/o1/gastos/resumo": () => json({ total: 35000, pagamentos_de_pedidos: 0, a_revisar: 0, etapas: [] }),
    ...extra,
  });
}

const comCasca = (filho: React.ReactNode) => (
  <ProvedorCasca usuario={USUARIO} demo={false}>
    {filho}
  </ProvedorCasca>
);

beforeEach(() => {
  // o jsdom não tem URL de blob: a prévia e o arquivo da revisão só precisam de um endereço qualquer
  URL.createObjectURL ??= () => "blob:x";
  URL.revokeObjectURL ??= () => {};
});
afterEach(() => {
  limparSessao();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** O nome de quem tem o foco, como a pessoa ouve no leitor de tela. */
function nomeDoFoco(): string {
  const el = document.activeElement as HTMLElement;
  if (el instanceof HTMLInputElement && el.type === "radio") return `rádio ${el.closest("label")?.textContent?.trim() || el.getAttribute("aria-label")}`;
  return el.getAttribute("aria-label") || el.textContent?.trim() || el.tagName;
}

describe("revisão pelo teclado", () => {
  it("o Tab passa por cada grupo (a opção da IA), pelos campos e chega aos botões do rodapé; dá a volta sem escapar", async () => {
    rede();
    render(comCasca(<Revisao comprovanteId="c1" obra={OBRA} fechar={() => {}} />));
    await screen.findByRole("radiogroup", { name: "Valor pago" });
    const caixa = screen.getByRole("dialog");
    await waitFor(() => expect(within(caixa).getByRole("button", { name: /Não é gasto/ })).toBeEnabled());
    act(() => caixa.focus());
    const visto: string[] = [];
    for (let i = 0; i < 20; i++) {
      await userEvent.tab();
      visto.push(nomeDoFoco());
      expect(caixa.contains(document.activeElement)).toBe(true);
    }
    // a opção lida pela IA (marcada) é a parada do grupo do valor; o grupo da data, sem nada marcado, para na 1ª
    const parou = (inicio: string) => visto.some((v) => v.startsWith(inicio));
    expect(parou("rádio R$ 486,00")).toBe(true);
    expect(parou("rádio 03/11/2026")).toBe(true);
    expect(parou("rádio 02/11/2026")).toBe(false);
    expect(parou("rádio Fundação")).toBe(true);
    // o rodapé, que antes o Tab nunca alcançava
    const i = visto.indexOf("Não é gasto");
    expect(i).toBeGreaterThan(0);
    expect(visto[i + 1]).toBe("Ler de novo");
    // Confirmar ainda está desligado (falta data e etapa): depois de "Ler de novo" vem o X, de volta ao começo
    expect(visto[i + 2]).toBe("Fechar");
  });

  it("Shift+Tab volta, e as setas trocam a opção dentro do grupo (sem sair dele)", async () => {
    rede();
    render(comCasca(<Revisao comprovanteId="c1" obra={OBRA} fechar={() => {}} />));
    await screen.findByRole("radiogroup", { name: "Data do pagamento" });
    const primeira = screen.getByRole("radio", { name: /03\/11\/2026/ });
    act(() => primeira.focus());
    await userEvent.keyboard("{ArrowDown}");
    const segunda = screen.getByRole("radio", { name: /02\/11\/2026/ });
    expect(document.activeElement).toBe(segunda);
    expect(segunda).toBeChecked();
    // com a 2ª marcada, ela passa a ser a parada do grupo: Tab sai do grupo (vai ao campo da data) e Shift+Tab volta a ela
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByLabelText("Data do pagamento (outra)"));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(segunda);
  });

  it("do Não é gasto, o Tab vai para o próximo botão, não para o corpo da página", async () => {
    rede();
    render(comCasca(<Revisao comprovanteId="c1" obra={OBRA} fechar={() => {}} />));
    const nao = await screen.findByRole("button", { name: "Não é gasto" });
    await waitFor(() => expect(nao).toBeEnabled());
    act(() => nao.focus());
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Ler de novo" }));
  });
});

describe("confirmar e desfazer pelo aviso", () => {
  it("o Desfazer do aviso 'Gasto lançado' desfaz pelo registro que a confirmação devolveu", async () => {
    const r = rede({
      "POST /srv/api/comprovantes/c1/confirmar": () => json({ gasto: GASTO, comprovante: { ...COMPROVANTE, status: "confirmado" }, registro_id: "reg-9" }, 201),
      "POST /srv/api/registro/reg-9/desfazer": () => json({ id: "reg-10", texto: "Desfeito", criado_em: "2026-11-05T10:00:00Z" }),
    });
    const fechar = vi.fn();
    render(comCasca(<Revisao comprovanteId="c1" obra={OBRA} fechar={fechar} />));
    await userEvent.click(await screen.findByRole("radio", { name: /03\/11\/2026/ }));
    await userEvent.click(screen.getByRole("radio", { name: /Fundação/ }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar gasto" }));
    await waitFor(() => expect(fechar).toHaveBeenCalled());
    expect(await screen.findByText("Gasto de R$ 350,00 lançado.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(await screen.findByText("Desfeito.")).toBeInTheDocument();
    expect(r.chamadas.some((c) => c.metodo === "POST" && c.caminho === "/srv/api/registro/reg-9/desfazer")).toBe(true);
  });

  it("com o ponteiro em cima, o aviso com Desfazer não some; saiu de cima, ainda fica uns segundos", () => {
    vi.useFakeTimers();
    let avisarFeito!: (t: string, r: string) => void;
    function Pega() {
      avisarFeito = useCasca().avisarFeito;
      return null;
    }
    render(comCasca(<Pega />));
    act(() => avisarFeito("Gasto de R$ 1,00 lançado.", "reg-1"));
    const aviso = screen.getByText("Gasto de R$ 1,00 lançado.").parentElement!;
    fireEvent.pointerEnter(aviso);
    act(() => void vi.advanceTimersByTime(DURA_COM_ACAO + 5000));
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeInTheDocument();
    fireEvent.pointerLeave(aviso);
    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(1500));
    expect(screen.queryByRole("button", { name: "Desfazer" })).toBeNull();
  });
});


describe("enviar comprovante", () => {
  const escolher = async (f: File) => {
    const entrada = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    // sem o filtro do accept: o seletor do celular nem sempre o respeita, e a tela tem de recusar sozinha
    await userEvent.setup({ applyAccept: false }).upload(entrada, f);
  };

  it("arquivo que não é foto nem PDF: o aviso aparece na escolha, junto do seletor, e o Enviar fica desligado", async () => {
    rede();
    render(comCasca(<EnviarComprovante obra={OBRA} fechar={() => {}} revisar={() => {}} />));
    await escolher(new File(["oi"], "comprovante.txt", { type: "text/plain" }));
    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("Envie uma foto ou um PDF do comprovante.");
    const seletor = screen.getByRole("button", { name: /comprovante\.txt/ });
    expect(seletor).toHaveAttribute("aria-describedby", aviso.id);
    expect(screen.getByRole("button", { name: "Enviar e ler" })).toBeDisabled();
  });

  it(".jpg que não abre é 'corrompido', não 'formato errado'", async () => {
    rede();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => Promise.reject(new Error("decode"))));
    render(comCasca(<EnviarComprovante obra={OBRA} fechar={() => {}} revisar={() => {}} />));
    await escolher(new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])], "foto.jpg", { type: "image/jpeg" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("parece corrompido");
    expect(screen.getByRole("alert")).not.toHaveTextContent("envie em JPG");
    expect(screen.getByRole("button", { name: "Enviar e ler" })).toBeDisabled();
  });

  it("a legenda digitada vai no envio", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 800, height: 600, close: () => {} })));
    let form: FormData | null = null;
    rede({
      "POST /srv/api/obras/o1/comprovantes": ({ init }) => {
        form = init.body as FormData;
        return json({ ...COMPROVANTE, ja_existia: true, status: "confirmado" }, 200);
      },
    });
    const fechar = vi.fn();
    render(comCasca(<EnviarComprovante obra={OBRA} fechar={fechar} revisar={() => {}} />));
    await escolher(new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "pix.jpg", { type: "image/jpeg" }));
    await userEvent.type(screen.getByLabelText(/Do que é/), "mão de obra do quadro");
    const enviar = screen.getByRole("button", { name: "Enviar e ler" });
    await waitFor(() => expect(enviar).toBeEnabled());
    await userEvent.click(enviar);
    await waitFor(() => expect(fechar).toHaveBeenCalled());
    expect(form).not.toBeNull();
    expect(form!.get("legenda")).toBe("mão de obra do quadro");
    expect(form!.get("arquivo")).toBeInstanceOf(Blob);
  });
});

describe("aba Gastos", () => {
  it("fila sem legenda mostra o que a IA leu: valor, quem recebeu e a data", async () => {
    rede({
      "GET /srv/api/obras/o1/comprovantes": () =>
        json([
          {
            ...COMPROVANTE,
            leitura: {
              valor: { certeza: "alta", opcoes: [{ valor: "1.284,90", motivo: "total" }] },
              favorecido: { certeza: "alta", opcoes: [{ valor: "Loja Fictícia", motivo: "cabeçalho" }] },
              data_pagamento: { certeza: "alta", opcoes: [{ valor: "2026-11-05", motivo: "data" }] },
              descricao: { certeza: "alta", opcoes: [{ valor: "cimento e areia", motivo: "itens" }] },
            },
          },
          { ...COMPROVANTE, id: "c2", erro_leitura: "falhou" },
        ]),
    });
    render(comCasca(<Gastos obra={OBRA} />));
    expect(await screen.findByText("cimento e areia")).toBeInTheDocument();
    expect(screen.getByText("R$ 1.284,90")).toBeInTheDocument();
    expect(screen.getByText(/Loja Fictícia/)).toBeInTheDocument();
    expect(screen.getByText(/pago em 05\/11\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/não lido/)).toBeInTheDocument();
  });

  it("Mudar etapa com a API de hoje (sem a rota): mensagem clara, nada quebra", async () => {
    const r = rede({ "PATCH /srv/api/gastos/g1": () => json({ detail: "Not Found" }, 404) });
    render(comCasca(<Gastos obra={OBRA} />));
    await userEvent.click(await screen.findByRole("tab", { name: /Lançados/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Mudar etapa de mão de obra do quadro" }));
    await userEvent.selectOptions(screen.getByLabelText("Etapa"), "fundacao");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Mudar etapa" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ainda não está disponível");
    expect(r.chamadas.find((c) => c.metodo === "PATCH")?.corpo).toEqual({ etapa: "fundacao" });
  });

  it("opção 2: etapas do orçamento com código, gasto sem etapa do orçamento destacado e movido com Desfazer", async () => {
    rede({
      "GET /srv/api/obras/o1/arvore": () =>
        json({
          origem: "orcamento",
          etapas: [
            { chave: "3", nome: "FUNDAÇÕES", inclui: "", fixa: true, topicos: [] },
            { chave: "18", nome: "INSTALAÇÃO ELÉTRICA - 220V", inclui: "", fixa: true, topicos: [] },
          ],
        }),
      "GET /srv/api/obras/o1/gastos/resumo": () =>
        json({ total: 35000, pagamentos_de_pedidos: 0, a_revisar: 0, etapas: [{ etapa: "eletrica", nome: "Instalações elétricas", total: 35000, topicos: [] }] }),
      "PATCH /srv/api/gastos/g1": ({ corpo }) => json({ ...GASTO, ...(corpo as object), registro_id: "reg-5" }),
      "POST /srv/api/registro/reg-5/desfazer": () => json({ id: "reg-6", texto: "Desfeito", criado_em: "2026-11-05T10:00:00Z" }),
    });
    render(comCasca(<Gastos obra={OBRA} />));
    await userEvent.click(await screen.findByRole("tab", { name: /Lançados/ }));
    expect(await screen.findByText(/R\$ 350,00 em gastos sem etapa do orçamento/)).toBeInTheDocument();
    expect(screen.getAllByText("sem etapa do orçamento").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Mudar etapa de mão de obra do quadro" }));
    expect(screen.getByRole("option", { name: "18 · INSTALAÇÃO ELÉTRICA - 220V" })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Etapa"), "18");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Mudar etapa" }));
    expect(await screen.findByText("R$ 350,00 agora em 18 · INSTALAÇÃO ELÉTRICA - 220V.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Etapas e tópicos/ }));
    expect(await screen.findByText("As etapas são as do orçamento da obra.", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/Obra sem orçamento/)).toBeNull();
  });

  it("sem orçamento (a árvore de hoje, sem origem): a nota das etapas padrão; arquivados com gasto voltam pelo Reativar", async () => {
    const r = rede({
      "GET /srv/api/obras/o1/gastos/resumo": () =>
        json({
          total: 35000,
          pagamentos_de_pedidos: 0,
          a_revisar: 0,
          etapas: [
            { etapa: "eletrica", nome: "Instalações elétricas", total: 35000, topicos: [{ topico_id: "t-arq", nome: "Sapatas S1 a S12", total: 35000 }] },
            { etapa: "x-e2", nome: "Aterro (Aditivo 01)", total: 0, topicos: [] },
          ],
        }),
      "PATCH /srv/api/etapas-extras/e2": () => json({ id: "e2", nome: "Aterro (Aditivo 01)", arquivado: false, registro_id: "reg-7" }),
    });
    render(comCasca(<Gastos obra={OBRA} />));
    await userEvent.click(await screen.findByRole("tab", { name: /Etapas e tópicos/ }));
    expect(await screen.findByText(/Obra sem orçamento: etapas padrão/)).toBeInTheDocument();
    expect(screen.queryByText("Aterro (Aditivo 01)")).toBeNull();
    await userEvent.click(screen.getByLabelText(/Mostrar arquivados/));
    const lista = screen.getByRole("list", { name: "Arquivados" });
    expect(within(lista).getByText("Sapatas S1 a S12")).toBeInTheDocument();
    const linha = within(lista).getByText("Aterro (Aditivo 01)").closest("li")!;
    await userEvent.click(within(linha).getByRole("button", { name: "Reativar" }));
    await waitFor(() => expect(r.chamadas.some((c) => c.metodo === "PATCH" && c.caminho === "/srv/api/etapas-extras/e2")).toBe(true));
    expect(r.chamadas.find((c) => c.metodo === "PATCH")!.corpo).toEqual({ arquivado: false });
    expect(await screen.findByText("Aterro (Aditivo 01) reativado.")).toBeInTheDocument();
  });
});

describe("gastos lançados em páginas", () => {
  const gasto = (n: number) => ({
    ...GASTO,
    id: `g${n}`,
    descricao: `gasto ${n}`,
    valor: 1000 + n,
    criado_em: new Date(Date.UTC(2026, 10, 5, 12, 0, 0) - n * 60_000).toISOString(),
  });
  const pagina1 = Array.from({ length: 50 }, (_, i) => gasto(i));
  const pagina2 = Array.from({ length: 7 }, (_, i) => gasto(50 + i));
  const paginado: Rota = ({ url }) => {
    const limite = Number(url.searchParams.get("limite"));
    if (url.searchParams.get("antes_de")) return json(pagina2);
    return json([...pagina1, ...pagina2].slice(0, limite));
  };

  it("mostra 50 por vez e carrega os mais antigos pelo cursor até acabar", async () => {
    const r = rede({ "GET /srv/api/obras/o1/gastos": paginado });
    render(comCasca(<Gastos obra={OBRA} />));
    await userEvent.click(await screen.findByRole("tab", { name: "Lançados" }));
    const lista = await screen.findByRole("list", { name: "Gastos lançados" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(50);
    await userEvent.click(screen.getByRole("button", { name: "Carregar gastos mais antigos" }));
    await waitFor(() => expect(within(lista).getAllByRole("listitem")).toHaveLength(57));
    const pedidos = r.chamadas.filter((c) => c.caminho === "/srv/api/obras/o1/gastos");
    expect(pedidos.at(-1)!.url.searchParams.get("antes_de")).toBe(pagina1.at(-1)!.criado_em);
    expect(pedidos.at(-1)!.url.searchParams.get("limite")).toBe("50");
    // a 2ª página veio menor que 50: acabou, o botão some
    expect(screen.queryByRole("button", { name: "Carregar gastos mais antigos" })).toBeNull();
  });

  it("mudar a etapa de um gasto da 2ª página não volta à 1ª: rebusca o que já estava carregado", async () => {
    const r = rede({
      "GET /srv/api/obras/o1/gastos": paginado,
      "PATCH /srv/api/gastos/g55": ({ corpo }) => json({ ...gasto(55), ...(corpo as object), registro_id: "reg-9" }),
    });
    render(comCasca(<Gastos obra={OBRA} />));
    await userEvent.click(await screen.findByRole("tab", { name: "Lançados" }));
    const lista = await screen.findByRole("list", { name: "Gastos lançados" });
    await userEvent.click(screen.getByRole("button", { name: "Carregar gastos mais antigos" }));
    await waitFor(() => expect(within(lista).getAllByRole("listitem")).toHaveLength(57));
    await userEvent.click(screen.getByRole("button", { name: "Mudar etapa de gasto 55" }));
    await userEvent.selectOptions(screen.getByLabelText("Etapa"), "fundacao");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Mudar etapa" }));
    await waitFor(() => expect(r.chamadas.filter((c) => c.caminho === "/srv/api/obras/o1/gastos").at(-1)!.url.searchParams.get("limite")).toBe("57"));
    expect(within(await screen.findByRole("list", { name: "Gastos lançados" })).getAllByRole("listitem")).toHaveLength(57);
  });
});
