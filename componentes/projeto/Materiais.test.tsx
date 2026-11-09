import { render, screen, within } from "@testing-library/react";
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

// O estrutura devolve uma prévia de versão; a tela só lê `aplicado` e `registro_id`.
const estruturaAplicada = ({ corpo }: { corpo: unknown }) =>
  json({ aplicado: (corpo as { aplicar: boolean }).aplicar, tipo: "contrato", registro_id: "rv1", versao_id: "v1", total: 147381, n_itens: 2, erros: [] });

const montar = (usuario: Usuario = USUARIO) =>
  render(
    <ProvedorCasca usuario={usuario} demo={false}>
      <Materiais obra={OBRA} ids={["f1", "f2"]} />
    </ProvedorCasca>,
  );

beforeEach(() => {
  limparSessao();
  localStorage.clear();
});
afterEach(() => {
  limparSessao();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("Materiais do projeto", () => {
  it("mostra cada material com o insumo do SINAPI, o ajuste da bitola e o que fica para o fornecedor", async () => {
    const rede = criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/tradutor/projetos/materiais": () => json(MATERIAIS),
      "POST /srv/api/obras/o-1/orcamento/estrutura": estruturaAplicada,
    });
    montar();
    const lista = await screen.findByRole("list", { name: "Materiais do projeto" });
    expect(rede.chamadas.find((c) => c.caminho.endsWith("/materiais"))!.url.searchParams.get("uf")).toBe("MG");
    expect(screen.getByText(/SINAPI 09\/2026/)).toBeInTheDocument();
    const aco = within(lista).getByText("Aço CA-50 Ø 10,0 mm").closest("li")!;
    expect(aco).toHaveTextContent("SINAPI 34");
    expect(aco).toHaveTextContent("NBR 7480");
    expect(within(lista).getByText("EPS B8/30/125").closest("li")).toHaveTextContent("Sem item avulso no SINAPI");
    expect(within(lista).getByText("Vigotas pré-moldadas (2 tipos)").closest("li")).toHaveTextContent("a confirmar");
    // não há mais botão de compras: o material vai para o Orçamento, não para a obra
    expect(screen.queryByRole("button", { name: /para Compras/ })).toBeNull();
  });

  it("ao entender os materiais, lança a Estrutura no orçamento sozinho (só o que tem quantidade) e avisa", async () => {
    const rede = criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/tradutor/projetos/materiais": () => json(MATERIAIS),
      "POST /srv/api/obras/o-1/orcamento/estrutura": estruturaAplicada,
    });
    montar();
    // aplicou a Estrutura sozinho, com aplicar=true e só os materiais com quantidade (a vigota sem quantidade fica de fora)
    expect(await screen.findByText(/no Orçamento \(etapa «Estrutura»\)/)).toBeInTheDocument();
    const chamada = rede.chamadas.find((c) => c.caminho.endsWith("/orcamento/estrutura"))!;
    expect(chamada.corpo).toMatchObject({ aplicar: true });
    expect((chamada.corpo as { itens: { nome: string }[] }).itens.map((i) => i.nome)).toEqual([
      "Aço CA-50 Ø 10,0 mm (SINAPI 34)",
      "EPS B8/30/125",
    ]);
    // escrita com Desfazer
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeInTheDocument();
  });

  it("viewer vê os materiais, mas não lança nada no orçamento", async () => {
    const rede = criarRede({ "POST /srv/auth/renovar": renovarOk, "GET /srv/tradutor/projetos/materiais": () => json(MATERIAIS) });
    montar({ ...USUARIO, papel: "viewer" });
    await screen.findByRole("list", { name: "Materiais do projeto" });
    expect(screen.queryByRole("button", { name: /para Compras/ })).toBeNull();
    expect(rede.chamadas.some((c) => c.caminho.endsWith("/orcamento/estrutura"))).toBe(false);
  });

  it("erro do tradutor aparece em linguagem de gente", async () => {
    criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/tradutor/projetos/materiais": () => json({ detail: "O tradutor de pranchas não respondeu." }, 502),
    });
    montar();
    expect(await screen.findByRole("alert")).toHaveTextContent("O tradutor de pranchas não respondeu.");
  });
});
