import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ItemPrevia, Obra, PreviaVersao } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, USUARIO, type Rota } from "@/testes/rede";
import { ProvedorCasca } from "../contexto";
import { ImportarOrcamento } from "./ImportarOrcamento";

const EM_ORCAMENTO = { id: "o1", nome: "Galpão Inventado", status: "em_orcamento", verba: 62_000_000 } as Obra;
const APROVADA = { ...EM_ORCAMENTO, status: "em_andamento" } as Obra;

// o orçamento de agora: só o que veio das pranchas
const ORC = {
  versoes: [{ id: "v1", tipo: "contrato", numero: 0, descricao: "Estrutura", arquivo: "Estrutura (projeto).csv", ativa: true, itens: 19, etapas: 1, total: 5_097_741 }],
  itens: [],
  etapas: [],
  totais: {},
};
const LEITURA = {
  planilhas: ["Planilha1"],
  planilha: "Planilha1",
  linha_cabecalho: 1,
  colunas: [
    { indice: 0, titulo: "Item" },
    { indice: 1, titulo: "Descrição" },
    { indice: 2, titulo: "Un" },
    { indice: 3, titulo: "Qtd" },
    { indice: 4, titulo: "Total" },
  ],
  amostra: [["1", "SERVIÇOS PRELIMINARES", "", "", ""]],
  sugestao: { planilha: "Planilha1", linha_cabecalho: 1, item: 0, codigo: null, fonte: null, nome: 1, unidade: 2, quantidade: 3, valor_unitario: null, valor_total: 4, saldo: null, curva: null },
};

const item = (ordem: number, descricao: string, total: number, extra: Partial<ItemPrevia> = {}): ItemPrevia => ({
  ordem, tipo: "item", numero: `2.${ordem}`, nivel: 2, etapa: "2", codigo: "", fonte: "", descricao, unidade: "m³",
  quantidade: 1000, valor_unitario: total, total, linha: ordem + 1, etapa_origem: "planilha", etapa_planilha: "1", ...extra,
});
const LOCACAO = item(1, "Locação da obra", 300_000);
const CONCRETO = item(2, "Concreto fck 25 sapatas", 1_984_000, {
  etapa: "1", numero: "1.20", etapa_origem: "nome",
  repetido_de: { item_id: "it-9", descricao: "Concreto usinado fck 25", quantidade: 32_000, unidade: "m³" },
});

/** A prévia do somar como a API devolve: só os itens que entram, com o total depois de somar. */
function previaSomar(ignorar: number[], aplicado = false): PreviaVersao {
  const itens = [LOCACAO, CONCRETO].filter((i) => !ignorar.includes(i.ordem));
  const total = itens.reduce((t, i) => t + i.total, 0);
  return {
    aplicado, tipo: "contrato", itens, ignoradas: [], erros: [],
    avisos: itens.filter((i) => i.repetido_de).map((i) => ({ linha: i.linha, mensagem: `${i.descricao} parece repetir ${i.repetido_de!.descricao}` })),
    total, n_itens: itens.length, n_etapas: 1,
    etapas: [{ etapa: "2", descricao: "SERVIÇOS PRELIMINARES", total }],
    substitui: { versao_id: "v1", total: 5_097_741, itens: 19 },
    total_apos: 5_097_741 + total,
    versao_id: aplicado ? "v2" : null, registro_id: aplicado ? "r2" : null,
  };
}
const previaTrocar = (): PreviaVersao => ({ ...previaSomar([]), total_apos: null });

const form = (init: RequestInit) => init.body as FormData;
const versoes = (rede: ReturnType<typeof criarRede>) => rede.chamadas.filter((c) => c.caminho === "/srv/api/obras/o1/orcamento/versoes").map((c) => form(c.init));

function montar(obra: Obra, extra: Record<string, Rota> = {}, inicio?: "somar") {
  const rede = criarRede({
    "POST /srv/auth/renovar": renovarOk,
    "GET /srv/api/obras/o1/orcamento": () => json(ORC),
    "GET /srv/api/obras/o1/etapas": () => json([{ etapa: "1", descricao: "Estrutura" }]),
    "POST /srv/api/obras/o1/orcamento/ler": () => json(LEITURA),
    "POST /srv/api/obras/o1/orcamento/versoes": ({ init }) => {
      const f = form(init);
      if (f.get("somar") !== "true") return json(previaTrocar());
      return json(previaSomar(JSON.parse(String(f.get("ignorar_itens") ?? "[]")), f.get("aplicar") === "true"));
    },
    ...extra,
  });
  const fechar = vi.fn();
  render(
    <ProvedorCasca usuario={USUARIO} demo={false}>
      <ImportarOrcamento obra={obra} fechar={fechar} inicio={inicio} />
    </ProvedorCasca>,
  );
  return { rede, fechar };
}

async function ateAPrevia(u: ReturnType<typeof userEvent.setup>) {
  await u.upload(screen.getByLabelText("Arquivo da planilha"), new File(["x"], "planilha.csv", { type: "text/csv" }));
  await u.click(await screen.findByRole("button", { name: "Ver a prévia" }));
}

