import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Obra, TributosObra } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, USUARIO, type Rota } from "@/testes/rede";
import { ProvedorCasca } from "../contexto";
import { Tributos } from "../Tributos";
import { dadosFiscaisDe, fmtCno, formFiscalDe, validarFiscal } from "./rotulos";

const OBRA = { id: "o1", tenant_id: "t-1", nome: "Casa Inventada", status: "em_andamento", cno: "", vau: 0 } as Obra;

const PENDENTE = { id: "g1", valor: 1_000_000, data_pagamento: "2026-11-04", favorecido: "Empreiteiro Exemplo", descricao: "alvenaria", natureza_fiscal: null };
const SEM_NOTA = { ...PENDENTE, id: "g2", valor: 500_000, descricao: "reboco", natureza_fiscal: "mao_de_obra_sem_nf" as const };

const TRIBUTOS: TributosObra = {
  obra_id: "o1",
  cno: "900123456789",
  vau_referencia: "2026-10",
  vau_usado: 271744,
  vau_fonte: "tabela_sero",
  destinacao: "residencial_unifamiliar",
  inss: {
    situacao: "calculado",
    motivos: [],
    area_equivalente: 160_000,
    custo_obra: 32_000_000,
    rmt: 5_120_000,
    fator_social: 4000,
    comprovado: 0,
    comprovado_por_natureza: {},
    base: 5_120_000,
    inss: 1_884_160,
    economia_com_notas: 73_600,
    mao_de_obra_sem_nf: 500_000,
    linhas: ["custo da obra = VAU R$ 2.000,00/m² × 160 m² = R$ 320.000,00", "INSS estimado = R$ 51.200,00 × 36,8% = R$ 18.841,60"],
  },
  ibs_cbs: {
    situacao: "nao_incide",
    motivos: ["Obra para uso próprio não é venda nem prestação de serviço: não há IBS/CBS sobre ela."],
    aliquota_efetiva: 0,
    valor_operacao: 0,
    redutor_ajuste: 0,
    redutor_social: 0,
    base: 0,
    debito: 0,
    creditos: 0,
    a_pagar: 0,
    transicao: "2026 é ano de teste.",
    linhas: [],
  },
  a_classificar: 1,
  valor_a_classificar: 1_000_000,
  sem_nota: [SEM_NOTA],
  pendentes: [PENDENTE],
  parametros: { inss: { abatimento: { mao_de_obra_nf: 4000, folha: 10000 }, fonte: "IN" }, ibs_cbs: {} },
  aviso: "Estimativa: confira com o contador antes de pagar ou declarar.",
};

function rede(extra: Record<string, Rota> = {}) {
  return criarRede({
    "POST /srv/auth/renovar": renovarOk,
    "GET /srv/api/obras/o1/tributos": () => json(TRIBUTOS),
    ...extra,
  });
}

const montar = (papel: "admin" | "viewer" = "admin", obra = OBRA) =>
  render(
    <ProvedorCasca usuario={{ ...USUARIO, papel }} demo={false}>
      <Tributos obra={obra} />
    </ProvedorCasca>,
  );

afterEach(() => {
  limparSessao();
  vi.unstubAllGlobals();
});

