import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ItemInsumo, Obra, Pedido, Usuario } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, USUARIO, type Rota } from "@/testes/rede";
import { ProvedorCasca, useCasca } from "./contexto";
import { Suprimentos } from "./Suprimentos";
import { faltaPorEtapa } from "./suprimentos/FaltaComprar";

const OBRA = { id: "o1", nome: "Casa Inventada", uf: "MG" } as Obra;
const item = (id: string, nome: string, etapa: string | null, comprar: number, valor_unitario: number): ItemInsumo =>
  ({ insumo: { id, nome, unidade: "m²", etapa, valor_unitario, precisa_ate_o_fim: comprar }, conta: { precisa: comprar, saldo: 0, a_caminho: 0, cotando: 0, transferencia: 0, falta: comprar, comprar } }) as ItemInsumo;
const ITENS = [item("a", "Aço", "2", 100_000, 1000), item("b", "Tapume", "1", 120_000, 6000), item("c", "Locação", "1", 530_000, 800), item("d", "Pago já", "1", 0, 100)];
const ETAPAS = [{ etapa: "1", descricao: "Serviços preliminares" }, { etapa: "2", descricao: "Estrutura" }];
const PEDIDO: Pedido = {
  id: "p1", numero: "PED-0001", obra_id: "o1", fornecedor: "Ferragem Inventada", fornecedor_id: null, previsao: "2026-11-12", observacao: "", status: "aprovado", valor: 50000, recebimentos: 0, criado_em: "2026-11-07T15:00:00Z",
  linhas: [{ insumo_id: "a", nome: "Aço", unidade: "kg", tipo: "material", etapa: "2", quantidade: 50_000, valor_unitario: 1000, total: 50000, recebida: 0, falta_entregar: 50_000 }],
};

function montar(extra: Record<string, Rota> = {}, usuario: Usuario = USUARIO, itens = ITENS) {
  const rede = criarRede({
    "POST /srv/auth/renovar": renovarOk,
    "GET /srv/api/obras/o1/insumos": () => json(itens),
    "GET /srv/api/obras/o1/pedidos": ({ url }) => json(url.searchParams.getAll("status").includes("aprovado") ? [PEDIDO] : []),
    "GET /srv/api/obras/o1/etapas": () => json(ETAPAS),
    "GET /srv/api/fornecedores": () => json([]),
    ...extra,
  });
  render(
    <ProvedorCasca usuario={usuario} demo={false}>
      <Suprimentos obra={OBRA} />
    </ProvedorCasca>,
  );
  return rede;
}

beforeEach(limparSessao);
afterEach(() => {
  limparSessao();
  vi.unstubAllGlobals();
});

describe("faltaPorEtapa", () => {
  it("segue a ordem do orçamento, só com o que a conta manda comprar; sem etapa vem por último", () => {
    const g = faltaPorEtapa([...ITENS, item("e", "Avulso", null, 1000, 100)], ETAPAS);
    expect(g.map((x) => [x.nome, x.itens.map((i) => i.insumo.nome)])).toEqual([
      ["Serviços preliminares", ["Tapume", "Locação"]],
      ["Estrutura", ["Aço"]],
      ["Sem etapa", ["Avulso"]],
    ]);
  });
});

