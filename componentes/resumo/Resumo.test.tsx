import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HojeNaObra, Obra, ResumoDaObra } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, USUARIO } from "@/testes/rede";
import { ProvedorCasca } from "../contexto";
import { vereditoDinheiro, vereditoPrazo } from "./Quadros";
import { Resumo } from "./Resumo";

const OBRA = { id: "o1", tenant_id: "t-1", nome: "Casa Exemplo", status: "em_andamento", verba: 75_000_00 } as Obra;
const RESUMO = {
  obra: OBRA,
  financeiro: { tem_orcamento: true, orcado_atual: 70_000_00, comprometido: 59_720_00, realizado: 59_720_00, saldo: 10_280_00, falta_gastar: 10_280_00, realizado_pct: 8531, etapas_estouradas: [{}] },
  cronograma: { cadastrado: true, termino_contratual: "2027-07", termino_projetado: null, atraso_decimos: null },
} as ResumoDaObra;
const etapa = (etapa: string, descricao: string, atual: number, realizado: number) => ({
  etapa, descricao, atual, realizado, comprometido: realizado, cotando: 0, saldo: atual - realizado, estourou: realizado > atual, contratado: atual, aditivos: 0,
});
const mes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7);
const HOJE: HojeNaObra = {
  hoje: "2026-11-09",
  resumo: { situacao: "sem_medicao", frase: "A obra ainda não tem medição.", esperando: 1 },
  pontos: [
    { tipo: "gastos_a_conferir", prioridade: "pede_voce", titulo: "2 comprovantes para conferir.", detalhe: "R$ 1.022,00 pelo que já foi lido.", acao: { tela: "gastos", rotulo: "Conferir", filtro: null } },
    { tipo: "etapas_estouradas", prioridade: "atencao", titulo: "Fundação passou do orçado em R$ 2.670,00.", detalhe: "", acao: { tela: "orcamento", rotulo: "Ver o orçamento", filtro: null } },
  ],
  mais: 0,
  semana: [{ data: "2026-11-12", tipo: "entrega", titulo: "Entrega do aço", detalhe: "Ferragem Inventada", acao: null }],
};

const montar = (obra: Obra, resumo: ResumoDaObra) => {
  criarRede({
    "POST /srv/auth/renovar": renovarOk,
    "GET /srv/api/obras/o1/hoje": () => json(HOJE),
    "GET /srv/api/obras/o1/orcamento": () =>
      json({ versoes: [], itens: [], totais: {}, etapas: [etapa("1", "Preliminares", 18_000_00, 15_050_00), etapa("2", "Fundação", 42_000_00, 44_670_00), etapa("3", "Pintura", 10_000_00, 0)] }),
    "GET /srv/api/obras/o1/cronograma": () =>
      json({ inicio: mes, meses: 3, etapas: [{ etapa: "1", descricao: "Preliminares", atual: 0, percentuais: [10000, 0, 0], medido_acumulado: 0 }, { etapa: "3", descricao: "Pintura", atual: 0, percentuais: [0, 0, 10000], medido_acumulado: 0 }], mensal: [], medicoes: [], prazo: {} }),
    "GET /srv/api/obras/o1/desembolso": () => json({ mes_atual: mes, meses: [{ mes, pago: 59_720_00, previsto: 50_000_00, projetado: 0, projetado_no_ritmo: 0 }], totais: {} }),
    "GET /srv/api/obras/o1/gastos": () => json([]),
  });
  return render(
    <ProvedorCasca usuario={USUARIO} demo={false}>
      <Resumo obra={obra} resumo={resumo} />
    </ProvedorCasca>,
  );
};

afterEach(() => {
  limparSessao();
  vi.unstubAllGlobals();
});

