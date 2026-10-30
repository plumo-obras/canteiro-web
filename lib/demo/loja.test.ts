import { beforeEach, describe, expect, it } from "vitest";
import type { ItemInsumo, Pedido, Proposta } from "../contrato";
import { entrarDemo, renovarDemo, reiniciarDemo, responder, usuarioDoAcesso } from "./loja";
import { roteiroDemo } from "./agente";
import { formatarHistorico, type MensagemSessao, type SessaoApi } from "../historico";

let e: ReturnType<typeof reiniciarDemo>;
const admin = () => e.usuarios[0]!;
const leitura = () => e.usuarios[1]!;
const obraId = () => e.obras[0]!.id;
const chamar = (m: string, caminho: string, corpo?: unknown, u = admin()) => {
  const [p, q = ""] = caminho.split("?");
  return responder(m, p!.split("/").filter(Boolean), new URLSearchParams(q), corpo, u);
};
const conta = (chave: string) =>
  (chamar("GET", `obras/${obraId()}/insumos`).corpo as ItemInsumo[]).find((i) => i.insumo.id === e.insumos.get(chave)!.id)!.conta;

beforeEach(() => {
  e = reiniciarDemo();
});

describe("demonstração: dados de exemplo do contrato (Casa Vila Nova)", () => {
  it("bate com o seed do contrato", () => {
    expect(conta("bloco").saldo).toBe(2_760_000); // 4.000 − 1.050 − 190
    expect(conta("aco")).toMatchObject({ precisa: 3_940_000, saldo: 140_000, a_caminho: 3_200_000, cotando: 600_000, falta: 0 });
    expect(conta("cimento")).toMatchObject({ precisa: 200_000, saldo: 46_000, a_caminho: 120_000, falta: 34_000 });
  });
});

describe("demonstração: aprovar executa e o desfazer volta", () => {
  it("criar_pedido: aprovar cria o pedido (cotando sobe, falta zera); desfazer cancela", () => {
    const pr = (chamar("GET", "propostas?status=pendente").corpo as Proposta[]).find((p) => p.tipo === "criar_pedido")!;
    const r = chamar("POST", `propostas/${pr.id}/aprovar`).corpo as { proposta: Proposta; registro: { id: string } };
    expect(r.proposta).toMatchObject({ status: "aprovada", decidido_por_nome: "Rizzi", registro_id: r.registro.id });
    expect(conta("cimento")).toMatchObject({ cotando: 34_000, falta: 0 });

    expect(chamar("POST", `propostas/${pr.id}/aprovar`).status).toBe(409); // não executa duas vezes
    chamar("POST", `registro/${r.registro.id}/desfazer`);
    expect(conta("cimento").falta).toBe(34_000);
    expect(e.propostas.find((p) => p.id === pr.id)!.status).toBe("desfeita");
    expect(chamar("POST", `registro/${r.registro.id}/desfazer`).status).toBe(409);
  });

  it("avançar para conferido dá entrada no almoxarifado; desfazer estorna", () => {
    const antes = conta("areia").saldo;
    const pr = (chamar("GET", "propostas?status=pendente").corpo as Proposta[]).find((p) => p.tipo === "avancar_pedido")!;
    const r = chamar("POST", `propostas/${pr.id}/aprovar`).corpo as { registro: { id: string } };
    expect(conta("areia").saldo).toBe(antes + 40_000);
    chamar("POST", `registro/${r.registro.id}/desfazer`);
    expect(conta("areia").saldo).toBe(antes);
    expect(e.pedidos.find((p) => p.numero === "PED-0157")!.status).toBe("recebido");
  });

  it("recusar pede motivo", () => {
    const pr = (chamar("GET", "propostas?status=pendente").corpo as Proposta[])[0]!;
    expect(chamar("POST", `propostas/${pr.id}/recusar`, { motivo: " " }).status).toBe(422);
    expect(chamar("POST", `propostas/${pr.id}/recusar`, { motivo: "outro fornecedor" }).corpo).toMatchObject({ status: "recusada", motivo_recusa: "outro fornecedor" });
  });

  it("papel de leitura não aprova nem avança pedido", () => {
    const pr = (chamar("GET", "propostas?status=pendente").corpo as Proposta[])[0]!;
    expect(chamar("POST", `propostas/${pr.id}/aprovar`, undefined, leitura()).status).toBe(403);
    const ped = e.pedidos[0]!;
    expect(chamar("POST", `pedidos/${ped.id}/avancar`, { para: "conferido" }, leitura()).status).toBe(403);
  });
});

