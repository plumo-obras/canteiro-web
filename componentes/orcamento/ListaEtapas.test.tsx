import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Obra, Orcamento, TopicoOrcamento } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, USUARIO } from "@/testes/rede";
import { ProvedorCasca } from "../contexto";
import { ListaEtapas } from "./ListaEtapas";

const OBRA = { id: "o1", tenant_id: "t-1", nome: "Casa Inventada", status: "em_andamento" } as Obra;
const contas = (atual: number, comprometido: number) => ({
  contratado: atual, aditivos: 0, atual, cotando: 0, comprometido, realizado: comprometido,
  saldo: atual - comprometido, estourou: comprometido > atual,
});
const topico = (id: string, nome: string, atual: number, comprometido: number): TopicoOrcamento => ({
  topico_id: id, nome, origem: "orcamento", ...contas(atual, comprometido),
});
const item = (n: string, descricao: string, total: number, topico_id: string) =>
  ({ id: `i-${n}`, obra_id: "o1", versao_id: "v", ordem: 0, tipo: "item", numero: n, nivel: 2, etapa: "esquadrias", codigo: "",
    fonte: "", descricao, unidade: "un", quantidade: 1000, valor_unitario: total, total, linha: 1, curva: "A", topico_id }) as Orcamento["itens"][number];

// Esquadrias aberta em dois tópicos (as etapas da planilha): o de madeira com dois itens, o metálico com um item só, de
// mesmo nome que o tópico (a EAP de dois níveis).
const ORC: Orcamento = {
  versoes: [],
  itens: [
    item("11.1", "Porta de madeira 0,80", 300_000, "t-mad"),
    item("11.2", "Mão de obra", 100_000, "t-mad"),
    item("12.1", "Esquadria metálica", 200_000, "t-met"),
  ],
  etapas: [{
    etapa: "esquadrias", descricao: "Esquadrias", ...contas(600_000, 150_000),
    topicos: [topico("t-mad", "ESQUADRIA MADEIRA", 400_000, 150_000), topico("t-met", "Esquadria metálica", 200_000, 0)],
  }],
  totais: { ...contas(600_000, 150_000), aditivos_pct: 0, n_itens: 3, n_etapas: 1, sem_etapa: { cotando: 0, comprometido: 0, realizado: 0 } },
} as Orcamento;

beforeEach(() => {
  limparSessao();
  criarRede({ "POST /srv/auth/renovar": renovarOk, "GET /srv/api/obras/o1/pedidos": () => json([]) });
});
afterEach(limparSessao);

describe("Orçamento por tópico", () => {
  it("abre a etapa em tópicos com orçado, comprometido e saldo; o tópico de um item só não repete o nome", async () => {
    render(
      <ProvedorCasca usuario={USUARIO} demo={false}>
        <ListaEtapas obra={OBRA} orc={ORC} nomeVersao={() => "Contrato"} />
      </ProvedorCasca>,
    );
    const madeira = (await screen.findByText("ESQUADRIA MADEIRA")).closest("tr")!;
    // R$ 4.000 orçados, R$ 1.500 comprometidos, R$ 2.500 de saldo (centavos da API, mostrados em reais inteiros)
    expect(within(madeira).getByTitle("R$ 4.000,00")).toBeTruthy();
    expect(within(madeira).getByTitle("R$ 1.500,00")).toBeTruthy();
    expect(within(madeira).getByTitle("R$ 2.500,00")).toBeTruthy();
    expect(screen.getByText(/Porta de madeira 0,80/)).toBeTruthy();
    // o metálico aparece uma vez só: a linha do item leva as contas do tópico
    expect(screen.getAllByText(/Esquadria metálica/i)).toHaveLength(1);
  });
});
