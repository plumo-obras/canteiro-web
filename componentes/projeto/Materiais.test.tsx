import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Obra, Usuario } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import type { MateriaisProjeto } from "@/lib/tradutor";
import { criarRede, json, renovarOk, USUARIO } from "@/testes/rede";
import { ProvedorCasca } from "../contexto";
import { Materiais } from "./Materiais";

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

const PREVIA = {
  aplicado: false,
  linhas: [
    { linhas: [1], nome: "Aço CA-50 Ø 10,0 mm (SINAPI 34)", unidade: "kg", quantidade: 220300, valor_unitario: 669, total: 147381, curva: "A", saldo: 0,
      situacao: "atualiza", precisa_antes: 100000, valor_antes: 650 },
    { linhas: [2], nome: "EPS B8/30/125", unidade: "un", quantidade: 382000, valor_unitario: 0, total: 0, curva: "C", saldo: 0,
      situacao: "novo", precisa_antes: null, valor_antes: null },
  ],
  ignoradas: [],
  erros: [],
  total: 147381,
  novos: 1,
  atualizados: 1,
  juntadas: 0,
};

const PREVIA_ESTR = {
  aplicado: false,
  tipo: "contrato" as const,
  itens: [
    { ordem: 0, tipo: "etapa" as const, numero: "1", nivel: 1, etapa: "1", codigo: "", fonte: "", descricao: "Estrutura", unidade: "", quantidade: 0, valor_unitario: 0, total: 0, linha: 1 },
    { ordem: 1, tipo: "item" as const, numero: "1.1", nivel: 2, etapa: "1", codigo: "", fonte: "", descricao: "Aço CA-50 Ø 10,0 mm (SINAPI 34)", unidade: "kg", quantidade: 220300, valor_unitario: 669, total: 147381, linha: 2 },
    { ordem: 2, tipo: "item" as const, numero: "1.2", nivel: 2, etapa: "1", codigo: "", fonte: "", descricao: "EPS B8/30/125", unidade: "un", quantidade: 382000, valor_unitario: 0, total: 0, linha: 3 },
  ],
  ignoradas: [],
  erros: [],
  avisos: [],
  total: 147381,
  n_itens: 2,
  n_etapas: 1,
  etapas: [{ etapa: "1", descricao: "Estrutura", total: 147381 }],
  substitui: null,
  versao_id: null,
  registro_id: null,
};

const montar = (usuario: Usuario = USUARIO) =>
  render(
    <ProvedorCasca usuario={usuario} demo={false}>
      <Materiais obra={OBRA} ids={["f1", "f2"]} />
    </ProvedorCasca>,
  );

beforeEach(() => limparSessao());
afterEach(() => {
  limparSessao();
  vi.unstubAllGlobals();
});