beforeEach(limparSessao);
afterEach(() => {
  limparSessao();
  vi.unstubAllGlobals();
});

describe("importar antes de aprovar: somar ao orçamento", () => {
  it("não pergunta aditivo ou novo; soma, com o repetido marcado e a caixa 'não importar'", async () => {
    const u = userEvent.setup();
    const { rede, fechar } = montar(EM_ORCAMENTO);
    await u.click(screen.getByRole("radio", { name: /Orçamento da obra/ }));
    expect(await screen.findByText(/somam ao orçamento/)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Aditivo ou novo orçamento inicial" })).toBeNull();
    expect(screen.queryByLabelText("Do que é o aditivo")).toBeNull();
    await u.click(screen.getByRole("button", { name: "Continuar" }));
    await ateAPrevia(u);

    expect(await screen.findByText("1 item parece já estar no orçamento.")).toBeInTheDocument();
    expect(screen.getByText("parece repetir: Concreto usinado fck 25")).toBeInTheDocument();
    expect(screen.getByText("pelo nome, a mesma etapa do orçamento")).toBeInTheDocument();
    expect(screen.queryByText(/troca o orçamento inteiro/)).toBeNull();
    expect(versoes(rede).at(-1)!.get("somar")).toBe("true");
    expect(versoes(rede).at(-1)!.get("tipo")).toBe("contrato");

    // não importar o concreto: a prévia é refeita sem ele, e a linha fica à vista para voltar atrás
    await u.click(screen.getByRole("checkbox", { name: "não importar" }));
    expect(await screen.findByRole("button", { name: "Somar ao orçamento (+R$ 3.000,00)" })).toBeInTheDocument();
    expect(versoes(rede).at(-1)!.get("ignorar_itens")).toBe("[2]");
    expect(screen.getByRole("checkbox", { name: "não importar" })).toBeChecked();
    expect(screen.getByText("fica de fora")).toBeInTheDocument();
    expect(screen.getByText(/1 fica de fora/)).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Somar ao orçamento (+R$ 3.000,00)" }));
    await waitFor(() => expect(fechar).toHaveBeenCalled());
    const gravou = versoes(rede).at(-1)!;
    expect(gravou.get("aplicar")).toBe("true");
    expect(gravou.get("somar")).toBe("true");
    expect(gravou.get("ignorar_itens")).toBe("[2]");
    expect(gravou.get("chave_idempotencia")).toBeTruthy();
    expect(gravou.get("descricao")).toBeNull();
    expect(await screen.findByText("Somado ao orçamento: 1 item, +R$ 3.000,00.")).toBeInTheDocument();
  });

  it("aviso da linha 0 (a etapa das pranchas muda de lugar) fica à vista, sem 'Linha 0'", async () => {
    const u = userEvent.setup();
    const GERAL = "Ao somar, Estrutura (das pranchas) vai para depois de SERVIÇOS PRELIMINARES, e as etapas são renumeradas nessa ordem.";
    montar(EM_ORCAMENTO, {
      "POST /srv/api/obras/o1/orcamento/versoes": () => {
        const p = previaSomar([]);
        return json({ ...p, avisos: [{ linha: 0, mensagem: GERAL }, ...p.avisos] });
      },
    }, "somar");
    await ateAPrevia(u);
    expect(await screen.findByText(GERAL)).toBeInTheDocument();
    expect(screen.queryByText(/Linha 0/)).toBeNull();
    expect(screen.getByText("1 aviso (grava mesmo assim)")).toBeInTheDocument();
  });

  it("no somar que renumera, a prévia mostra os números do orçamento gravado e a escolha manda a chave de antes", async () => {
    const u = userEvent.setup();
    // a Estrutura das pranchas (1) vai para depois dos preliminares da planilha (2): gravadas, viram 2 e 1
    const { rede } = montar(EM_ORCAMENTO, {
      "POST /srv/api/obras/o1/orcamento/versoes": () => json({ ...previaSomar([]), numeracao: { "1": "2", "2": "1" } }),
    }, "somar");
    await ateAPrevia(u);
    const destino = await screen.findByRole("combobox", { name: "Etapa de destino de Locação da obra" });
    const linha = destino.closest("tr")!;
    expect(within(linha).getByText("1.1")).toBeInTheDocument();
    expect(within(destino).getAllByRole("option").map((o) => o.textContent)).toEqual(["1", "2 · Estrutura"]);
    const concreto = screen.getByRole("combobox", { name: "Etapa de destino de Concreto fck 25 sapatas" }).closest("tr")!;
    expect(within(concreto).getByText("2.20")).toBeInTheDocument();
    expect(screen.queryByText("2.1")).toBeNull();

    await u.selectOptions(destino, "2 · Estrutura");
    await waitFor(() => expect(versoes(rede).at(-1)!.get("etapas_itens")).toBe(JSON.stringify({ "1": "1" })));
  });

  it("desmarcar 'não importar' devolve o item à prévia", async () => {
    const u = userEvent.setup();
    const { rede } = montar(EM_ORCAMENTO, {}, "somar");
    await ateAPrevia(u);
    await u.click(await screen.findByRole("checkbox", { name: "não importar" }));
    await screen.findByText("fica de fora");
    await u.click(screen.getByRole("checkbox", { name: "não importar" }));
    expect(await screen.findByRole("button", { name: "Somar ao orçamento (+R$ 22.840,00)" })).toBeInTheDocument();
    expect(versoes(rede).at(-1)!.get("ignorar_itens")).toBeNull();
    expect(screen.queryByText("fica de fora")).toBeNull();
  });

  it("voltar para corrigir as colunas esquece os 'não importar' da prévia anterior (as ordens mudam)", async () => {
    const u = userEvent.setup();
    const { rede } = montar(EM_ORCAMENTO, {}, "somar");
    await ateAPrevia(u);
    await u.click(await screen.findByRole("checkbox", { name: "não importar" }));
    await screen.findByText("fica de fora");
    expect(versoes(rede).at(-1)!.get("ignorar_itens")).toBe("[2]");

    await u.click(screen.getByRole("button", { name: "Corrigir as colunas" }));
    await u.click(await screen.findByRole("button", { name: "Ver a prévia" }));
    expect(await screen.findByRole("button", { name: "Somar ao orçamento (+R$ 22.840,00)" })).toBeInTheDocument();
    expect(versoes(rede).at(-1)!.get("ignorar_itens")).toBeNull();
    expect(versoes(rede).at(-1)!.get("etapas_itens")).toBeNull();
    expect(screen.queryByText("fica de fora")).toBeNull();
  });

  it("vindo do aviso do Orçamento, abre direto no arquivo", async () => {
    montar(EM_ORCAMENTO, {}, "somar");
    expect(screen.getByLabelText("Arquivo da planilha")).toBeInTheDocument();
    expect(await screen.findByText(/somam ao orçamento de agora \(R\$ 50\.977,41\)/)).toBeInTheDocument();
  });

  it("trocar o orçamento inteiro é discreto e só com confirmação dizendo o que se perde", async () => {
    const u = userEvent.setup();
    const { rede } = montar(EM_ORCAMENTO);
    await u.click(screen.getByRole("radio", { name: /Orçamento da obra/ }));
    await u.click(await screen.findByRole("button", { name: "Trocar o orçamento inteiro" }));
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("Trocar o orçamento inteiro?");
    expect(alerta).toHaveTextContent("(R$ 50.977,41, 19 itens), inclusive o que veio das pranchas e os preços editados, sai de vigência");
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();

    // desistir volta ao somar
    await u.click(within(alerta).getByRole("button", { name: "Não, somar" }));
    expect(screen.getByText(/somam ao orçamento/)).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Trocar o orçamento inteiro" }));
    await u.click(within(screen.getByRole("alert")).getByRole("button", { name: "Trocar o orçamento inteiro" }));
    expect(screen.getByText(/troca o orçamento inteiro/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Continuar" }));
    await ateAPrevia(u);

    expect(await screen.findByRole("button", { name: "Trocar o orçamento inteiro" })).toBeInTheDocument();
    expect(versoes(rede).at(-1)!.get("somar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Não, é um aditivo" })).toBeNull();

    // na prévia ainda dá para desistir e somar
    await u.click(screen.getByRole("button", { name: "Não, somar ao orçamento" }));
    expect(await screen.findByRole("button", { name: /Somar ao orçamento/ })).toBeInTheDocument();
    expect(versoes(rede).at(-1)!.get("somar")).toBe("true");
  });
});

describe("importar depois de aprovar", () => {
  it("só o aditivo, sem oferecer o orçamento novo que a API recusa", async () => {
    const u = userEvent.setup();
    const { rede } = montar(APROVADA, {
      "POST /srv/api/obras/o1/orcamento/versoes": () => json({ ...previaSomar([]), tipo: "aditivo", substitui: null, total_apos: null }),
    });
    await u.click(screen.getByRole("radio", { name: /Orçamento da obra/ }));
    expect(await screen.findByText(/Esta planilha entra como aditivo/)).toBeInTheDocument();
    expect(screen.getByText("Para trocar o orçamento inteiro, desfaça antes a aprovação pelo Histórico.")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Aditivo ou novo orçamento inicial" })).toBeNull();
    expect(screen.queryByText(/novo orçamento inicial/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Trocar o orçamento inteiro" })).toBeNull();
    expect(screen.queryByText(/somam ao orçamento/)).toBeNull();

    // os dados do aditivo continuam pedidos antes de seguir
    await u.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("Diga do que é o aditivo, ex.: ampliação do refeitório.")).toBeInTheDocument();
    await u.type(screen.getByLabelText("Do que é o aditivo"), "Ampliação do depósito");
    await u.type(screen.getByLabelText("Data do aditivo"), "2026-11-09");
    await u.click(screen.getByRole("button", { name: "Continuar" }));
    await ateAPrevia(u);
    expect(await screen.findByRole("button", { name: "Importar o aditivo (+R$ 22.840,00)" })).toBeInTheDocument();
    const f = versoes(rede).at(-1)!;
    expect(f.get("tipo")).toBe("aditivo");
    expect(f.get("somar")).toBeNull();
  });
});
