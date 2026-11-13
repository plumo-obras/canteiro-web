import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Cronograma as DadosCronograma, Obra } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, USUARIO } from "@/testes/rede";
import { ProvedorCasca } from "../contexto";
import { Cronograma } from "./Cronograma";

const OBRA = { id: "o1", nome: "Casa Fictícia", status: "em_andamento", prazo_meses: 3 } as Obra;

// orçamento com etapas e ainda sem cronograma: o vazio oferece o Gerar com IA
const SEM_CRONOGRAMA = {
  inicio: null,
  meses: 0,
  etapas: [{ etapa: "1", descricao: "Fundações", atual: 300_00, percentuais: [], medido_acumulado: 0 }],
  mensal: [],
  medicoes: [],
  prazo: null,
} as unknown as DadosCronograma;

afterEach(() => {
  limparSessao();
  vi.unstubAllGlobals();
});

describe("cronograma: Gerar com IA", () => {
  it("só pede a proposta: não reorganiza o orçamento aprovado", async () => {
    const { chamadas } = criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/api/obras/o1/cronograma": () => json(SEM_CRONOGRAMA),
    });
    render(
      <ProvedorCasca usuario={USUARIO} demo={false}>
        <Cronograma obra={OBRA} />
      </ProvedorCasca>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Gerar com IA" }));
    // a conversa com o agente não está simulada: a geração falha, e o que importa é o que NÃO foi chamado
    await vi.waitFor(() => expect(chamadas.some((c) => c.caminho === "/srv/agente/conversa")).toBe(true));
    expect(chamadas.some((c) => c.caminho.endsWith("/orcamento/organizar-fases"))).toBe(false);
  });
});
