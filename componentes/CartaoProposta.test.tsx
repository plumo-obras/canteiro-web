import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import type { Proposta, Usuario } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, USUARIO } from "@/testes/rede";
import { CartaoProposta } from "./CartaoProposta";
import { ProvedorCasca, useCasca } from "./contexto";

const PROPOSTA: Proposta = {
  id: "p1",
  tenant_id: "t-1",
  criado_em: "2026-10-30T13:00:00Z",
  obra_id: "o1",
  tipo: "criar_pedido",
  titulo: "Comprar 34 sc de cimento · Depósito Ouro Verde",
  conta: "precisa 200 sc − saldo 46 sc − a caminho 120 sc = falta 34 sc → comprar 34 sc",
  fonte: "almoxarifado",
  dados: { insumo_id: "i1", quantidade: 34000, fornecedor: "Depósito Ouro Verde", valor: 132600 },
  sugerido_por: "agente",
  status: "pendente",
  decidido_por: null,
  decidido_em: null,
  motivo_recusa: null,
  decidido_por_nome: null,
};
const APROVADA = { ...PROPOSTA, status: "aprovada" as const, decidido_por: "u-1", decidido_por_nome: "Rizzi", decidido_em: "2026-10-30T13:32:00Z" };

function Semente({ p }: { p: Proposta }) {
  const { receberPropostas } = useCasca();
  useEffect(() => receberPropostas([p]), [p, receberPropostas]);
  return <CartaoProposta id={p.id} />;
}
const montar = (usuario: Usuario = USUARIO) =>
  render(
    <ProvedorCasca usuario={usuario} demo={false}>
      <Semente p={PROPOSTA} />
    </ProvedorCasca>,
  );

beforeEach(() => limparSessao());
afterEach(() => limparSessao());

describe("cartão de proposta", () => {
  it("Aprovar → fica no lugar como 'Aprovado HH:MM por <nome> · Desfazer'; Desfazer volta", async () => {
    const rede = criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "POST /srv/api/propostas/p1/aprovar": () => json({ proposta: APROVADA, registro: { id: "r1", criado_em: APROVADA.decidido_em } }),
      "POST /srv/api/registro/r1/desfazer": () => json({ id: "r2", criado_em: "2026-10-30T13:35:00Z" }),
    });
    montar();
    const linha = screen.getByRole("group", { name: /Comprar 34 sc de cimento/ });
    expect(within(linha).getByText("Pede você")).toBeInTheDocument();
    await userEvent.click(within(linha).getByRole("button", { name: "Aprovar R$ 1.326,00" }));

    expect(await within(linha).findByText("Aprovado 10:32 por Rizzi")).toBeInTheDocument();
    const desfazer = within(linha).getByRole("button", { name: "Desfazer" });
    expect(desfazer).toHaveFocus(); // o botão Aprovar sumiu: o foco não se perde
    expect(within(linha).queryByRole("button", { name: /Aprovar/ })).toBeNull();
    expect(rede.chamadas.filter((c) => c.caminho.endsWith("/aprovar"))).toHaveLength(1);

    await userEvent.click(desfazer);
    expect(await within(linha).findByText("Desfeito 10:35")).toBeInTheDocument();
    expect(rede.chamadas.some((c) => c.metodo === "POST" && c.caminho === "/srv/api/registro/r1/desfazer")).toBe(true);
  });

  it("proposta aprovada vinda do histórico usa proposta.registro_id para o Desfazer", async () => {
    const rede = criarRede({ "POST /srv/auth/renovar": renovarOk, "POST /srv/api/registro/r7/desfazer": () => json({ id: "r8", criado_em: "2026-10-30T13:50:00Z" }) });
    render(
      <ProvedorCasca usuario={USUARIO} demo={false}>
        <Semente p={{ ...APROVADA, registro_id: "r7" }} />
      </ProvedorCasca>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(await screen.findByText("Desfeito 10:50")).toBeInTheDocument();
    expect(rede.chamadas.some((c) => c.caminho === "/srv/api/registro/r7/desfazer")).toBe(true);
  });

  it("aprovada sem registro_id (API antiga) não oferece Desfazer", () => {
    criarRede({});
    render(
      <ProvedorCasca usuario={USUARIO} demo={false}>
        <Semente p={APROVADA} />
      </ProvedorCasca>,
    );
    expect(screen.getByText("Aprovado 10:32 por Rizzi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desfazer" })).toBeNull();
  });

  it("erro da API aparece na linha e o botão volta", async () => {
    criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "POST /srv/api/propostas/p1/aprovar": () => json({ detail: "O pedido não pode ir de 'conferido' para 'aprovado'." }, 422),
    });
    montar();
    await userEvent.click(screen.getByRole("button", { name: /Aprovar/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("O pedido não pode ir");
    expect(screen.getByRole("button", { name: /Aprovar/ })).toBeEnabled();
  });

  it("⋯ Recusar pede o motivo num modal e manda para a API", async () => {
    const rede = criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "POST /srv/api/propostas/p1/recusar": ({ corpo }) =>
        json({ ...PROPOSTA, status: "recusada", decidido_por: "u-1", decidido_em: "2026-10-30T13:40:00Z", motivo_recusa: (corpo as { motivo: string }).motivo }),
    });
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Mais ações" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Recusar…" }));
    const dlg = screen.getByRole("dialog", { name: "Recusar a proposta" });
    expect(within(dlg).getByLabelText("Motivo")).toHaveFocus();

    await userEvent.click(within(dlg).getByRole("button", { name: "Recusar proposta" }));
    expect(within(dlg).getByRole("alert")).toHaveTextContent("Diga o motivo");
    expect(rede.chamadas.some((c) => c.caminho.endsWith("/recusar"))).toBe(false);

    await userEvent.type(within(dlg).getByLabelText("Motivo"), "já comprei no outro");
    await userEvent.click(within(dlg).getByRole("button", { name: "Recusar proposta" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(/Recusado 10:40 por Rizzi · já comprei no outro/)).toBeInTheDocument();
    expect(rede.chamadas.find((c) => c.caminho.endsWith("/recusar"))!.corpo).toEqual({ motivo: "já comprei no outro" });
  });

  it("papel de leitura vê a proposta mas não tem botão de aprovar", () => {
    criarRede({});
    montar({ ...USUARIO, papel: "viewer" });
    expect(screen.queryByRole("button", { name: /Aprovar/ })).toBeNull();
    expect(screen.getByText("Espera um admin aprovar")).toBeInTheDocument();
  });
});