describe("Resumo da obra rodando", () => {
  it("sem os passos de montagem; os quadros dizem como está, e os blocos o detalhe", async () => {
    montar(OBRA, RESUMO);
    expect(screen.queryByRole("navigation", { name: "Montando a obra" })).toBeNull();
    const dinheiro = await screen.findByRole("region", { name: "Dinheiro" });
    expect(await within(dinheiro).findByText("Fundação passou R$ 2.670")).toBeInTheDocument();
    expect(dinheiro).toHaveTextContent("R$ 59.720gastos até hoje");
    expect(dinheiro).toHaveTextContent("OrçadoR$ 70.000");
    expect(dinheiro).toHaveTextContent("Falta gastarR$ 10.280");
    expect(dinheiro).toHaveTextContent("Valor fechadoR$ 75.000");
    const prazo = screen.getByRole("region", { name: "Prazo" });
    expect(prazo).toHaveTextContent("Sem medição lançada");
    expect(await within(prazo).findByText(/^Mês 1/)).toBeInTheDocument();
    expect(prazo).toHaveTextContent("de 3 do cronograma");
    expect(prazo).toHaveTextContent("Entregajul/2027");
    // o estouro é do quadro Dinheiro: não se repete no Pede você
    expect(within(screen.getByRole("region", { name: "Pede você" })).queryByText(/Fundação/)).toBeNull();

    const etapas = within(await screen.findByRole("region", { name: "Etapas em andamento" })).getAllByRole("listitem");
    expect(etapas.map((li) => li.textContent)).toEqual([expect.stringContaining("Fundação"), expect.stringContaining("Preliminares")]);
    const vem = screen.getByRole("region", { name: "O que vem" });
    expect(vem).toHaveTextContent("qui 12Entrega do aço");
    expect(vem).toHaveTextContent("Preliminarestermina este mês");
    expect(vem).toHaveTextContent("Pintura");
    expect(screen.getByRole("region", { name: "Últimos gastos" })).toHaveTextContent("Nenhum gasto lançado ainda.");
    expect(await screen.findByRole("region", { name: "Dinheiro mês a mês" })).toBeInTheDocument();
  });

  it("cada número da obra aparece uma vez só na página", async () => {
    montar(OBRA, RESUMO);
    await screen.findByText("Fundação passou R$ 2.670");
    await screen.findByRole("region", { name: "Dinheiro mês a mês" });
    // a tabela do gráfico é só para leitor de tela: fica fora da contagem do que se vê
    const visivel = [...document.body.querySelectorAll("body *:not(.sr-only):not(.sr-only *)")]
      .flatMap((el) => [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent))
      .join("|");
    // o estouro aparece de novo só como detalhe da etapa (a barra em "Etapas em andamento"), não como outro aviso
    for (const valor of ["R$ 59.720", "R$ 70.000", "R$ 10.280", "R$ 75.000", "jul/2027", "Fundação passou", "85,3%"]) {
      expect(visivel.split(valor).length - 1, valor).toBe(1);
    }
  });
});

describe("Resumo da obra sendo montada", () => {
  it("sem orçamento: os passos com o próximo a fazer, o Pede você e nada de números", async () => {
    const obra = { ...OBRA, status: "em_orcamento" } as Obra;
    montar(obra, { ...RESUMO, obra, financeiro: { ...RESUMO.financeiro, tem_orcamento: false }, cronograma: { ...RESUMO.cronograma, cadastrado: false } });
    const passos = screen.getByRole("navigation", { name: "Montando a obra" });
    expect(passos).toHaveTextContent("faltam 3 de 3 passos");
    expect(within(passos).getByRole("button", { name: "Enviar as pranchas" })).toHaveClass("amb");
    expect(await screen.findByRole("region", { name: "Pede você" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Dinheiro" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Etapas em andamento" })).toBeNull();
  });
});

describe("vereditos dos quadros", () => {
  it("prazo: só afirma o que foi medido", () => {
    const c = RESUMO.cronograma;
    expect(vereditoPrazo({ ...c, cadastrado: false })).toEqual({ tom: "neutro", texto: "Sem cronograma" });
    expect(vereditoPrazo(c)).toEqual({ tom: "neutro", texto: "Sem medição lançada" });
    expect(vereditoPrazo({ ...c, atraso_decimos: 0 })).toEqual({ tom: "ok", texto: "Em dia" });
    expect(vereditoPrazo({ ...c, atraso_decimos: 14 })).toEqual({ tom: "ruim", texto: "Atrasada 1,4 mês" });
    expect(vereditoPrazo({ ...c, atraso_decimos: 25 })).toEqual({ tom: "ruim", texto: "Atrasada 2,5 meses" });
  });

  it("dinheiro: a etapa que passou, várias, ou dentro do orçado", () => {
    const orc = (estouradas: number) =>
      ({ etapas: Array.from({ length: estouradas }, (_, i) => etapa(String(i), `Etapa ${i}`, 100_00, 150_00)) }) as unknown as Parameters<typeof vereditoDinheiro>[0];
    expect(vereditoDinheiro(orc(1), RESUMO)).toEqual({ tom: "ruim", texto: "Etapa 0 passou R$ 50" });
    expect(vereditoDinheiro(orc(2), RESUMO)).toEqual({ tom: "ruim", texto: "2 etapas passaram do orçado" });
    expect(vereditoDinheiro(orc(0), RESUMO)).toEqual({ tom: "ok", texto: "Dentro do orçado" });
    // o orçamento ainda não chegou: o resumo já sabe quantas passaram
    expect(vereditoDinheiro(null, RESUMO)).toEqual({ tom: "ruim", texto: "1 etapa passou do orçado" });
  });
});