describe("demonstração: pedidos", () => {
  it("valida a transição como regras.validar_transicao", () => {
    const ped = e.pedidos.find((p) => p.numero === "PED-0158")!; // em trânsito
    expect(chamar("POST", `pedidos/${ped.id}/avancar`, { para: "cancelado" }).status).toBe(422);
    const r = chamar("POST", `pedidos/${ped.id}/avancar`, { para: "recebido" });
    expect((r.corpo as Pedido).status).toBe("recebido");
  });

  it("filtra por status e devolve movimentos mais novos primeiro", () => {
    expect((chamar("GET", `obras/${obraId()}/pedidos?status=em_cotacao`).corpo as Pedido[]).map((p) => p.numero)).toEqual(["PED-0167"]);
    const movs = chamar("GET", `obras/${obraId()}/insumos/${e.insumos.get("bloco")!.id}/movimentos?limite=2`).corpo as { criado_em: string }[];
    expect(movs).toHaveLength(2);
    expect(movs[0]!.criado_em > movs[1]!.criado_em).toBe(true);
  });

  it("rota fora do contrato é 404", () => expect(chamar("GET", "foo").status).toBe(404));
});

describe("demonstração: login", () => {
  it("renovação troca a cada uso e a antiga deixa de valer", () => {
    const a = entrarDemo("rizzi@obra.com", "x")!;
    expect(usuarioDoAcesso(`Bearer ${a.acesso}`)?.papel).toBe("admin");
    const b = renovarDemo(a.renovacao)!;
    expect(b.renovacao).not.toBe(a.renovacao);
    expect(renovarDemo(a.renovacao)).toBeNull();
    expect(entrarDemo("leitura@obra.com", "x")!.usuario.papel).toBe("viewer");
  });
});

describe("demonstração: agente só propõe", () => {
  it("cita a conta e cria uma proposta pendente, sem gravar pedido", async () => {
    const pedidosAntes = e.pedidos.length;
    const evs = [];
    for await (const ev of roteiroDemo({ texto: "precisa comprar bloco?", obra_id: obraId() }, admin(), 0)) evs.push(ev);
    const tipos = evs.map((x) => x.evento);
    expect(tipos[0]).toBe("ferramenta");
    expect(tipos.at(-1)).toBe("fim");
    const texto = evs.filter((x) => x.evento === "texto").map((x) => (x.dados as { delta: string }).delta).join("");
    expect(texto).toContain("falta 640 un");
    const prop = evs.find((x) => x.evento === "proposta")!.dados as Proposta;
    expect(prop).toMatchObject({ status: "pendente", tipo: "criar_pedido", dados: { quantidade: 640_000, valor: 204_800 } });
    expect(e.pedidos.length).toBe(pedidosAntes);
  });
});

describe("demonstração: histórico da conversa", () => {
  it("a volta gravada reabre igual: bolha, chips, texto e o cartão da proposta", async () => {
    const evs = [];
    for await (const ev of roteiroDemo({ texto: "quanto falta de bloco?", obra_id: obraId(), sessao_id: "s-demo" }, admin(), 0)) evs.push(ev);
    const prop = evs.find((x) => x.evento === "proposta")!.dados as Proposta;
    const lista = chamar("GET", "sessoes").corpo as SessaoApi[];
    expect(lista.map((s) => [s.id, s.titulo, s.total_mensagens])).toEqual([["s-demo", "quanto falta de bloco?", 5]]);
    expect(chamar("GET", "sessoes", undefined, leitura()).corpo).toEqual([]); // sessão é de quem criou
    expect(chamar("GET", "sessoes/s-demo/mensagens", undefined, leitura()).status).toBe(404);

    const msgs = chamar("GET", "sessoes/s-demo/mensagens?depois_de=-1&limite=200").corpo as MensagemSessao[];
    const { mensagens, propostaIds } = formatarHistorico(msgs);
    expect(mensagens.map((m) => m.papel)).toEqual(["eu", "agente"]);
    expect(mensagens[0]).toMatchObject({ texto: "quanto falta de bloco?" });
    expect(mensagens[1]).toMatchObject({ propostas: [prop.id], ferramentas: [{ resumo: "usou almoxarifado" }, { nivel: "propoe" }] });
    expect(propostaIds).toEqual([prop.id]);
    expect((chamar("GET", "sessoes/s-demo/mensagens?depois_de=3").corpo as MensagemSessao[]).map((m) => m.seq)).toEqual([4]);
  });
});

