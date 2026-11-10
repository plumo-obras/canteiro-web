import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import type { Proposta, Usuario } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, USUARIO } from "@/testes/rede";
import { CartaoProposta, efeitoDe, notaDaEntrega, rotuloAprovar } from "./CartaoProposta";
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

  it("Recusar fica à vista ao lado do Aprovar, pede o motivo num modal e manda para a API", async () => {
    const rede = criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "POST /srv/api/propostas/p1/recusar": ({ corpo }) =>
        json({ ...PROPOSTA, status: "recusada", decidido_por: "u-1", decidido_em: "2026-10-30T13:40:00Z", motivo_recusa: (corpo as { motivo: string }).motivo }),
    });
    montar();
    const recusar = screen.getByRole("button", { name: "Recusar…" });
    // secundário: sem o dourado do Aprovar
    expect(recusar).not.toHaveClass("amb");
    await userEvent.click(screen.getByRole("button", { name: "Mais ações" }));
    expect(screen.queryByRole("menuitem", { name: "Recusar…" })).toBeNull();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(recusar);
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
    expect(screen.queryByRole("button", { name: /Recusar/ })).toBeNull();
    expect(screen.getByText("Espera um admin aprovar")).toBeInTheDocument();
  });
});

describe("o botão diz o que aprovar faz", () => {
  const ENTREGA: Proposta = {
    ...PROPOSTA,
    id: "p2",
    tipo: "registrar_entrega",
    titulo: "PED-0170: dar entrada de 7 m³ de Brita 1 (NF 4410, R$ 910,00)",
    conta: "PED-0170 · Brita 1: recebido 18 m³ + esta entrega 7 m³ = 25 de 25 m³ · pedido completo",
    dados: { pedido_id: "ped-170", linhas: [{ indice: 0, quantidade: 7000 }], nf_numero: "4410", nf_data: "2026-11-05", nf_valor: 91000 },
    efeito: "entrada",
  };
  const avanco = (dados: Record<string, unknown>, efeito?: Proposta["efeito"]): Proposta => ({ ...PROPOSTA, tipo: "avancar_pedido", dados, efeito });

  it("compra pelo valor; entrada só com entrega de verdade; encerramento pelo nome", () => {
    expect(rotuloAprovar(PROPOSTA)).toBe("Aprovar R$ 1.326,00");
    expect(rotuloAprovar(ENTREGA)).toBe("Aprovar entrada");
    // o caso do teste com o agente: "conferido" num pedido parcial encerra, não dá entrada
    expect(rotuloAprovar(avanco({ pedido_id: "x", para: "conferido" }, "encerramento"))).toBe("Aprovar encerramento");
    expect(rotuloAprovar(avanco({ pedido_id: "x", para: "conferido" }, "entrada"))).toBe("Aprovar entrada");
    expect(rotuloAprovar(avanco({ pedido_id: "x", para: "cancelado" }, "cancelamento"))).toBe("Aprovar cancelamento");
    expect(rotuloAprovar(avanco({ pedido_id: "x", para: "enviado" }, "status"))).toBe("Aprovar");
    expect(rotuloAprovar({ ...PROPOSTA, tipo: "ajuste_estoque", dados: { insumo_id: "i", quantidade: -2000, motivo: "x" } })).toBe("Aprovar ajuste");
  });

  it("proposta antiga sem `efeito`: entrada só se trouxer quantidade ou NF; senão não promete nada", () => {
    expect(efeitoDe(avanco({ pedido_id: "x", para: "conferido", quantidade_recebida: 7000 }))).toBe("entrada");
    expect(efeitoDe(avanco({ pedido_id: "x", para: "conferido", nf: "4410" }))).toBe("entrada");
    expect(rotuloAprovar(avanco({ pedido_id: "x", para: "conferido" }))).toBe("Aprovar");
  });

  it("a nota da entrega aparece para conferir", () => {
    expect(notaDaEntrega(ENTREGA)).toBe("NF 4410 · 05/11/2026 · R$ 910,00");
    expect(notaDaEntrega({ ...ENTREGA, dados: { pedido_id: "x", linhas: [] } })).toBe("Sem nota fiscal informada");
    expect(notaDaEntrega(PROPOSTA)).toBeNull();
  });

  it("cartão de entrega: conta da API, nota, 'Aprovar entrada' e sem 'Ajustar' (ainda sem formulário)", async () => {
    criarRede({});
    render(
      <ProvedorCasca usuario={USUARIO} demo={false}>
        <Semente p={ENTREGA} />
      </ProvedorCasca>,
    );
    const linha = screen.getByRole("group", { name: /dar entrada de 7 m³ de Brita 1/ });
    expect(within(linha).getByText(/recebido 18 m³ \+ esta entrega 7 m³ = 25 de 25 m³/)).toBeInTheDocument();
    expect(within(linha).getByText("NF 4410 · 05/11/2026 · R$ 910,00")).toBeInTheDocument();
    expect(within(linha).getByRole("button", { name: "Aprovar entrada" })).toBeInTheDocument();
    // sem ajuste, o "⋯" ficaria com nada dentro: some, e Recusar continua à vista
    expect(within(linha).queryByRole("button", { name: "Mais ações" })).toBeNull();
    expect(within(linha).getByRole("button", { name: "Recusar…" })).toBeInTheDocument();
  });

  it("encerramento não oferece ajuste (não há quantidade nem NF para mudar)", async () => {
    criarRede({});
    render(
      <ProvedorCasca usuario={USUARIO} demo={false}>
        <Semente p={{ ...avanco({ pedido_id: "x", para: "conferido" }, "encerramento"), titulo: "PED-0170: encerrar sem esperar o resto" }} />
      </ProvedorCasca>,
    );
    expect(screen.getByRole("button", { name: "Aprovar encerramento" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mais ações" })).toBeNull();
    expect(screen.getByRole("button", { name: "Recusar…" })).toBeInTheDocument();
  });
});
