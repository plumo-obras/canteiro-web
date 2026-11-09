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

describe("demonstração: resumo da obra (o placar e a abertura)", () => {
  it("responde como a API, sem cronograma", () => {
    const r = chamar("GET", `obras/${obraId()}/resumo`);
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ obra: { id: obraId() }, cronograma: { cadastrado: false }, financeiro: { tem_orcamento: expect.any(Boolean), falta_gastar: expect.any(Number) } });
  });

  it("obra sem versão de contrato não tem orçamento", () => {
    const sem = e.obras.find((o) => !e.versoes.some((v) => v.versao.obra_id === o.id))!;
    expect((chamar("GET", `obras/${sem.id}/resumo`).corpo as { financeiro: { tem_orcamento: boolean } }).financeiro.tem_orcamento).toBe(false);
  });
});

describe("demonstração: aprovar executa e o desfazer volta", () => {
  it("criar_pedido: aprovar cria o pedido já aprovado (a caminho sobe, falta zera); desfazer cancela", () => {
    const pr = (chamar("GET", "propostas?status=pendente").corpo as Proposta[]).find((p) => p.tipo === "criar_pedido")!;
    const r = chamar("POST", `propostas/${pr.id}/aprovar`).corpo as { proposta: Proposta; registro: { id: string } };
    expect(r.proposta).toMatchObject({ status: "aprovada", decidido_por_nome: "Rizzi", registro_id: r.registro.id });
    expect(e.pedidos.at(-1)!.status).toBe("aprovado"); // uma aprovação só, não duas
    expect(conta("cimento")).toMatchObject({ a_caminho: 154_000, cotando: 0, falta: 0 });

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
    expect(chamar("POST", `propostas/${pr.id}/recusar`, { motivo: "outro fornecedor" }).corpo).toMatchObject({
      status: "recusada",
      motivo_recusa: "outro fornecedor",
    });
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
    const texto = evs
      .filter((x) => x.evento === "texto")
      .map((x) => (x.dados as { delta: string }).delta)
      .join("");
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
    expect(mensagens[1]).toMatchObject({ propostas: [prop.id], ferramentas: [{ resumo: "consultou o estoque" }, { nivel: "propoe" }] });
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

describe("demonstração: conferir com a quantidade real", () => {
  const ped157 = () => e.pedidos.find((p) => p.numero === "PED-0157")!; // 40 m³ de areia, recebido

  it("entra o que chegou; a diferença volta para a falta; desfazer estorna só o que entrou", () => {
    const antes = conta("areia");
    const r = chamar("POST", `pedidos/${ped157().id}/avancar`, { para: "conferido", quantidade_recebida: 36_000, nf: "4471" });
    expect(r.corpo).toMatchObject({ status: "conferido", linhas: [expect.objectContaining({ quantidade: 40_000, recebida: 36_000 })] });
    expect(ped157()).toMatchObject({ quantidade_recebida: 36_000, nf: "4471" });
    const depois = conta("areia");
    expect(depois.saldo).toBe(antes.saldo + 36_000);
    expect(depois.falta).toBe(antes.falta + 4_000); // saiu do "a caminho" com 40, entrou 36
    expect(e.movimentos.at(-1)!.origem_doc).toBe("PED-0157 · NF 4471");
    const reg = e.registro.find((x) => x.id === (r.corpo as { registro_id: string }).registro_id)!;
    expect(reg.texto).toContain("chegaram 36 de 40 m³");
    chamar("POST", `registro/${reg.id}/desfazer`);
    expect(conta("areia")).toEqual(antes);
    expect(ped157()).toMatchObject({ status: "recebido", quantidade_recebida: null, nf: null });
  });

  it("recusa quantidade zero e quantidade fora da conferência", () => {
    expect(chamar("POST", `pedidos/${ped157().id}/avancar`, { para: "conferido", quantidade_recebida: 0 }).status).toBe(422);
    const ped160 = e.pedidos.find((p) => p.numero === "PED-0160")!;
    expect(chamar("POST", `pedidos/${ped160.id}/avancar`, { para: "recebido", quantidade_recebida: 10_000 }).status).toBe(422);
  });

  it("não desfaz o avanço se o pedido já andou de novo (409)", () => {
    const ped160 = e.pedidos.find((p) => p.numero === "PED-0160")!; // enviado
    const r = chamar("POST", `pedidos/${ped160.id}/avancar`, { para: "recebido" }).corpo as { registro_id: string };
    chamar("POST", `pedidos/${ped160.id}/avancar`, { para: "conferido" });
    expect(chamar("POST", `registro/${r.registro_id}/desfazer`).status).toBe(409);
  });
});

describe("demonstração: ajustar antes de aprovar", () => {
  const pendente = (tipo: Proposta["tipo"]) => (chamar("GET", "propostas?status=pendente").corpo as Proposta[]).find((p) => p.tipo === tipo)!;

  it("compra ajustada executa o ajuste e guarda o que o agente propôs", () => {
    const pr = pendente("criar_pedido");
    const r = chamar("POST", `propostas/${pr.id}/aprovar`, { ajustes: { quantidade: 30_000, valor: 117_000 } }).corpo as {
      proposta: Proposta;
      registro: { texto: string };
    };
    expect(r.proposta).toMatchObject({ ajustada: true, dados: { quantidade: 30_000, valor: 117_000 }, dados_originais: { quantidade: 34_000 } });
    expect(e.pedidos.at(-1)).toMatchObject({ quantidade: 30_000, valor: 117_000, status: "aprovado" });
    expect(r.registro.texto).toContain("ajustado: quantidade 34 sc → 30 sc");
  });

  it("conferência ajustada dá entrada do que chegou", () => {
    const antes = conta("areia").saldo;
    chamar("POST", `propostas/${pendente("avancar_pedido").id}/aprovar`, { ajustes: { quantidade_recebida: 36_000 } });
    expect(conta("areia").saldo).toBe(antes + 36_000);
  });

  it("campo que não se ajusta é 422 e nada é executado", () => {
    const pr = pendente("criar_pedido");
    const n = e.pedidos.length;
    expect(chamar("POST", `propostas/${pr.id}/aprovar`, { ajustes: { insumo_id: "outro" } }).status).toBe(422);
    expect(e.pedidos.length).toBe(n);
    expect(e.propostas.find((p) => p.id === pr.id)!.status).toBe("pendente");
  });

  it("recusar fica no histórico", () => {
    const pr = pendente("criar_pedido");
    chamar("POST", `propostas/${pr.id}/recusar`, { motivo: "outro fornecedor" });
    expect(e.registro.at(-1)).toMatchObject({ texto: expect.stringContaining("Recusou"), desfazer: null });
  });
});

describe("demonstração: lançamentos e pedido pela tela", () => {
  const lancar = (c: Record<string, unknown>) => chamar("POST", `obras/${obraId()}/movimentos`, { chave_idempotencia: "chave-teste-1", ...c });

  it("saída de curva A exige a frente de serviço; com ela, baixa o saldo e desfaz", () => {
    const bloco = e.insumos.get("bloco")!.id;
    expect(lancar({ insumo_id: bloco, tipo: "saida", quantidade: 100_000 }).status).toBe(422);
    const r = lancar({ insumo_id: bloco, tipo: "saida", quantidade: 100_000, destino: "Alvenaria 1º andar" });
    expect(r.status).toBe(201);
    expect(conta("bloco").saldo).toBe(2_660_000);
    expect((r.corpo as { quem: string }).quem).toBe("Rizzi");
    chamar("POST", `registro/${(r.corpo as { registro_id: string }).registro_id}/desfazer`);
    expect(conta("bloco").saldo).toBe(2_760_000);
  });

  it("a mesma chave não lança duas vezes; com outro conteúdo é 409", () => {
    const areia = e.insumos.get("areia")!.id;
    lancar({ insumo_id: areia, tipo: "ajuste", quantidade: -2_000, destino: "contagem" });
    lancar({ insumo_id: areia, tipo: "ajuste", quantidade: -2_000, destino: "contagem" });
    expect(conta("areia").saldo).toBe(10_000);
    expect(lancar({ insumo_id: areia, tipo: "ajuste", quantidade: -3_000 }).status).toBe(409);
  });

  it("pedido criado já aprovado desfaz enquanto não andou", () => {
    const r = chamar("POST", `obras/${obraId()}/pedidos`, {
      insumo_id: e.insumos.get("bloco")!.id,
      quantidade: 640_000,
      fornecedor: "Cerâmica",
      valor: 204_800,
      aprovado: true,
    });
    const p = r.corpo as Pedido & { registro_id: string };
    expect(p).toMatchObject({ status: "aprovado", numero: "PED-0168" });
    expect(conta("bloco").falta).toBe(0);
    chamar("POST", `registro/${p.registro_id}/desfazer`);
    expect(e.pedidos.find((x) => x.id === p.id)!.status).toBe("cancelado");
  });
});

describe("demonstração: cadastro de obra e orçamento por planilha", () => {
  const PLANILHA = [
    "ORÇAMENTO SINTÉTICO;;;;",
    "Obra: Casa Teste;;;;",
    "Item;Descrição;Unid.;Quant.;Preço unit.;Preço total",
    "1;FUNDAÇÃO;;;;",
    "1.1;Cimento CP-II 50 kg;sc;100;39,00;3.900,00",
    "1.2;Aço CA-50 10 mm;kg;1.000;6,60;6.600,00",
    "2;ALVENARIA;;;;",
    "2.1;Cimento CP-II 50 kg;sc;50;42,00;2.100,00",
    "2.2;Areia média;m³;10;;1.400,00",
    "2.3;Prego 17x21;kg;5;20,00;100,00",
    ";Subtotal;;;;14.100,00",
  ].join("\n");
  const criar = (corpo: Record<string, unknown> = {}) =>
    chamar("POST", "obras", { nome: "Casa Teste", chave_idempotencia: "chave-teste-1", verba: 1_000_000, ...corpo });

  it("cria em orçamento, a mesma chave devolve a mesma obra, e leitura não cria", () => {
    const r = criar();
    expect(r.status).toBe(201);
    const o = r.corpo as { id: string; status: string; area_construida: number };
    expect(o).toMatchObject({ status: "em_orcamento", area_construida: 0 });
    expect((criar().corpo as { id: string }).id).toBe(o.id);
    expect(criar({ nome: "Outra" }).status).toBe(409);
    expect(chamar("POST", "obras", { nome: "X", chave_idempotencia: "chave-teste-2" }, leitura()).status).toBe(403);
  });

  it("editar registra só o que mudou e o desfazer volta (e recusa se mudou de novo)", () => {
    const o = criar().corpo as { id: string };
    const r = chamar("PATCH", `obras/${o.id}`, { area_construida: 142_500, padrao: "normal", nome: "Casa Teste" }).corpo as { registro_id: string };
    expect(e.registro.at(-1)!.texto).toBe("Atualizou a obra Casa Teste: área, padrão");
    expect((chamar("PATCH", `obras/${o.id}`, { padrao: "normal" }).corpo as { registro_id: null }).registro_id).toBeNull();
    chamar("POST", `registro/${r.registro_id}/desfazer`);
    expect(e.obras.find((x) => x.id === o.id)).toMatchObject({ area_construida: 0, padrao: null });

    const r2 = chamar("PATCH", `obras/${o.id}`, { padrao: "alto" }).corpo as { registro_id: string };
    chamar("PATCH", `obras/${o.id}`, { padrao: "baixo" });
    expect(chamar("POST", `registro/${r2.registro_id}/desfazer`).status).toBe(409);
  });

  it("lê o CSV, acha o cabeçalho e sugere as colunas", () => {
    const o = criar().corpo as { id: string };
    const l = chamar("POST", `obras/${o.id}/orcamento/ler`, { arquivo: { nome: "orc.csv", texto: PLANILHA } }).corpo as {
      linha_cabecalho: number;
      sugestao: Record<string, unknown>;
    };
    expect(l.linha_cabecalho).toBe(3);
    expect(l.sugestao).toMatchObject({ nome: 1, unidade: 2, quantidade: 3, valor_unitario: 4, valor_total: 5, saldo: null, curva: null });
    expect(chamar("POST", `obras/${o.id}/orcamento/ler`, { arquivo: { nome: "orc.xlsx", texto: "" } }).status).toBe(422);
  });

  it("materiais do projeto: prévia, m3 vira m³, aplicar grava e reenviar atualiza", () => {
    const o = criar().corpo as { id: string };
    const corpo = {
      origem: "projeto estrutural",
      itens: [
        { nome: "Aço CA-50 Ø 10,0 mm (SINAPI 34)", unidade: "kg", quantidade: 220_300, valor_unitario: 669 },
        { nome: "Concreto usinado C30 (SINAPI 34494)", unidade: "m3", quantidade: 21_650, valor_unitario: 51_263 },
      ],
    };
    const p = chamar("POST", `obras/${o.id}/orcamento/materiais`, { ...corpo, aplicar: false }).corpo as import("../contrato").PreviaOrcamento;
    expect(p).toMatchObject({ aplicado: false, novos: 2, atualizados: 0, erros: [] });
    expect(p.linhas.find((l) => l.nome.startsWith("Concreto"))).toMatchObject({ unidade: "m³", curva: "A" });
    const a = chamar("POST", `obras/${o.id}/orcamento/materiais`, { ...corpo, aplicar: true }).corpo as import("../contrato").PreviaOrcamento;
    expect(a.aplicado).toBe(true);
    expect(a.registro_ids).toHaveLength(1);
    const p2 = chamar("POST", `obras/${o.id}/orcamento/materiais`, { ...corpo, aplicar: false }).corpo as import("../contrato").PreviaOrcamento;
    expect([p2.novos, p2.atualizados]).toEqual([0, 2]);
    expect(chamar("POST", `obras/${o.id}/orcamento/materiais`, { origem: "x", itens: [] }).status).toBe(422);
  });

  it("prévia pula títulos, junta repetidos, calcula o unitário pelo total e a curva pelo valor; aplicar grava", () => {
    const o = criar().corpo as { id: string };
    const arquivo = { nome: "orc.csv", texto: PLANILHA };
    const mapeamento = JSON.stringify({
      planilha: "CSV",
      linha_cabecalho: 3,
      nome: 1,
      unidade: 2,
      quantidade: 3,
      valor_unitario: 4,
      valor_total: 5,
      saldo: null,
      curva: null,
    });
    const p = chamar("POST", `obras/${o.id}/orcamento/importar`, { arquivo, mapeamento, aplicar: "false" }).corpo as import("../contrato").PreviaOrcamento;
    expect(p).toMatchObject({ aplicado: false, novos: 4, atualizados: 0, juntadas: 1, total: 1_410_000, erros: [] });
    expect(p.ignoradas.map((i) => i.motivo)).toEqual([
      "sem unidade (título ou subtotal?)",
      "sem unidade (título ou subtotal?)",
      "sem unidade (título ou subtotal?)",
    ]);
    const cimento = p.linhas.find((l) => l.nome.startsWith("Cimento"))!;
    expect(cimento).toMatchObject({ linhas: [5, 8], quantidade: 150_000, valor_unitario: 4000, total: 600_000 });
    expect(p.linhas.find((l) => l.nome === "Areia média")).toMatchObject({ valor_unitario: 14_000 });
    expect(Object.fromEntries(p.linhas.map((l) => [l.nome, l.curva]))).toEqual({
      "Aço CA-50 10 mm": "A",
      "Cimento CP-II 50 kg": "A",
      "Areia média": "B",
      "Prego 17x21": "C",
    });
    expect(e.insumos.size).toBe(4); // a prévia não grava

    const a = chamar("POST", `obras/${o.id}/orcamento/importar`, { arquivo, mapeamento, aplicar: "true" }).corpo as { aplicado: boolean };
    expect(a.aplicado).toBe(true);
    const itens = chamar("GET", `obras/${o.id}/insumos`).corpo as ItemInsumo[];
    expect(itens).toHaveLength(4);
    // reimportar atualiza em vez de duplicar
    const p2 = chamar("POST", `obras/${o.id}/orcamento/importar`, { arquivo, mapeamento, aplicar: "false" }).corpo as { novos: number; atualizados: number };
    expect(p2).toMatchObject({ novos: 0, atualizados: 4 });
  });

  it("aprovar exige orçamento, passa para em andamento e o desfazer reabre", () => {
    const o = criar().corpo as { id: string };
    expect(chamar("POST", `obras/${o.id}/orcamento/aprovar`).status).toBe(422);
    chamar("POST", `obras/${o.id}/insumos`, { nome: "Cimento", unidade: "sc", precisa_ate_o_fim: 10_000, valor_unitario: 4000 });
    const r = chamar("POST", `obras/${o.id}/orcamento/aprovar`).corpo as { status: string; registro_id: string };
    expect(r.status).toBe("em_andamento");
    expect(e.registro.at(-1)!.texto).toBe("Aprovou o orçamento de Casa Teste (1 insumo, R$ 400,00)");
    expect(chamar("POST", `obras/${o.id}/orcamento/aprovar`).status).toBe(409);
    chamar("POST", `registro/${r.registro_id}/desfazer`);
    expect(e.obras.find((x) => x.id === o.id)!.status).toBe("em_orcamento");
  });

  it("a Estrutura do projeto fica só no orçamento até aprovar; aprovar gera as Compras (vira insumo da obra)", () => {
    const o = criar().corpo as { id: string };
    chamar("POST", `obras/${o.id}/orcamento/estrutura`, {
      itens: [
        { nome: "Aço CA-50 Ø 10,0 mm (SINAPI 34)", unidade: "kg", quantidade: 220_300, valor_unitario: 669 },
        { nome: "Concreto C25", unidade: "m³", quantidade: 3_960, valor_unitario: 49_610 },
      ],
      aplicar: true,
    });
    // antes de aprovar: está no orçamento (versão Estrutura), mas Compras está vazia
    expect(chamar("GET", `obras/${o.id}/orcamento`).corpo as import("../contrato").Orcamento).toMatchObject({ versoes: [{ descricao: "Estrutura" }] });
    expect(chamar("GET", `obras/${o.id}/insumos`).corpo as ItemInsumo[]).toHaveLength(0);
    // aprovar passa para em andamento e cria os insumos a partir da Estrutura
    expect((chamar("POST", `obras/${o.id}/orcamento/aprovar`).corpo as { status: string }).status).toBe("em_andamento");
    const ins = chamar("GET", `obras/${o.id}/insumos`).corpo as ItemInsumo[];
    expect(ins.map((i) => i.insumo.nome).sort()).toEqual(["Aço CA-50 Ø 10,0 mm (SINAPI 34)", "Concreto C25"]);
    expect(ins.find((i) => i.insumo.nome.startsWith("Aço"))!.insumo.precisa_ate_o_fim).toBe(220_300);
  });
});

describe("demonstração: paginação pelo cursor antes_de", () => {
  it("o quadro pede vários status de uma vez", () => {
    const ps = chamar("GET", `obras/${obraId()}/pedidos?status=em_cotacao&status=em_transito`).corpo as Pedido[];
    expect(new Set(ps.map((p) => p.status))).toEqual(new Set(["em_cotacao", "em_transito"]));
  });

  it("a 2ª página começa logo depois da 1ª, sem repetir nem pular", () => {
    const todos = chamar("GET", `obras/${obraId()}/pedidos`).corpo as Pedido[];
    const p1 = chamar("GET", `obras/${obraId()}/pedidos?limite=2`).corpo as Pedido[];
    const p2 = chamar("GET", `obras/${obraId()}/pedidos?limite=2&antes_de=${encodeURIComponent(p1.at(-1)!.criado_em)}`).corpo as Pedido[];
    expect(p2.some((p) => p1.some((x) => x.id === p.id))).toBe(false);
    const juntos = [...p1, ...p2];
    expect(juntos.map((p) => p.id)).toEqual(todos.slice(0, juntos.length).map((p) => p.id));
  });
});

describe("demonstração: orçamento por etapas", () => {
  it("GET …/orcamento traz a versão de verdade (etapa Estrutura); a importação EAP por planilha responde 422", () => {
    const o = chamar("GET", `obras/${obraId()}/orcamento`).corpo as import("../contrato").Orcamento;
    expect(o.versoes).toHaveLength(1);
    expect(o.versoes[0]).toMatchObject({ tipo: "contrato", numero: 0, ativa: true, descricao: "Estrutura", etapas: 1 });
    expect(o.etapas).toEqual([expect.objectContaining({ etapa: "1", descricao: "Estrutura", aditivos: 0 })]);
    const itens = o.itens.filter((i) => i.tipo === "item");
    expect(o.totais).toMatchObject({ n_itens: itens.length, n_etapas: 1, aditivos: 0 });
    expect(o.totais.atual).toBe(itens.reduce((t, i) => t + i.total, 0));
    const r = chamar("POST", `obras/${obraId()}/orcamento/versoes`, { arquivo: { nome: "orc.csv", texto: "" } });
    expect(r.status).toBe(422);
    expect(r.corpo).toMatchObject({ detail: "Na demonstração a importação do orçamento por etapas não está disponível." });
  });

  it("POST …/orcamento/estrutura: prévia não grava; aplicar vira aditivo (já há contrato) e o Desfazer o remove", () => {
    type O = import("../contrato").Orcamento;
    type PV = import("../contrato").PreviaVersao;
    const itens = [
      { nome: "Telha fibrocimento 6mm", unidade: "m2", quantidade: 120_000, valor_unitario: 4200 },
      { nome: "Caibro de madeira", unidade: "m3", quantidade: 2_000, valor_unitario: 350000 },
    ];
    const previa = chamar("POST", `obras/${obraId()}/orcamento/estrutura`, { itens, aplicar: false }).corpo as PV;
    expect(previa).toMatchObject({ aplicado: false, tipo: "aditivo", n_itens: 2, n_etapas: 1 });
    expect(previa.total).toBe(120_000 * 4200 / 1000 + 2_000 * 350000 / 1000);
    expect((chamar("GET", `obras/${obraId()}/orcamento`).corpo as O).versoes).toHaveLength(1);

    const gravou = chamar("POST", `obras/${obraId()}/orcamento/estrutura`, { itens, aplicar: true, chave_idempotencia: "k1" }).corpo as PV;
    expect(gravou).toMatchObject({ aplicado: true, tipo: "aditivo" });
    expect(gravou.versao_id).toBeTruthy();
    const depois = chamar("GET", `obras/${obraId()}/orcamento`).corpo as O;
    expect(depois.versoes).toHaveLength(2);
    expect(depois.etapas).toHaveLength(2);
    expect(depois.totais.aditivos).toBe(previa.total);

    // Idempotência: repetir com a mesma chave não cria outra versão.
    chamar("POST", `obras/${obraId()}/orcamento/estrutura`, { itens, aplicar: true, chave_idempotencia: "k1" });
    expect((chamar("GET", `obras/${obraId()}/orcamento`).corpo as O).versoes).toHaveLength(2);

    chamar("POST", `registro/${gravou.registro_id}/desfazer`);
    const final = chamar("GET", `obras/${obraId()}/orcamento`).corpo as O;
    expect(final.versoes.filter((v) => v.ativa)).toHaveLength(1);
    expect(final.totais.aditivos).toBe(0);
  });
});

describe("demonstração: cronograma (Fase 4)", () => {
  it("GET vem vazio com as etapas; PUT e medição respondem 422", () => {
    const c = chamar("GET", `obras/${obraId()}/cronograma`).corpo as import("../contrato").Cronograma;
    expect(c).toMatchObject({ inicio: null, meses: 0, mensal: [], medicoes: [] });
    expect(c.etapas.length).toBeGreaterThan(0);
    expect(chamar("PUT", `obras/${obraId()}/cronograma`, { inicio: "2026-11", meses: 1, etapas: [] }).status).toBe(422);
    expect(chamar("POST", `obras/${obraId()}/medicoes`, {}).status).toBe(422);
  });

  it("desembolso vem vazio, sem cronograma, em vez de rota inexistente", () => {
    const r = chamar("GET", `obras/${obraId()}/desembolso`);
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ base: "sem_cronograma", meses: [], termino_projetado: null });
  });
});