describe("demonstração: página inicial e conta", () => {
  const master = () => e.usuarios[2]!;

  it("GET /obras/resumo soma como a API: pendências, falta comprar, pedidos abertos e NF para conferir", () => {
    const r = chamar("GET", "obras/resumo");
    expect(r.status).toBe(200);
    const vila = (r.corpo as { obra: { id: string }; [k: string]: unknown }[]).find((x) => x.obra.id === obraId())!;
    // seed: NF 4471 a conferir + compra de cimento pendentes; PED-0157 (recebido), 0158, 0160, 0167 abertos
    expect(vila).toMatchObject({ pendencias: 2, nf_para_conferir: 1, pedidos_abertos: 4, valor_pedidos_abertos: 560000 + 2112000 + 468000 + 402000 });
    expect(vila.falta_comprar).toBeGreaterThanOrEqual(1);
    expect(vila.ultima_atividade).toBeTruthy();
  });

  it("GET /conta traz perfil, empresa, chave (null sem chave) e créditos; a chave nunca volta inteira", () => {
    entrarDemo("master@obra.com", "x");
    const c = chamar("GET", "conta", undefined, master()).corpo as Record<string, unknown>;
    expect(c).toMatchObject({ usuario: { papel: "master", email: "master@obra.com" }, tenant: { nome: "Construtora Exemplo" }, chave_propria: null });
    const chave = "sk-ant-api03-abcdefghijklmnop-WXYZ";
    expect(chamar("PUT", "conta/chave-anthropic", { chave }, master()).status).toBe(200);
    const depois = chamar("GET", "conta", undefined, master()).corpo;
    expect(JSON.stringify(depois)).not.toContain("abcdefghijklmnop");
    expect(chamar("GET", "conta/chave-anthropic").corpo).toMatchObject({ ativa: true, final: "WXYZ" });
    expect((chamar("GET", "creditos").corpo as { chave_propria: boolean }).chave_propria).toBe(true);
    expect(chamar("DELETE", "conta/chave-anthropic", undefined, master()).status).toBe(200);
    expect(chamar("GET", "conta/chave-anthropic").corpo).toMatchObject({ ativa: false, final: null });
  });

  it("só master troca a chave; chave fora do formato é 422", () => {
    expect(chamar("PUT", "conta/chave-anthropic", { chave: "sk-ant-api03-abcdefghijklmnop" }).status).toBe(403);
    expect(chamar("DELETE", "conta/chave-anthropic", undefined, leitura()).status).toBe(403);
    expect(chamar("PUT", "conta/chave-anthropic", { chave: "minha-assinatura-pro" }, master()).status).toBe(422);
  });

  it("GET /uso soma por dia, obra e rota dentro do período e exige as datas", () => {
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const r = chamar("GET", `uso?de=2000-01-01&ate=${hoje}`).corpo as { total: { custo: number }; por_dia: { custo: number }[]; por_rota: { custo: number }[] };
    const soma = (xs: { custo: number }[]) => xs.reduce((t, x) => t + x.custo, 0);
    expect(r.total.custo).toBeGreaterThan(0);
    expect(soma(r.por_dia)).toBe(r.total.custo);
    expect(soma(r.por_rota)).toBe(r.total.custo);
    expect(chamar("GET", "uso?de=ontem&ate=hoje").status).toBe(422);
  });
});