describe("Compras", () => {
  it("marcar soma na barra e o pedido abre com quantidade e preço do orçamento", async () => {
    const rede = montar({ "POST /srv/api/obras/o1/pedidos": ({ corpo }) => json({ ...PEDIDO, numero: "PED-0002", valor: 79200, registro_id: "r1", corpo }, 201) });
    const u = userEvent.setup();
    expect(await screen.findByRole("heading", { name: /Falta comprar · 3 itens do orçamento/ })).toBeInTheDocument();
    expect(screen.queryByText("Pago já")).toBeNull();
    // o pé do cartão fica no lugar: sem nada marcado, o botão espera desligado
    expect(screen.getByRole("button", { name: "Fazer pedido" })).toBeDisabled();

    const grupo = screen.getByRole("group", { name: "Serviços preliminares" });
    await u.click(within(grupo).getByRole("checkbox", { name: /Tapume/ }));
    await u.click(within(grupo).getByRole("checkbox", { name: /Locação/ }));
    expect(screen.getByText("2 itens marcados")).toBeInTheDocument();
    expect(screen.getByText(/R\$\s11\.440,00 pelo orçamento/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Fazer pedido dos 2 itens" }));

    const dialogo = await screen.findByRole("dialog", { name: "Pedido de 2 itens" });
    expect(within(dialogo).getByLabelText("Quantidade de Tapume")).toHaveValue("120");
    expect(within(dialogo).getByLabelText("Preço de Tapume")).toHaveValue("60,00");

    await u.clear(within(dialogo).getByLabelText("Preço de Tapume"));
    await u.type(within(dialogo).getByLabelText("Preço de Tapume"), "55,00");
    expect(within(dialogo).getByText(/R\$\s600,00 abaixo do orçamento/)).toBeInTheDocument();

    await u.click(within(dialogo).getByRole("button", { name: /Registrar pedido de/ }));
    expect(await within(dialogo).findByText("Diga de quem é a compra.")).toBeInTheDocument();
    await u.type(within(dialogo).getByLabelText("Fornecedor"), "Madeireira Inventada");
    await u.click(within(dialogo).getByRole("button", { name: /Registrar pedido de/ }));

    expect(await screen.findByText(/PED-0002: pedido feito/)).toBeInTheDocument();
    expect(rede.chamadas.find((c) => c.metodo === "POST" && c.caminho.endsWith("/pedidos"))!.corpo).toMatchObject({
      fornecedor: "Madeireira Inventada",
      aprovado: true,
      linhas: [
        { insumo_id: "b", quantidade: 120_000, valor_unitario: 5500, etapa: "1" },
        { insumo_id: "c", quantidade: 530_000, valor_unitario: 800, etapa: "1" },
      ],
    });
  });

  it("resposta perdida: fechar, reabrir e reenviar repete a chave; 409 ou sucesso trocam", async () => {
    let n = 0;
    const respostas = [json({ detail: "O servidor não respondeu." }, 502), json({ detail: "Esta chave de idempotência já foi usada para outro pedido." }, 409)];
    const rede = montar({ "POST /srv/api/obras/o1/pedidos": () => respostas[n++] ?? json({ ...PEDIDO, numero: "PED-0005", registro_id: "r1" }, 201) });
    const u = userEvent.setup();
    const enviar = async () => {
      await u.click(screen.getByRole("button", { name: "Fazer pedido do item" }));
      const d = await screen.findByRole("dialog", { name: "Pedido de 1 item" });
      await u.type(within(d).getByLabelText("Fornecedor"), "Madeireira Inventada");
      await u.click(within(d).getByRole("button", { name: /Registrar pedido de/ }));
      return d;
    };
    const chaves = () => rede.chamadas.filter((c) => c.metodo === "POST" && c.caminho.endsWith("/pedidos")).map((c) => (c.corpo as { chave_idempotencia: string }).chave_idempotencia);
    await u.click(await screen.findByRole("checkbox", { name: /Tapume/ }));

    let d = await enviar();
    expect(await within(d).findByText("O servidor não respondeu.")).toBeInTheDocument();
    await u.click(within(d).getByRole("button", { name: "Voltar" }));

    d = await enviar();
    expect(await within(d).findByText(/já foi usada para outro pedido/)).toBeInTheDocument();
    expect(chaves()[1]).toBe(chaves()[0]);
    await u.click(within(d).getByRole("button", { name: "Voltar" }));

    await enviar();
    await screen.findByText(/PED-0005: pedido feito/);
    expect(chaves()[2]).not.toBe(chaves()[0]);
  });

  it("aberta com filtro de etapa, mostra só ela e deixa ver tudo; na próxima visita abre inteira", async () => {
    const Recorte = () => {
      const { registrarNavegacao, irParaTela } = useCasca();
      const [aberta, setAberta] = useState(false);
      useEffect(() => registrarNavegacao(() => setAberta(true)), [registrarNavegacao]);
      return aberta ? (
        <>
          <button type="button" onClick={() => setAberta(false)}>sair</button>
          <Suprimentos obra={OBRA} />
        </>
      ) : (
        <>
          <button type="button" onClick={() => irParaTela("suprimentos", { etapa: "2" })}>com filtro</button>
          <button type="button" onClick={() => setAberta(true)}>pela aba</button>
        </>
      );
    };
    criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/api/obras/o1/insumos": () => json(ITENS),
      "GET /srv/api/obras/o1/pedidos": () => json([]),
      "GET /srv/api/obras/o1/etapas": () => json(ETAPAS),
      "GET /srv/api/fornecedores": () => json([]),
    });
    render(
      <ProvedorCasca usuario={USUARIO} demo={false}>
        <Recorte />
      </ProvedorCasca>,
    );
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "com filtro" }));
    expect(await screen.findByRole("group", { name: "Estrutura" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Serviços preliminares" })).toBeNull();
    await u.click(screen.getByRole("button", { name: "Ver tudo o que falta" }));
    expect(screen.getByRole("group", { name: "Serviços preliminares" })).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "sair" }));
    await u.click(screen.getByRole("button", { name: "pela aba" }));
    expect(await screen.findByRole("group", { name: "Serviços preliminares" })).toBeInTheDocument();
  });

  it("Voltar no pedido mantém as marcações; criado o pedido, elas saem", async () => {
    montar({ "POST /srv/api/obras/o1/pedidos": () => json({ ...PEDIDO, numero: "PED-0004", registro_id: "r1" }, 201) });
    const u = userEvent.setup();
    await u.click(await screen.findByRole("checkbox", { name: /Tapume/ }));
    await u.click(screen.getByRole("button", { name: "Fazer pedido do item" }));
    let dialogo = await screen.findByRole("dialog", { name: "Pedido de 1 item" });
    await u.click(within(dialogo).getByRole("button", { name: "Voltar" }));
    expect(screen.getByRole("checkbox", { name: /Tapume/ })).toBeChecked();

    await u.click(screen.getByRole("button", { name: "Fazer pedido do item" }));
    dialogo = await screen.findByRole("dialog", { name: "Pedido de 1 item" });
    await u.type(within(dialogo).getByLabelText("Fornecedor"), "Madeireira Inventada");
    await u.click(within(dialogo).getByRole("button", { name: /Registrar pedido de/ }));
    await screen.findByText(/PED-0004: pedido feito/);
    await vi.waitFor(() => expect(screen.getByRole("checkbox", { name: /Tapume/ })).not.toBeChecked());
  });

  it("com o Desfazer da aprovação pela metade não oferece marcar nem pedir", async () => {
    criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/api/obras/o1/insumos": () => json(ITENS),
      "GET /srv/api/obras/o1/pedidos": () => json([]),
      "GET /srv/api/obras/o1/etapas": () => json(ETAPAS),
      "GET /srv/api/fornecedores": () => json([]),
    });
    render(
      <ProvedorCasca usuario={USUARIO} demo={false}>
        <Suprimentos obra={{ ...OBRA, status: "desfazendo_aprovacao" }} />
      </ProvedorCasca>,
    );
    const u = userEvent.setup();
    expect(await screen.findByText(/Termine-o no Orçamento/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Item fora do orçamento" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Fazer pedido/ })).toBeNull();
  });

  it("a etapa da linha vem do item e pode ser trocada no pedido", async () => {
    const rede = montar({ "POST /srv/api/obras/o1/pedidos": () => json({ ...PEDIDO, numero: "PED-0003", registro_id: "r1" }, 201) });
    const u = userEvent.setup();
    await u.click(await screen.findByRole("checkbox", { name: /Aço/ }));
    await u.click(screen.getByRole("button", { name: "Fazer pedido do item" }));
    const dialogo = await screen.findByRole("dialog", { name: "Pedido de 1 item" });
    const etapa = within(dialogo).getByRole("combobox", { name: "Etapa de Aço" });
    expect(etapa).toHaveValue("2");
    await u.selectOptions(etapa, "1");
    await u.type(within(dialogo).getByLabelText("Fornecedor"), "Ferragem Inventada");
    await u.click(within(dialogo).getByRole("button", { name: /Registrar pedido de/ }));
    await screen.findByText(/PED-0003: pedido feito/);
    expect(rede.chamadas.find((c) => c.metodo === "POST" && c.caminho.endsWith("/pedidos"))!.corpo).toMatchObject({ linhas: [{ insumo_id: "a", etapa: "1" }] });
  });

  it("serviço não chega: o aviso diz que foi entregue, não que chegou", async () => {
    const SERVICO = { ...PEDIDO, linhas: PEDIDO.linhas.map((l) => ({ ...l, tipo: "servico" as const })) };
    montar({
      "GET /srv/api/obras/o1/pedidos": ({ url }) => json(url.searchParams.getAll("status").includes("aprovado") ? [SERVICO] : []),
      "POST /srv/api/pedidos/p1/recebimentos": () => json({ recebimento: {}, pedido: { ...SERVICO, status: "conferido" }, registro_id: "r9" }, 201),
    });
    await userEvent.setup().click(await screen.findByRole("button", { name: "Chegou: PED-0001" }));
    expect(await screen.findByText("PED-0001 entregue.")).toBeInTheDocument();
  });

  it("item sem preço no orçamento: não inventa zero, pede o preço", async () => {
    montar({}, USUARIO, [item("a", "Aço", "2", 100_000, 0)]);
    const u = userEvent.setup();
    expect(await screen.findByText("sem preço")).toBeInTheDocument();
    await u.click(screen.getByRole("checkbox", { name: /Aço/ }));
    await u.click(screen.getByRole("button", { name: "Fazer pedido do item" }));
    const dialogo = await screen.findByRole("dialog", { name: "Pedido de 1 item" });
    await u.type(within(dialogo).getByLabelText("Fornecedor"), "Fulano Inventado");
    await u.click(within(dialogo).getByRole("button", { name: /Registrar pedido de/ }));
    expect(await within(dialogo).findByText("Digite o preço unitário, ex.: 39,90.")).toBeInTheDocument();
  });

  it("Chegou é um toque: grava a entrega do que falta, com Desfazer, e repete com a mesma chave se a resposta se perder", async () => {
    let tentativas = 0;
    const rede = montar({
      "POST /srv/api/pedidos/p1/recebimentos": () =>
        ++tentativas === 1 ? json({ detail: "O servidor não respondeu." }, 502) : json({ recebimento: {}, pedido: { ...PEDIDO, status: "conferido" }, registro_id: "r9" }, 201),
    });
    const u = userEvent.setup();
    expect(await screen.findByText("Pedido feito · chega 12/11")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Aço · 50 kg/ })).toBeInTheDocument();

    const chegou = screen.getByRole("button", { name: "Chegou: PED-0001" });
    await u.click(chegou);
    expect(await screen.findByText("O servidor não respondeu.")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Chegou: PED-0001" }));
    expect(await screen.findByText("PED-0001 chegou.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeInTheDocument();

    const corpos = rede.chamadas.filter((c) => c.caminho.endsWith("/recebimentos")).map((c) => c.corpo as { linhas: unknown; chave_idempotencia: string });
    expect(corpos[0]!.linhas).toEqual([{ indice: 0, quantidade: 50_000 }]);
    expect(corpos[1]!.chave_idempotencia).toBe(corpos[0]!.chave_idempotencia);
  });

  it("estoque e fornecedores são abas de Compras; viewer vê tudo sem marcar nem Chegou", async () => {
    montar({}, { ...USUARIO, papel: "viewer" });
    const u = userEvent.setup();
    await screen.findByRole("heading", { name: /Falta comprar/ });
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Chegou: PED-0001" })).toBeNull();

    expect(screen.queryByRole("button", { name: "Item fora do orçamento" })).toBeNull();

    await u.click(screen.getByRole("tab", { name: "Estoque" }));
    expect(screen.getByRole("tab", { name: "Estoque" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("heading", { name: /Falta comprar/ })).toBeNull();
    await u.click(screen.getByRole("tab", { name: /^Comprar/ }));
    expect(await screen.findByRole("heading", { name: /Falta comprar/ })).toBeInTheDocument();
  });
});
