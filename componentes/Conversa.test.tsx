import { afterEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useReducer } from "react";
import type { Obra } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, sse, USUARIO } from "@/testes/rede";
import { ProvedorCasca } from "./contexto";
import { Conversa } from "./Conversa";
import { novaSessao, redutorSessoes } from "./sessoes";

const OBRA: Obra = { id: "o1", tenant_id: "t-1", criado_em: "", nome: "Casa Vila Nova", cidade: "", cep: "", verba: 0, status: "em_andamento" };
const PROPOSTA = {
  id: "p1", tenant_id: "t-1", criado_em: "2026-10-30T13:00:00Z", obra_id: "o1", tipo: "criar_pedido",
  titulo: "Comprar 640 un de bloco", conta: "precisa 3.400 un − saldo 2.760 un = falta 640 un", fonte: "almoxarifado",
  dados: { insumo_id: "i1", quantidade: 640000, fornecedor: "Cerâmica", valor: 204800 }, sugerido_por: "agente",
  status: "pendente", decidido_por: null, decidido_em: null, motivo_recusa: null,
};
const ev = (evento: string, dados: unknown) => `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;

function Harness() {
  const [ss, despachar] = useReducer(redutorSessoes, [novaSessao("o1")]);
  return (
    <ProvedorCasca usuario={USUARIO} demo={false}>
      <Conversa sessao={ss[0]!} obra={OBRA} despachar={despachar} />
      <output data-testid="sessao-servidor">{ss[0]!.servidorId ?? ""}</output>
    </ProvedorCasca>
  );
}

afterEach(() => limparSessao());

describe("conversa por SSE", () => {
  it("mostra ferramenta, texto em streaming e o cartão de proposta; aprovar executa só pelo clique", async () => {
    const corpoSSE =
      ev("ferramenta", { nome: "consultar_estoque", nivel: "consulta", resumo: "usou almoxarifado · Casa Vila Nova" }) +
      ev("texto", { delta: "O bloco: **falta " }) +
      ev("texto", { delta: "640 un**." }) +
      ev("ferramenta", { nome: "propor_pedido", nivel: "propoe", resumo: "preparou uma compra" }) +
      ev("proposta", PROPOSTA) +
      ev("fim", { sessao_id: "srv-1", uso: { tokens: 120, custo: 9 } });
    const rede = criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "POST /srv/agente/conversa": () => sse(corpoSSE, 5),
      "POST /srv/api/propostas/p1/aprovar": () =>
        json({ proposta: { ...PROPOSTA, status: "aprovada", decidido_por: "u-1", decidido_por_nome: "Rizzi", decidido_em: "2026-10-30T13:32:00Z" }, registro: { id: "r1" } }),
    });
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("Pergunte ao agente"), "precisa comprar bloco?{Enter}");

    const log = screen.getByRole("log");
    expect(await within(log).findByText("usou almoxarifado · Casa Vila Nova")).toBeInTheDocument();
    expect(await within(log).findByText("falta 640 un", { selector: "b" })).toBeInTheDocument();
    expect(within(log).getByText("precisa comprar bloco?")).toBeInTheDocument();
    expect(await screen.findByTestId("sessao-servidor")).toHaveTextContent("srv-1");

    const pedido = rede.chamadas.find((c) => c.caminho === "/srv/agente/conversa")!;
    // a sessão nasce na web com um UUIDv7: o mesmo ID na lateral, no agente e na API
    expect(pedido.corpo).toMatchObject({ obra_id: "o1", texto: "precisa comprar bloco?" });
    expect((pedido.corpo as { sessao_id: string }).sessao_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    expect(new Headers(pedido.init.headers).get("authorization")).toBe("Bearer acesso-1");
    // o agente propôs, mas nada foi aprovado sozinho
    expect(rede.chamadas.some((c) => c.caminho.endsWith("/aprovar"))).toBe(false);

    const cartao = within(log).getByRole("group", { name: /Comprar 640 un de bloco/ });
    await userEvent.click(within(cartao).getByRole("button", { name: "Aprovar R$ 2.048,00" }));
    expect(await within(cartao).findByText("Aprovado 10:32 por Rizzi")).toBeInTheDocument();
    expect(within(cartao).getByRole("button", { name: "Desfazer" })).toBeInTheDocument();
  });

  it("o 2º turno leva o sessao_id devolvido no fim", async () => {
    const rede = criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "POST /srv/agente/conversa": () => sse(ev("texto", { delta: "ok" }) + ev("fim", { sessao_id: "srv-9", uso: { tokens: 1, custo: 0 } })),
    });
    render(<Harness />);
    const campo = screen.getByLabelText("Pergunte ao agente");
    await userEvent.type(campo, "um{Enter}");
    await screen.findByText("ok");
    await screen.findByTestId("sessao-servidor").then((el) => expect(el).toHaveTextContent("srv-9"));
    await userEvent.type(campo, "dois{Enter}");
    await screen.findAllByText("ok");
    const turnos = rede.chamadas.filter((c) => c.caminho === "/srv/agente/conversa");
    expect(turnos[1]!.corpo).toMatchObject({ sessao_id: "srv-9", texto: "dois" });
  });

  it("evento erro (sem créditos) e HTTP 402 aparecem como alerta no balão", async () => {
    let vez = 0;
    criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "POST /srv/agente/conversa": () =>
        ++vez === 1 ? sse(ev("erro", { mensagem: "Sem créditos de IA neste mês." })) : json({ mensagem: "Créditos esgotados." }, 402),
    });
    render(<Harness />);
    const campo = screen.getByLabelText("Pergunte ao agente");
    await userEvent.type(campo, "oi{Enter}");
    expect(await screen.findByText("Sem créditos de IA neste mês.")).toHaveAttribute("role", "alert");
    await userEvent.type(campo, "de novo{Enter}");
    expect(await screen.findByText("Créditos esgotados.")).toBeInTheDocument();
  });
});
