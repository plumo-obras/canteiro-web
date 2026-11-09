import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Obra, Usuario } from "@/lib/contrato";
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
    expect(within(screen.getByRole("note")).getByRole("button", { name: "Importar planilha" })).toBeInTheDocument();
  });

  it("viewer lê o aviso, sem o botão de importar", async () => {
    montar(orc(PRANCHAS, [500]), { ...USUARIO, papel: "viewer" });
    expect(await screen.findByText(/só o que as pranchas trazem/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Importar planilha" })).toBeNull();
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
