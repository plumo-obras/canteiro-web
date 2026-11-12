import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HojeNaObra as Hoje, Obra, Proposta } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, USUARIO } from "@/testes/rede";
import { ProvedorCasca, useCasca } from "../contexto";
import type { AbaAtiva } from "../sessoes";
import { diaCurto, diaPorExtenso, fraseDoDia, HojeNaObra, linhaDoDia, saudacao } from "./HojeNaObra";

const OBRA = { id: "o1", nome: "Casa Inventada" } as Obra;
const HOJE: Hoje = {
  hoje: "2026-11-09",
  resumo: { situacao: "no_prazo", frase: "A obra está no prazo.", esperando: 1 },
  pontos: [
    { tipo: "gastos_a_conferir", prioridade: "pede_voce", titulo: "2 comprovantes para conferir.", detalhe: "R$ 1.022,00 no total.", acao: { tela: "gastos", rotulo: "Conferir os 2", filtro: { status: "a_revisar" } } },
    { tipo: "entregas_semana", prioridade: "a_caminho", titulo: "O aço chega quinta.", detalhe: "Com a Ferragem Inventada.", acao: { tela: "suprimentos", rotulo: "Ver em Compras", filtro: null } },
    { tipo: "desconhecido", prioridade: "atencao", titulo: "Tela nova.", detalhe: "", acao: { tela: "tela-do-futuro", rotulo: "Abrir", filtro: null } },
  ],
  mais: 2,
  semana: [{ data: "2026-11-12", tipo: "entrega", titulo: "Entrega do aço", detalhe: "Ferragem Inventada", acao: null }],
};
const ir = vi.fn();
let filtroLido: () => unknown = () => null;
const SEM_PROPOSTAS: Proposta[] = [];
function CascaFalsa({ propostas = SEM_PROPOSTAS }: { propostas?: Proposta[] }) {
  const { registrarNavegacao, receberPropostas, lerFiltroTela } = useCasca();
  filtroLido = () => lerFiltroTela("gastos");
  useEffect(() => registrarNavegacao((t: AbaAtiva) => ir(t)), [registrarNavegacao]);
  useEffect(() => receberPropostas(propostas), [receberPropostas, propostas]);
  return null;
}
const proposta = (id: string, obra_id = "o1") =>
  ({ id, obra_id, tipo: "criar_pedido", status: "pendente", resumo: `Pedido ${id}`, dados: { insumo_id: "a", quantidade: 1000, fornecedor: "Ferragem Inventada", valor: 100 }, criado_em: "2026-11-09T10:00:00Z", conta: null }) as unknown as Proposta;
const montar = (corpo: () => Response, propostas?: Proposta[]) => {
  criarRede({ "POST /srv/auth/renovar": renovarOk, "GET /srv/api/obras/o1/hoje": corpo });
  render(
    <ProvedorCasca usuario={USUARIO} demo={false}>
      <CascaFalsa propostas={propostas} />
      <HojeNaObra obra={OBRA} alternativa={<p>conversa vazia</p>} />
    </ProvedorCasca>,
  );
};

beforeEach(() => {
  limparSessao();
  ir.mockClear();
});
afterEach(() => {
  limparSessao();
  vi.unstubAllGlobals();
});

