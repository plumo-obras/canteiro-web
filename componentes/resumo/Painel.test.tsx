import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { Obra, ResumoDaObra } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, USUARIO } from "@/testes/rede";
import { ProvedorCasca } from "../contexto";
import { Painel } from "./Painel";

const OBRA = { id: "o1", tenant_id: "t-1", nome: "Casa Exemplo", status: "em_andamento" } as Obra;
const RESUMO = {
  obra: OBRA,
  financeiro: { tem_orcamento: true, orcado_atual: 60_000_00, comprometido: 59_720_00, realizado: 59_720_00, saldo: 280_00, falta_gastar: 280_00 },
  cronograma: { cadastrado: true, termino_contratual: "2027-07", termino_projetado: null, atraso_decimos: null },
} as ResumoDaObra;
const etapa = (etapa: string, descricao: string, atual: number, realizado: number) => ({
  etapa, descricao, atual, realizado, comprometido: realizado, cotando: 0, saldo: atual - realizado, estourou: realizado > atual, contratado: atual, aditivos: 0,
});
const mes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7);

afterEach(() => {
  limparSessao();
  vi.unstubAllGlobals();
});

describe("painel do Resumo", () => {
  it("mostra os números da obra, as etapas andando (a que passou primeiro) e o que vem no cronograma", async () => {
    criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/api/obras/o1/orcamento": () =>
        json({ versoes: [], itens: [], totais: {}, etapas: [etapa("1", "Preliminares", 18_000_00, 15_050_00), etapa("2", "Fundação", 42_000_00, 44_670_00), etapa("3", "Pintura", 10_000_00, 0)] }),
      "GET /srv/api/obras/o1/cronograma": () =>
        json({ inicio: mes, meses: 3, etapas: [{ etapa: "1", descricao: "Preliminares", atual: 0, percentuais: [10000, 0, 0], medido_acumulado: 0 }, { etapa: "3", descricao: "Pintura", atual: 0, percentuais: [0, 0, 10000], medido_acumulado: 0 }], mensal: [], medicoes: [], prazo: {} }),
      "GET /srv/api/obras/o1/desembolso": () => json({ meses: [], totais: {} }),
      "GET /srv/api/obras/o1/gastos": () => json([]),
    });
    render(
      <ProvedorCasca usuario={USUARIO} demo semPedidos>
        <Painel obra={OBRA} resumo={RESUMO} />
      </ProvedorCasca>,
    );
    const numeros = await screen.findByLabelText("Como está a obra");
    expect(numeros).toHaveTextContent("Mês 1 de 3");
    expect(numeros).toHaveTextContent("2 de 3 com gasto");
    expect(numeros).toHaveTextContent("1 passou do orçado");
    const etapas = within(await screen.findByRole("region", { name: "Etapas em andamento" })).getAllByRole("listitem");
    expect(etapas.map((li) => li.textContent)).toEqual([expect.stringContaining("Fundação"), expect.stringContaining("Preliminares")]);
    const proximas = screen.getByRole("region", { name: "O que vem no cronograma" });
    expect(proximas).toHaveTextContent("Preliminarestermina este mês");
    expect(proximas).toHaveTextContent("Pintura");
    expect(screen.getByRole("region", { name: "Últimos gastos" })).toHaveTextContent("Nenhum gasto lançado ainda.");
  });

  it("obra sem orçamento não tem painel (a linha do tempo já diz para começar pelo projeto)", () => {
    criarRede({ "POST /srv/auth/renovar": renovarOk });
    render(
      <ProvedorCasca usuario={USUARIO} demo={false}>
        <Painel obra={OBRA} resumo={{ ...RESUMO, financeiro: { ...RESUMO.financeiro, tem_orcamento: false } }} />
      </ProvedorCasca>,
    );
    expect(screen.queryByLabelText("Como está a obra")).toBeNull();
  });
});