describe("Materiais do projeto", () => {
  it("mostra cada material com o insumo do SINAPI, o ajuste da bitola e o que fica para o fornecedor", async () => {
    const rede = criarRede({ "POST /srv/auth/renovar": renovarOk, "GET /srv/tradutor/projetos/materiais": () => json(MATERIAIS) });
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

  it("leva para Compras pela prévia: manda o nome com o código, em milésimos, sem a vigota sem quantidade", async () => {
    const rede = criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/tradutor/projetos/materiais": () => json(MATERIAIS),
      "POST /srv/api/obras/o-1/orcamento/materiais": ({ corpo }) =>
        json((corpo as { aplicar: boolean }).aplicar ? { ...PREVIA, aplicado: true, registro_ids: ["r1"] } : PREVIA),
    });
    const u = userEvent.setup();
    montar();
    await u.click(await screen.findByRole("button", { name: "Levar 2 materiais para Compras" }));

    const dialogo = await screen.findByRole("dialog", { name: "Lançar os materiais do projeto na obra?" });
    const previa = rede.chamadas.find((c) => c.caminho.endsWith("/orcamento/materiais"))!;
    expect(previa.corpo).toEqual({
      origem: "projeto estrutural",
      aplicar: false,
      itens: [
        { nome: "Aço CA-50 Ø 10,0 mm (SINAPI 34)", unidade: "kg", quantidade: 220300, valor_unitario: 669 },
        { nome: "EPS B8/30/125", unidade: "un", quantidade: 382000, valor_unitario: 0 },
      ],
    });
    expect(within(dialogo).getByText("atualiza")).toBeInTheDocument();
    expect(dialogo).toHaveTextContent("antes 100");
    // o valor total de referência aparece no diálogo
    expect(within(dialogo).getByText("Valor total de referência")).toBeInTheDocument();

    await u.click(within(dialogo).getByRole("button", { name: "Lançar 2 materiais na obra" }));
    expect(await screen.findByText("2 materiais do projeto lançados na obra. O que falta comprar está em Compras.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeInTheDocument();
    expect(rede.chamadas.filter((c) => c.caminho.endsWith("/orcamento/materiais")).at(-1)!.corpo).toMatchObject({ aplicar: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("viewer vê os materiais, mas não leva para Compras", async () => {
    criarRede({ "POST /srv/auth/renovar": renovarOk, "GET /srv/tradutor/projetos/materiais": () => json(MATERIAIS) });
    montar({ ...USUARIO, papel: "viewer" });
    await screen.findByRole("list", { name: "Materiais do projeto" });
    expect(screen.queryByRole("button", { name: /para Compras/ })).not.toBeInTheDocument();
  });

  it("erro do tradutor aparece em linguagem de gente", async () => {
    criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/tradutor/projetos/materiais": () => json({ detail: "O tradutor de pranchas não respondeu." }, 502),
    });
    montar();
    expect(await screen.findByRole("alert")).toHaveTextContent("O tradutor de pranchas não respondeu.");
  });

  it("lança a estrutura do projeto como versão do orçamento (contrato): manda o projeto inteiro e avisa em Orçamento", async () => {
    const rede = criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/tradutor/projetos/materiais": () => json(MATERIAIS),
      "POST /srv/api/obras/o-1/orcamento/estrutura": ({ corpo }) =>
        json((corpo as { aplicar: boolean }).aplicar ? { ...PREVIA_ESTR, aplicado: true, versao_id: "v1", registro_id: "rv1" } : PREVIA_ESTR),
    });
    const u = userEvent.setup();
    montar();

    await u.click(await screen.findByRole("button", { name: "Lançar no orçamento (Estrutura)" }));
    const dialogo = await screen.findByRole("dialog", { name: "Lançar a estrutura do projeto no orçamento?" });
    const previa = rede.chamadas.find((c) => c.caminho.endsWith("/orcamento/estrutura"))!;
    expect(previa.corpo).toEqual({
      aplicar: false,
      itens: [
        { nome: "Aço CA-50 Ø 10,0 mm (SINAPI 34)", unidade: "kg", quantidade: 220300, valor_unitario: 669 },
        { nome: "EPS B8/30/125", unidade: "un", quantidade: 382000, valor_unitario: 0 },
      ],
    });
    expect(dialogo).toHaveTextContent("contrato");
    expect(within(dialogo).getByText("Estrutura")).toBeInTheDocument();

    await u.click(within(dialogo).getByRole("button", { name: "Lançar como contrato" }));
    expect(await screen.findByText(/Estrutura do projeto lançada como contrato do orçamento/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeInTheDocument();
    const aplicou = rede.chamadas.filter((c) => c.caminho.endsWith("/orcamento/estrutura")).at(-1)!.corpo as { aplicar: boolean; chave_idempotencia?: string };
    expect(aplicou.aplicar).toBe(true);
    expect(typeof aplicou.chave_idempotencia).toBe("string");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("avisa o que já existe na obra e, por padrão, não duplica (só manda os novos)", async () => {
    const rede = criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/tradutor/projetos/materiais": () => json(MATERIAIS),
      // a obra já tem o mesmo aço, com nome humano
      "GET /srv/api/obras/o-1/insumos": () => json([{ insumo: { id: "x1", nome: "Aço CA-50 10 mm", unidade: "kg" }, conta: {} }]),
      "POST /srv/api/obras/o-1/orcamento/materiais": () => json(PREVIA),
    });
    const u = userEvent.setup();
    montar();

    const aco = (await screen.findByText("Aço CA-50 Ø 10,0 mm")).closest("li")!;
    expect(aco).toHaveTextContent("Já na obra como «Aço CA-50 10 mm»");
    // o EPS (que não existe na obra) continua enviável; o aço fica de fora
    await u.click(await screen.findByRole("button", { name: "Levar 1 material para Compras" }));
    const corpo = rede.chamadas.find((c) => c.caminho.endsWith("/orcamento/materiais"))!.corpo as { itens: { nome: string }[] };
    expect(corpo.itens.map((i) => i.nome)).toEqual(["EPS B8/30/125"]);
    expect(corpo.itens.some((i) => i.nome.startsWith("Aço"))).toBe(false);
  });

});