describe("Tributos", () => {
  it("mostra o INSS estimado com a conta da API, o quanto a nota reduziria e o aviso de estimativa", async () => {
    rede();
    montar();
    const inss = await screen.findByRole("region", { name: "INSS da obra" });
    expect(within(inss).getAllByText("R$ 18.841,60").length).toBeGreaterThan(0);
    expect(within(inss).getByRole("status")).toHaveTextContent("o INSS cairia R$ 736,00");
    expect(within(inss).getByRole("list", { name: "Conta do INSS" }).children).toHaveLength(2);
    expect(screen.getByRole("note")).toHaveTextContent("confira com o contador");
    expect(screen.getByText("CNO 90.012.34567/89")).toBeInTheDocument();
    const ibs = screen.getByRole("region", { name: "IBS/CBS" });
    expect(within(ibs).getByText("não incide")).toBeInTheDocument();
    expect(within(ibs).getByText(/uso próprio/)).toBeInTheDocument();
  });

  it("o admin classifica um gasto: PATCH com a natureza e o IBS/CBS da nota, e a tela recarrega", async () => {
    const r = rede({ "PATCH /srv/api/gastos/g1/fiscal": () => json({ id: "g1", registro_id: "r1" }) });
    montar();
    const lista = await screen.findByRole("region", { name: "Gastos a classificar" });
    await userEvent.click(within(lista).getByRole("button", { name: "Classificar alvenaria, R$ 10.000,00" }));
    const caixa = screen.getByRole("dialog");
    await userEvent.selectOptions(within(caixa).getByLabelText("O que foi pago"), "mao_de_obra_nf");
    expect(within(caixa).getByText(/Reduz a mão de obra presumida em 40% do valor/)).toBeInTheDocument();
    await userEvent.type(within(caixa).getByLabelText("IBS/CBS destacado na nota (R$)"), "150,00");
    // nota de mão de obra: pede o CNO da obra e a retenção
    await userEvent.click(within(caixa).getByRole("checkbox", { name: "A nota traz o CNO e o endereço da obra" }));
    await userEvent.type(within(caixa).getByLabelText("Retenção de 11% na nota (R$)"), "1.100,00");
    await userEvent.click(within(caixa).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const patch = r.chamadas.find((c) => c.metodo === "PATCH");
    expect(patch?.caminho).toBe("/srv/api/gastos/g1/fiscal");
    expect(patch?.corpo).toEqual({ natureza_fiscal: "mao_de_obra_nf", ibs_cbs: 15000, nf_cno: true, retencao: 110000 });
    await waitFor(() => expect(r.chamadas.filter((c) => c.caminho.endsWith("/tributos"))).toHaveLength(2));
  });

  it("o erro da API aparece no modal e nada fecha", async () => {
    rede({ "PATCH /srv/api/gastos/g2/fiscal": () => json({ detail: "Este gasto foi desfeito: não dá para classificar." }, 409) });
    montar();
    const lista = await screen.findByRole("region", { name: "Mão de obra sem comprovação" });
    await userEvent.click(within(lista).getByRole("button", { name: /Classificar reboco/ }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Salvar" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("Este gasto foi desfeito");
  });

  it("o viewer vê tudo, sem Classificar, e os dados fiscais só na conferência", async () => {
    const r = rede();
    montar("viewer");
    await screen.findByRole("region", { name: "Gastos a classificar" });
    expect(screen.queryByRole("button", { name: /^Classificar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cadastrar dados fiscais" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Dados fiscais" }));
    const caixa = screen.getByRole("dialog");
    expect(within(caixa).getByText("Confira antes de salvar")).toBeInTheDocument();
    expect(within(caixa).queryByRole("list", { name: "Passos dos dados fiscais" })).not.toBeInTheDocument();
    expect(within(caixa).queryByRole("button", { name: /^Alterar/ })).not.toBeInTheDocument();
    expect(within(caixa).queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();
    expect(r.chamadas.some((c) => c.metodo === "PATCH")).toBe(false);
  });

  it("sem dados, diz o que falta e o formulário grava só o que mudou", async () => {
    const semDados = { ...TRIBUTOS, inss: { ...TRIBUTOS.inss, situacao: "sem_dados" as const, motivos: ["Falta informar o VAU do mês."], linhas: [] } };
    const r = rede({
      "GET /srv/api/obras/o1/tributos": () => json(semDados),
      "PATCH /srv/api/obras/o1": () => json({ ...OBRA, registro_id: "r2" }),
    });
    montar();
    const inss = await screen.findByRole("region", { name: "INSS da obra" });
    expect(within(inss).getByText("Falta informar o VAU do mês.")).toBeInTheDocument();
    await userEvent.click(within(inss).getByRole("button", { name: "Preencher dados fiscais" }));
    const caixa = screen.getByRole("dialog");
    const continuar = () => userEvent.click(within(caixa).getByRole("button", { name: "Continuar" }));
    // passo 1: o dono; CNO errado segura no passo
    await userEvent.click(within(caixa).getByRole("radio", { name: "Pessoa física" }));
    expect(within(caixa).getByText(/fator social pela área/)).toBeInTheDocument();
    expect(within(caixa).getByRole("radio", { name: "Sim, todo mês" })).toBeInTheDocument();
    await userEvent.type(within(caixa).getByLabelText("CNO (opcional)"), "123");
    await continuar();
    expect(within(caixa).getByText(/O CNO tem 12 números/)).toBeInTheDocument();
    await userEvent.clear(within(caixa).getByLabelText("CNO (opcional)"));
    await continuar();
    // passo 2: a obra (nada obrigatório) → passo 3: o VAU
    expect(within(caixa).getByText("O que está sendo construído")).toBeInTheDocument();
    await continuar();
    // o VAU é automático (tabela da Receita); à mão só escolhendo
    expect(within(caixa).getByRole("radio", { name: "Tabela da Receita (automático)" })).toHaveAttribute("aria-checked", "true");
    expect(within(caixa).queryByLabelText("VAU (R$ por m²)")).not.toBeInTheDocument();
    await userEvent.click(within(caixa).getByRole("radio", { name: "Informar outro valor" }));
    await userEvent.type(within(caixa).getByLabelText("VAU (R$ por m²)"), "2.150,00");
    await userEvent.type(within(caixa).getByLabelText("Mês do VAU"), "10/2026");
    await continuar();
    // passo 4: venda pede terreno e unidades; uso próprio não
    await userEvent.click(within(caixa).getByRole("radio", { name: "Venda do imóvel" }));
    expect(within(caixa).getByLabelText("Valor do terreno (R$)")).toBeInTheDocument();
    await userEvent.click(within(caixa).getByRole("radio", { name: "Uso próprio" }));
    expect(within(caixa).queryByLabelText("Valor do terreno (R$)")).not.toBeInTheDocument();
    await continuar();
    // conferência: Alterar volta ao passo, Voltar anda para trás
    expect(within(caixa).getByText("R$ 2.150,00/m²")).toBeInTheDocument();
    await userEvent.click(within(caixa).getByRole("button", { name: "Alterar: O valor do m² da Receita" }));
    expect(within(caixa).getByLabelText("VAU (R$ por m²)")).toHaveValue("2.150,00");
    await continuar();
    await continuar();
    expect(r.chamadas.some((c) => c.metodo === "PATCH")).toBe(false);
    await userEvent.click(within(caixa).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(r.chamadas.some((c) => c.metodo === "PATCH")).toBe(true));
    expect(r.chamadas.find((c) => c.metodo === "PATCH")!.corpo).toEqual({
      proprietario: "pf",
      vau: 215000,
      vau_referencia: "2026-10",
      finalidade: "uso_proprio",
    });
  });

  it("diz de onde veio o VAU, e o formulário sem VAU à mão fica na tabela e não manda VAU", async () => {
    const r = rede({ "PATCH /srv/api/obras/o1": () => json({ ...OBRA, registro_id: "r3" }) });
    montar();
    const inss = await screen.findByRole("region", { name: "INSS da obra" });
    expect(within(inss).getByText(/VAU R\$ 2\.717,44\/m² de 10\/2026, da tabela da Receita/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar dados fiscais" }));
    const caixa = screen.getByRole("dialog");
    await userEvent.click(within(caixa).getByRole("radio", { name: "Empresa (PJ)" }));
    for (let i = 0; i < 3; i++) await userEvent.click(within(caixa).getByRole("button", { name: "Continuar" }));
    await userEvent.click(within(caixa).getByRole("radio", { name: "Empreitada" }));
    await userEvent.click(within(caixa).getByRole("button", { name: "Continuar" }));
    expect(within(caixa).getByText("Tabela da Receita (automático)")).toBeInTheDocument();
    await userEvent.click(within(caixa).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(r.chamadas.some((c) => c.metodo === "PATCH")).toBe(true));
    expect(r.chamadas.find((c) => c.metodo === "PATCH")!.corpo).toEqual({ proprietario: "pj", finalidade: "prestacao_servico" });
  });

  it("o admin vê Cadastrar em destaque com dados faltando, e Editar quando estão completos", async () => {
    rede();
    const { unmount } = montar();
    expect(await screen.findByRole("button", { name: "Cadastrar dados fiscais" })).toHaveClass("amb");
    unmount();
    montar("admin", { ...OBRA, proprietario: "pf", finalidade: "uso_proprio" } as Obra);
    expect(await screen.findByRole("button", { name: "Editar dados fiscais" })).toHaveClass("amb");
  });

  it("a API de antes, sem a rota, vira uma mensagem para a pessoa", async () => {
    rede({ "GET /srv/api/obras/o1/tributos": () => json({ detail: "Not Found" }, 404) });
    montar();
    expect(await screen.findByRole("alert")).toHaveTextContent("A aba Tributos ainda não está disponível");
  });
});

describe("formulário fiscal", () => {
  it("mostra o caminho do fator de ajuste e os avisos do INSS", async () => {
    const falta = { ...TRIBUTOS.inss, fator_ajuste: "nao_atingido" as const, fator_ajuste_minimo: 5000, falta_fator_ajuste: 348_000, avisos: ["Nota sem o CNO da obra."] };
    rede({ "GET /srv/api/obras/o1/tributos": () => json({ ...TRIBUTOS, inss: falta }) });
    montar();
    const inss = await screen.findByRole("region", { name: "INSS da obra" });
    expect(within(inss).getByText(/Declarando mais/)).toHaveTextContent("Declarando mais R$ 3.480,00 de remuneração");
    expect(within(inss).getByText(/chega a 50%/)).toBeInTheDocument();
    expect(within(inss).getByRole("list", { name: "Avisos do INSS" })).toHaveTextContent("Nota sem o CNO da obra.");
    expect(screen.getByText("Falta declarar para zerar")).toBeInTheDocument();
  });

  it("com o fator de ajuste aplicado, mostra quanto seria sem ele", async () => {
    const zero = { ...TRIBUTOS.inss, inss: 0, inss_sem_fator_ajuste: 524_652, fator_ajuste: "aplicado" as const, fator_ajuste_minimo: 5000, economia_com_notas: 0 };
    rede({ "GET /srv/api/obras/o1/tributos": () => json({ ...TRIBUTOS, inss: zero }) });
    montar();
    const inss = await screen.findByRole("region", { name: "INSS da obra" });
    expect(within(inss).getByText(/Fator de ajuste aplicado/).parentElement).toHaveTextContent("seriam R$ 5.246,52");
  });

  it("valida, formata o CNO e manda só o que mudou", () => {
    expect(fmtCno("900123456789")).toBe("90.012.34567/89");
    const obra = { ...OBRA, cno: "900123456789", proprietario: "pf", area_complementar: 20_000 } as Obra;
    const f = formFiscalDe(obra);
    expect(f.cno).toBe("90.012.34567/89");
    expect(f.area_complementar).toBe("20");
    expect(dadosFiscaisDe(f, obra)).toEqual({});
    expect(dadosFiscaisDe({ ...f, proprietario: "pj", unidades: "2" }, obra)).toEqual({ proprietario: "pj", unidades: 2 });
    expect(dadosFiscaisDe({ ...f, cno: "" }, obra)).toEqual({ cno: "" });
    expect(dadosFiscaisDe({ ...f, categoria: "reforma", dctfweb: "sim" }, obra)).toEqual({ categoria: "reforma", dctfweb_em_dia: true });
    expect(formFiscalDe({ ...obra, dctfweb_em_dia: false }).dctfweb).toBe("nao");
    const e = validarFiscal({ ...f, cno: "123", vau: "abc", vau_referencia: "13/2026", unidades: "x" });
    expect(Object.entries(e).filter(([, v]) => v).map(([k]) => k).sort()).toEqual(["cno", "unidades", "vau", "vau_referencia"]);
  });
});