describe("HojeNaObra", () => {
  it("mostra a frase pronta, os pontos e a semana; o botão leva à tela", async () => {
    montar(() => json(HOJE));
    expect(await screen.findByText(/A obra está no prazo, com 1 coisa esperando você\./)).toBeInTheDocument();
    const pontos = screen.getByRole("list", { name: "Hoje na obra" });
    expect(within(pontos).getByText("2 comprovantes para conferir.")).toBeInTheDocument();
    expect(screen.getByText("E mais 2 pontos depois destes.")).toBeInTheDocument();
    // a semana fica numa gaveta, atrás da etiqueta
    expect(screen.queryByText("Entrega do aço")).toBeNull();
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: /Esta semana · / }));
    expect(screen.getByText("Entrega do aço")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByText("Entrega do aço")).toBeNull();
    // o atalho do ponto é a etiqueta dele, no topo
    await usuario.click(screen.getByRole("button", { name: "2 comprovantes para conferir" }));
    expect(ir).toHaveBeenCalledWith("gastos");
    expect(filtroLido()).toEqual({ status: "a_revisar" });
  });

  it("escondida não busca; ao voltar, relê só se algo mudou", async () => {
    const rede = criarRede({ "POST /srv/auth/renovar": renovarOk, "GET /srv/api/obras/o1/hoje": () => json(HOJE) });
    const buscas = () => rede.chamadas.filter((c) => c.caminho.endsWith("/hoje")).length;
    let escreveu = () => {};
    const Espia = () => {
      const { mudou } = useCasca();
      escreveu = mudou;
      return null;
    };
    const tela = (visivel: boolean) => (
      <ProvedorCasca usuario={USUARIO} demo={false}>
        <Espia />
        <HojeNaObra obra={OBRA} alternativa={null} visivel={visivel} />
      </ProvedorCasca>
    );
    const { rerender } = render(tela(false));
    await act(async () => {});
    expect(buscas()).toBe(0);

    rerender(tela(true));
    await screen.findByText("O aço chega quinta.");
    expect(buscas()).toBe(1);

    rerender(tela(false));
    await act(async () => escreveu());
    await act(async () => escreveu());
    expect(buscas()).toBe(1);

    rerender(tela(true));
    await vi.waitFor(() => expect(buscas()).toBe(2));

    rerender(tela(false));
    rerender(tela(true));
    await act(async () => {});
    expect(buscas()).toBe(2);
  });

  it("quem só lê não recebe cobrança", async () => {
    const VIEWER = { ...USUARIO, papel: "viewer" as const };
    criarRede({ "POST /srv/auth/renovar": renovarOk, "GET /srv/api/obras/o1/hoje": () => json({ ...HOJE, pontos: [{ ...HOJE.pontos[0]!, detalhe: "Falta você confirmar." }] }) });
    render(
      <ProvedorCasca usuario={VIEWER} demo={false}>
        <HojeNaObra obra={OBRA} alternativa={null} />
      </ProvedorCasca>,
    );
    const titulo = await screen.findByText(/A obra está no prazo/);
    expect(titulo).toHaveTextContent("A obra está no prazo.");
    expect(titulo).not.toHaveTextContent("esperando");
    expect(screen.getByText("2 comprovantes para conferir.")).toBeInTheDocument();
    expect(screen.queryByText("Falta você confirmar.")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Nada aguardando aprovação" }));
    expect(screen.getByRole("heading", { name: /Aguardando aprovação/ })).toBeInTheDocument();
  });

  it("tela que a web não conhece fica sem botão", async () => {
    montar(() => json(HOJE));
    await screen.findByText("Tela nova.");
    expect(screen.queryByRole("button", { name: "Abrir" })).toBeNull();
  });

  it("sem nada para hoje, diz isso", async () => {
    montar(() => json({ ...HOJE, pontos: [], mais: 0, semana: [] }));
    expect(await screen.findByText("Nada pedindo você hoje.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Nada esperando você" }));
    expect(screen.getByText("Nenhuma proposta para aprovar.")).toBeInTheDocument();
  });

  it("API sem a rota ainda: cai na conversa vazia, sem erro", async () => {
    montar(() => json({ detail: "Not Found" }, 404));
    expect(await screen.findByText("conversa vazia")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("erro de verdade aparece", async () => {
    montar(() => json({ detail: "O servidor não respondeu." }, 502));
    expect(await screen.findByRole("alert")).toHaveTextContent("O servidor não respondeu.");
  });

  it("esperando você: cartões desta obra, até 3, e o caminho para o resto", async () => {
    montar(() => json(HOJE), [proposta("a"), proposta("b"), proposta("c"), proposta("d"), proposta("x", "outra")]);
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole("button", { name: "4 aprovações" }));
    await screen.findByRole("heading", { name: "4 aprovações" });
    await usuario.click(await screen.findByRole("button", { name: "Ver as outras 1 em Aprovações" }));
    expect(ir).toHaveBeenCalledWith("aprovacoes");
    expect(screen.getByRole("heading", { name: "4 aprovações" })).toBeInTheDocument();
  });
});

describe("datas e saudação", () => {
  it("no fuso da obra", () => {
    expect(saudacao(new Date("2026-11-09T12:00:00Z"))).toBe("Bom dia."); // 9 h em São Paulo
    expect(saudacao(new Date("2026-11-09T18:00:00Z"))).toBe("Boa tarde.");
    expect(saudacao(new Date("2026-11-10T01:00:00Z"))).toBe("Boa noite."); // 22 h do dia 9
    expect(diaPorExtenso("2026-11-09")).toBe("Segunda, 09/11");
    expect(diaCurto("2026-11-12")).toBe("qui 12");
  });

  it("a frase ganha o que está esperando, e a semana só com cronograma", () => {
    const r = { situacao: "no_prazo" as const, frase: "A obra está no prazo.", esperando: 2 };
    expect(fraseDoDia(r)).toBe("A obra está no prazo, com 2 coisas esperando você.");
    expect(fraseDoDia({ ...r, esperando: 1 })).toBe("A obra está no prazo, com 1 coisa esperando você.");
    expect(fraseDoDia({ ...r, esperando: 0 })).toBe("A obra está no prazo.");
    expect(linhaDoDia("2026-11-09", { ...r, semana_atual: 2, semanas_total: 20 })).toBe("Segunda, 09/11 · semana 2 de 20");
    expect(linhaDoDia("2026-11-09", { ...r, semana_atual: null, semanas_total: 20 })).toBe("Segunda, 09/11");
  });
});
