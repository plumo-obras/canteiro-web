import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HojeNaObra, Obra, Papel, Proposta } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { USUARIO } from "@/testes/rede";
import { ProvedorCasca, useCasca } from "../contexto";
import type { AbaAtiva } from "../sessoes";
import { partirTitulo, PedeVoce } from "./PedeVoce";

const OBRA = { id: "o1", nome: "Casa Inventada" } as Obra;
const HOJE: HojeNaObra = {
  hoje: "2026-11-09",
  resumo: { situacao: "sem_medicao", frase: "A obra ainda não tem medição.", esperando: 1 },
  pontos: [
    { tipo: "gastos_a_conferir", prioridade: "pede_voce", titulo: "2 comprovantes para conferir.", detalhe: "R$ 1.022,00 pelo que já foi lido. Falta você confirmar.", acao: { tela: "gastos", rotulo: "Conferir", filtro: { status: "a_revisar" } } },
    { tipo: "etapas_estouradas", prioridade: "atencao", titulo: "Fundação passou do orçado em R$ 2.670,00.", detalhe: "Comprometido R$ 44.670,00 de R$ 42.000,00 orçados.", acao: { tela: "orcamento", rotulo: "Ver o orçamento", filtro: null } },
    { tipo: "gastos_sem_etapa", prioridade: "atencao", titulo: "1 gasto sem etapa.", detalhe: "R$ 380,00 contam na obra e em nenhuma etapa até você definir.", acao: { tela: "gastos", rotulo: "Definir a etapa", filtro: { status: "a_definir" } } },
    { tipo: "inicio_etapa", prioridade: "a_caminho", titulo: "A Alvenaria começa segunda.", detalhe: "Pelo cronograma.", acao: { tela: "cronograma", rotulo: "Ver o cronograma", filtro: null } },
  ],
  mais: 0,
  semana: [],
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
  ({ id, obra_id, tipo: "cronograma", status: "pendente", resumo: `Cronograma ${id}`, dados: { inicio: "2027-03", etapas: [] }, criado_em: "2026-11-09T10:00:00Z", conta: null }) as unknown as Proposta;

type Props = Partial<Parameters<typeof PedeVoce>[0]> & { propostas?: Proposta[]; usuario?: Omit<typeof USUARIO, "papel"> & { papel: Papel } };
const montar = ({ propostas, usuario = USUARIO, ...p }: Props = {}) =>
  render(
    <ProvedorCasca usuario={usuario} demo={false}>
      <CascaFalsa propostas={propostas} />
      <PedeVoce obra={OBRA} hoje={HOJE} erro={null} carregando={false} comDinheiro {...p} />
    </ProvedorCasca>,
  );
/** "2 · Comprovantes para conferir · Conferir", uma linha por pendência. */
const linhas = () =>
  within(screen.getByRole("region", { name: /Pede você|Pendências/ }))
    .getAllByRole("listitem")
    .map((li) => [li.querySelector("span")!.textContent, li.querySelector("b")!.textContent!.trim(), li.querySelector("button")?.textContent ?? null].join(" · "));

beforeEach(() => {
  limparSessao();
  ir.mockClear();
});
afterEach(() => limparSessao());

describe("Pede você", () => {
  it("uma linha por pendência (número · coisa · verbo); o estouro fica para o quadro Dinheiro e o que está a caminho sai", () => {
    montar();
    expect(linhas()).toEqual(["2 · 2 Comprovantes para conferir · Conferir", "1 · 1 Gasto sem etapa · Definir a etapa", "1 · 1 Planta da Hidráulica · Enviar"]);
    expect(screen.getByLabelText("3 pendências")).toBeInTheDocument();
    // o detalhe vem só na primeira frase: a cobrança fica na tela do ponto
    expect(screen.getByText("R$ 1.022,00 pelo que já foi lido.")).toBeInTheDocument();
  });

  it("sem o quadro Dinheiro (obra sem orçamento), o estouro aparece aqui", () => {
    montar({ comDinheiro: false });
    expect(linhas()[1]).toBe(" · Fundação passou do orçado em R$ 2.670,00 · Ver o orçamento");
  });

  it("o verbo leva à tela com o filtro, e só o primeiro é ocre", async () => {
    montar();
    const botoes = within(screen.getByRole("list")).getAllByRole("button");
    expect(botoes.map((b) => b.classList.contains("amb"))).toEqual([true, false, false]);
    await userEvent.setup().click(screen.getByRole("button", { name: "Definir a etapa" }));
    expect(ir).toHaveBeenCalledWith("gastos");
    expect(filtroLido()).toEqual({ status: "a_definir" });
  });

  it("com Montando a obra à vista: 'sem orçamento' já é o passo, e o ocre fica com ele", () => {
    const semOrcamento = { tipo: "sem_orcamento", prioridade: "pede_voce" as const, titulo: "A obra ainda não tem orçamento.", detalhe: "Envie as pranchas.", acao: { tela: "projeto", rotulo: "Enviar as pranchas", filtro: null } };
    montar({ hoje: { ...HOJE, pontos: [semOrcamento, HOJE.pontos[2]!] }, comDinheiro: false, montando: true });
    expect(screen.queryByText("A obra ainda não tem orçamento")).toBeNull();
    expect(within(screen.getByRole("list")).getAllByRole("button").some((b) => b.classList.contains("amb"))).toBe(false);
  });

  it("quem só lê vê as pendências, sem cobrança e sem ação ocre", () => {
    const hoje = { ...HOJE, pontos: [{ ...HOJE.pontos[0]!, detalhe: "Falta você confirmar." }] };
    montar({ hoje, usuario: { ...USUARIO, papel: "viewer" as const } });
    expect(screen.getByRole("heading", { name: "Pendências" })).toBeInTheDocument();
    expect(screen.queryByText("Falta você confirmar.")).toBeNull();
    expect(within(screen.getByRole("list")).getAllByRole("button").some((b) => b.classList.contains("amb"))).toBe(false);
    expect(screen.getByRole("button", { name: "Ver" })).toBeInTheDocument();
  });

  it("tela que a web não conhece fica sem botão", () => {
    montar({ hoje: { ...HOJE, pontos: [{ tipo: "novo", prioridade: "pede_voce", titulo: "Tela nova.", detalhe: "", acao: { tela: "tela-do-futuro", rotulo: "Abrir", filtro: null } }] } });
    expect(linhas()[0]).toBe(" · Tela nova · ");
    expect(screen.queryByRole("button", { name: "Abrir" })).toBeNull();
  });

  it("acima de 4 linhas, o resto vira 'e mais'", () => {
    const ponto = (i: number) => ({ ...HOJE.pontos[2]!, tipo: `t${i}` });
    montar({ hoje: { ...HOJE, pontos: [1, 2, 3, 4, 5].map(ponto), mais: 2 } });
    expect(linhas()).toHaveLength(4);
    expect(screen.getByText("e mais 4 pontos")).toBeInTheDocument();
    expect(screen.getByLabelText("8 pendências")).toBeInTheDocument();
  });

  it("aprovações: a primeira linha, e o Ver abre a gaveta com os cartões (até 3) e o caminho para o resto", async () => {
    montar({ propostas: [proposta("a"), proposta("b"), proposta("c"), proposta("d"), proposta("x", "outra")] });
    expect(linhas()[0]).toBe("4 · 4 Aprovações · Ver");
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Ver" }));
    expect(screen.getByRole("heading", { name: "4 aprovações" })).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Ver as outras 1 em Aprovações" }));
    expect(ir).toHaveBeenCalledWith("aprovacoes");
    await usuario.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("heading", { name: "4 aprovações" })).toBeNull();
  });

  it("API sem GET /hoje: fica com as aprovações e não afirma 'nada pendente'", () => {
    montar({ hoje: null });
    expect(screen.getByText("O resumo do dia ainda não está disponível neste servidor.")).toBeInTheDocument();
    expect(screen.queryByText("Nada pendente")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("carregando e erro de verdade", () => {
    const { unmount } = montar({ hoje: null, carregando: true });
    expect(screen.getByText("Olhando a obra…")).toHaveAttribute("role", "status");
    unmount();
    montar({ hoje: null, erro: "O servidor não respondeu." });
    expect(screen.getByRole("alert")).toHaveTextContent("O servidor não respondeu.");
  });
});

describe("partirTitulo", () => {
  it("o número da frase vira a caixa da linha", () => {
    expect(partirTitulo("2 comprovantes para conferir.")).toEqual({ n: 2, texto: "Comprovantes para conferir" });
    expect(partirTitulo("A obra ainda não tem orçamento.")).toEqual({ n: null, texto: "A obra ainda não tem orçamento" });
  });
});
