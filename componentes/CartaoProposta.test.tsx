import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import type { Proposta, Usuario } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, USUARIO } from "@/testes/rede";
import { CartaoProposta, rotuloAprovar } from "./CartaoProposta";
import { ProvedorCasca, useCasca } from "./contexto";

const PROPOSTA: Proposta = {
  id: "p1",
  tenant_id: "t-1",
  criado_em: "2026-10-30T13:00:00Z",
  obra_id: "o1",
  tipo: "cronograma",
  titulo: "Cronograma da obra: 12 etapas de mar/2027 a fev/2028",
  conta: "12 meses · fundação em mar/2027, acabamento até fev/2028",
  fonte: "orçamento",
  dados: { inicio: "2027-03", etapas: [] },
  efeito: "cronograma",
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
    const linha = screen.getByRole("group", { name: /Cronograma da obra/ });
    expect(within(linha).getByText("Pede você")).toBeInTheDocument();
    await userEvent.click(within(linha).getByRole("button", { name: "Aprovar cronograma" }));

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
      "POST /srv/api/propostas/p1/aprovar": () => json({ detail: "O orçamento mudou depois desta proposta; peça outra." }, 409),
    });
    montar();
    await userEvent.click(screen.getByRole("button", { name: /Aprovar/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("O orçamento mudou");
    expect(screen.getByRole("button", { name: /Aprovar/ })).toBeEnabled();
  });

  it("Recusar fica à vista ao lado do Aprovar, pede o motivo num modal e manda para a API", async () => {
    const rede = criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "POST /srv/api/propostas/p1/recusar": ({ corpo }) =>
        json({ ...PROPOSTA, status: "recusada", decidido_por: "u-1", decidido_em: "2026-10-30T13:40:00Z", motivo_recusa: (corpo as { motivo: string }).motivo }),
    });
    montar();
    const recusar = screen.getByRole("button", { name: "Recusar…" });
    // secundário: sem o dourado do Aprovar; sem nada para ajustar, não há "⋯"
    expect(recusar).not.toHaveClass("amb");
    expect(screen.queryByRole("button", { name: "Mais ações" })).toBeNull();
    await userEvent.click(recusar);
    const dlg = screen.getByRole("dialog", { name: "Recusar a proposta" });
    expect(within(dlg).getByLabelText("Motivo")).toHaveFocus();

    await userEvent.click(within(dlg).getByRole("button", { name: "Recusar proposta" }));
    expect(within(dlg).getByRole("alert")).toHaveTextContent("Diga o motivo");
    expect(rede.chamadas.some((c) => c.caminho.endsWith("/recusar"))).toBe(false);

    await userEvent.type(within(dlg).getByLabelText("Motivo"), "a fundação só começa em abril");
    await userEvent.click(within(dlg).getByRole("button", { name: "Recusar proposta" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(/Recusado 10:40 por Rizzi · a fundação só começa em abril/)).toBeInTheDocument();
    expect(rede.chamadas.find((c) => c.caminho.endsWith("/recusar"))!.corpo).toEqual({ motivo: "a fundação só começa em abril" });
  });

  it("papel de leitura vê a proposta mas não tem botão de aprovar", () => {
    criarRede({});
    montar({ ...USUARIO, papel: "viewer" });
    expect(screen.queryByRole("button", { name: /Aprovar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Recusar/ })).toBeNull();
    expect(screen.getByText("Espera um admin aprovar")).toBeInTheDocument();
  });
});

describe("o botão diz o que aprovar faz", () => {
  it("cronograma pelo nome; proposta de outro tipo (antiga) não promete nada", () => {
    expect(rotuloAprovar(PROPOSTA)).toBe("Aprovar cronograma");
    expect(rotuloAprovar({ ...PROPOSTA, efeito: null })).toBe("Aprovar cronograma");
    expect(rotuloAprovar({ ...PROPOSTA, tipo: "criar_pedido" as Proposta["tipo"], efeito: null })).toBe("Aprovar");
  });
});
