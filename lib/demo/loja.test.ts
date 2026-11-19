import { beforeEach, describe, expect, it } from "vitest";
import type { Fornecedor } from "../contrato";
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

beforeEach(() => {
  e = reiniciarDemo();
});

describe("demonstração: dados de exemplo (Casa Vila Nova)", () => {
  it("o resumo das obras traz o prazo de quem tem cronograma, como a API", () => {
    const lista = chamar("GET", "obras/resumo").corpo as import("../contrato").ResumoObra[];
    const casa = lista.find((x) => x.obra.id === obraId())!;
    expect(casa.prazo?.termino_contratual).toMatch(/^\d{4}-\d{2}$/);
    expect(casa.tem_orcamento).toBe(true);
    expect(lista.filter((x) => x.obra.id !== obraId()).every((x) => x.prazo === null)).toBe(true);
  });

  it("a obra em andamento tem orçamento por etapas, cronograma e gastos; nenhuma compra", () => {
    const orc = chamar("GET", `obras/${obraId()}/orcamento`).corpo as import("../contrato").Orcamento;
    expect(orc.etapas).toHaveLength(12);
    expect(orc.totais.gasto).toBeGreaterThan(0);
    expect("comprometido" in orc.totais || "realizado" in orc.totais || "cotando" in orc.totais).toBe(false);
    expect(e.propostas).toEqual([]);
    expect("pedidos" in e || "insumos" in e || "movimentos" in e).toBe(false);
  });
});

describe("demonstração: resumo da obra (o placar e a abertura)", () => {
  it("responde como a API; o prazo vem do cronograma gravado (sem medição, sem projetado)", () => {
    const r = chamar("GET", `obras/${obraId()}/resumo`);
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({
      obra: { id: obraId() },
      cronograma: { cadastrado: true, termino_contratual: expect.stringMatching(/^\d{4}-\d{2}$/), termino_projetado: null, atraso_decimos: null },
      financeiro: { tem_orcamento: expect.any(Boolean), falta_gastar: expect.any(Number) },
    });
    const vitrine = e.obras.find((o) => o.nome === "Residencial Alto Padrão")!;
    expect(chamar("GET", `obras/${vitrine.id}/resumo`).corpo).toMatchObject({ cronograma: { cadastrado: false, termino_contratual: null } });
  });

  it("o gasto é o que já saiu do caixa, igual ao desembolso", () => {
    const f = (chamar("GET", `obras/${obraId()}/resumo`).corpo as import("../contrato").ResumoDaObra).financeiro;
    expect(f.pago).toBe(f.gasto);
    const d = chamar("GET", `obras/${obraId()}/desembolso`).corpo as import("../contrato").Desembolso;
    expect(d.totais.pago).toBe(f.pago);
  });

  it("obra sem versão de contrato não tem orçamento", () => {
    const sem = e.obras.find((o) => !e.versoes.some((v) => v.versao.obra_id === o.id))!;
    expect((chamar("GET", `obras/${sem.id}/resumo`).corpo as { financeiro: { tem_orcamento: boolean } }).financeiro.tem_orcamento).toBe(false);
  });
});

describe("demonstração: Compras saiu do contrato", () => {
  it("pedido, insumo, movimento e recebimento respondem como rota que não existe", () => {
    for (const [m, c] of [
      ["GET", `obras/${obraId()}/pedidos`],
      ["POST", `obras/${obraId()}/pedidos`],
      ["GET", `obras/${obraId()}/insumos`],
      ["POST", `obras/${obraId()}/movimentos`],
      ["POST", "pedidos/p1/avancar"],
      ["POST", "pedidos/p1/recebimentos"],
      ["POST", `obras/${obraId()}/orcamento/importar`],
      ["POST", `obras/${obraId()}/orcamento/materiais`],
    ] as const)
      expect([m, c, chamar(m, c, {}).status]).toEqual([m, c, 404]);
  });
  it("rota fora do contrato é 404", () => expect(chamar("GET", "foo").status).toBe(404));
});

describe("demonstração: fornecedores", () => {
  it("lista os da empresa; admin cadastra e edita, o CNPJ não repete; leitura não grava", () => {
    const antes = (chamar("GET", "fornecedores").corpo as Fornecedor[]).length;
    const f = chamar("POST", "fornecedores", { nome: "Areial Inventado", cnpj: "11.222.333/0001-81" });
    expect(f.status).toBe(201);
    const id = (f.corpo as Fornecedor).id;
    expect((chamar("GET", "fornecedores").corpo as Fornecedor[]).length).toBe(antes + 1);
    expect(chamar("POST", "fornecedores", { nome: "Outro", cnpj: "11222333000181" }).status).toBe(409);
    expect(chamar("POST", "fornecedores", { nome: "X", cnpj: "11222333000100" }).status).toBe(422);
    expect(chamar("POST", "fornecedores", { nome: "" }).status).toBe(422);
    expect((chamar("PATCH", `fornecedores/${id}`, { telefone: "19 0000-0000" }).corpo as Fornecedor)).toMatchObject({ nome: "Areial Inventado", telefone: "19 0000-0000", cnpj: "11222333000181" });
    expect(chamar("POST", "fornecedores", { nome: "Y" }, leitura()).status).toBe(403);
  });
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

describe("demonstração: o Plumo responde sobre a obra, sem compra", () => {
  const conversar = async (texto: string, sessao_id = "s-demo") => {
    const evs = [];
    for await (const ev of roteiroDemo({ texto, obra_id: obraId(), sessao_id }, admin(), 0)) evs.push(ev);
    return evs;
  };

  it("pergunta de compra recebe o que o Plumo faz no lugar, e nada vira proposta", async () => {
    const evs = await conversar("compra 30 sacos de cimento");
    expect(evs.some((x) => x.evento === "proposta")).toBe(false);
    expect(evs.filter((x) => x.evento === "texto").map((x) => (x.dados as { delta: string }).delta).join("")).toContain("não faço compras");
    expect(e.propostas).toEqual([]);
  });

  it("a volta gravada reabre igual: bolha, chip da consulta e texto", async () => {
    await conversar("quanto já gastei na fundação?");
    const lista = chamar("GET", "sessoes").corpo as SessaoApi[];
    // a gravada vem primeiro (a mais recente); as outras são as conversas de exemplo da demonstração
    expect([lista[0]!.id, lista[0]!.titulo]).toEqual(["s-demo", "quanto já gastei na fundação?"]);
    expect(lista.slice(1).every((s) => s.id.startsWith("demo-conversa-"))).toBe(true);
    // sessão é de quem criou: quem só lê vê apenas os próprios exemplos
    expect((chamar("GET", "sessoes", undefined, leitura()).corpo as SessaoApi[]).some((s) => s.id === "s-demo")).toBe(false);
    expect(chamar("GET", "sessoes/s-demo/mensagens", undefined, leitura()).status).toBe(404);

    const msgs = chamar("GET", "sessoes/s-demo/mensagens?depois_de=-1&limite=200").corpo as MensagemSessao[];
    const { mensagens, propostaIds } = formatarHistorico(msgs);
    expect(mensagens.map((m) => m.papel)).toEqual(["eu", "agente"]);
    expect(mensagens[0]).toMatchObject({ texto: "quanto já gastei na fundação?" });
    expect(mensagens[1]).toMatchObject({ ferramentas: [{ resumo: "consultou o orçamento" }] });
    expect(propostaIds).toEqual([]);
  });
});

describe("demonstração: página inicial e conta", () => {
  const master = () => e.usuarios[2]!;

  it("GET /obras/resumo soma como a API: pendências, orçamento e última atividade", () => {
    const r = chamar("GET", "obras/resumo");
    expect(r.status).toBe(200);
    const vila = (r.corpo as { obra: { id: string }; [k: string]: unknown }[]).find((x) => x.obra.id === obraId())!;
    expect(vila).toMatchObject({ pendencias: 0, tem_orcamento: true });
    expect(vila.ultima_atividade).toBeTruthy();
    expect(Object.keys(vila).some((k) => /pedido|comprar|nf_/.test(k))).toBe(false);
  });

  it("GET /conta traz perfil, empresa, chave (null sem chave) e créditos; a chave nunca volta inteira", () => {
    entrarDemo("master@obra.com", "x");
    const c = chamar("GET", "conta", undefined, master()).corpo as Record<string, unknown>;
    expect(c).toMatchObject({ usuario: { papel: "master", email: "master@obra.com" }, tenant: { nome: "Construtora Exemplo" }, chave_propria: null });
    const chave = "sk-ant-api03-abcdefghijklmnop-WXYZ";
    expect(chamar("PUT", "conta/chave-anthropic", { chave }, master()).status).toBe(200);
    const depois = chamar("GET", "conta", undefined, master()).corpo;
    expect(JSON.stringify(depois)).not.toContain("abcdefghijklmnop");
    expect(chamar("GET", "conta/chave-anthropic").corpo).toMatchObject({ ativa: true, final: "WXYZ", conectada_por: master().nome });
    expect((chamar("GET", "creditos").corpo as { chave_propria: boolean }).chave_propria).toBe(true);
    expect(chamar("DELETE", "conta/chave-anthropic", undefined, master()).status).toBe(200);
    expect(chamar("GET", "conta/chave-anthropic").corpo).toMatchObject({ ativa: false, final: null });
  });

  it("admin e master trocam a chave, leitura não; chave fora do formato é 422", () => {
    expect(chamar("PUT", "conta/chave-anthropic", { chave: "sk-ant-api03-abcdefghijklmnop" }, leitura()).status).toBe(403);
    expect(chamar("DELETE", "conta/chave-anthropic", undefined, leitura()).status).toBe(403);
    expect(chamar("PUT", "conta/chave-anthropic", { chave: "sk-ant-api03-abcdefghijklmnop" }).status).toBe(200);
    expect(chamar("DELETE", "conta/chave-anthropic").status).toBe(200);
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
    expect(l.sugestao).toMatchObject({ nome: 1, unidade: 2, quantidade: 3, valor_unitario: 4, valor_total: 5 });
    expect("saldo" in l.sugestao || "curva" in l.sugestao).toBe(false);
    expect(chamar("POST", `obras/${o.id}/orcamento/ler`, { arquivo: { nome: "orc.xlsx", texto: "" } }).status).toBe(422);
  });

  it("aprovar exige orçamento, passa para em andamento e o desfazer reabre", () => {
    const o = criar().corpo as { id: string };
    expect(chamar("POST", `obras/${o.id}/orcamento/aprovar`).status).toBe(422);
    chamar("POST", `obras/${o.id}/orcamento/estrutura`, { itens: [{ nome: "Concreto C25", unidade: "m³", quantidade: 1_000, valor_unitario: 40_000 }], aplicar: true });
    const r = chamar("POST", `obras/${o.id}/orcamento/aprovar`).corpo as { status: string; registro_id: string };
    expect(r.status).toBe("em_andamento");
    expect(e.registro.at(-1)!.texto).toBe("Aprovou o orçamento de Casa Teste (R$ 400,00)");
    expect(chamar("POST", `obras/${o.id}/orcamento/aprovar`).status).toBe(409);
    chamar("POST", `registro/${r.registro_id}/desfazer`);
    expect(e.obras.find((x) => x.id === o.id)!.status).toBe("em_orcamento");
  });

});

describe("demonstração: pranchas num orçamento ainda não aprovado", () => {
  type O = import("../contrato").Orcamento;
  type PV = import("../contrato").PreviaVersao;
  const ACO = { nome: "Aço CA-50 Ø 10,0 mm (SINAPI 34)", unidade: "kg", quantidade: 220_300, valor_unitario: 669 };
  const LAJE = { nome: "Concreto C25", unidade: "m³", quantidade: 3_960, valor_unitario: 49_610 };
  // obra nova, ainda em orçamento: a da demo já foi aprovada
  const criar = () => chamar("POST", "obras", { nome: "Casa Teste", chave_idempotencia: crypto.randomUUID(), verba: 1_000_000 });

  it("soma ao orçamento (não é aditivo), na mesma etapa pelo nome; marca o repetido; o Desfazer volta o anterior", () => {
    const o = criar().corpo as { id: string };
    chamar("POST", `obras/${o.id}/orcamento/estrutura`, { itens: [LAJE], aplicar: true, chave_idempotencia: "p1" });
    const antes = chamar("GET", `obras/${o.id}/orcamento`).corpo as O;

    const previa = chamar("POST", `obras/${o.id}/orcamento/estrutura`, { itens: [ACO, { ...LAJE, nome: "Concreto usinado fck 25" }], aplicar: false }).corpo as PV;
    expect(previa).toMatchObject({ tipo: "contrato", substitui: { total: antes.totais.atual } });
    expect(previa.total_apos).toBe(antes.totais.atual + previa.total);
    expect(previa.itens.find((i) => i.ordem === 2)!.repetido_de).toMatchObject({ descricao: "Concreto C25" });
    expect(previa.itens.find((i) => i.ordem === 1)!.repetido_de).toBeNull();
    expect(previa.avisos).toHaveLength(1);

    // o concreto repetido fica de fora
    const gravou = chamar("POST", `obras/${o.id}/orcamento/estrutura`, { itens: [ACO, { ...LAJE, nome: "Concreto usinado fck 25" }], aplicar: true, chave_idempotencia: "p2", ignorar_itens: [2] }).corpo as PV;
    expect(gravou).toMatchObject({ aplicado: true, tipo: "contrato", n_itens: 1 });
    const depois = chamar("GET", `obras/${o.id}/orcamento`).corpo as O;
    expect(depois.totais).toMatchObject({ aditivos: 0, aditivos_pct: 0, n_etapas: 1, atual: antes.totais.atual + Math.round((ACO.quantidade * ACO.valor_unitario) / 1000) });
    expect(depois.itens.filter((i) => i.tipo === "item").map((i) => i.descricao)).toEqual(["Concreto C25", ACO.nome]);
    expect(depois.versoes.filter((v) => v.ativa)).toHaveLength(1);
    expect(depois.versoes.find((v) => v.ativa)).toMatchObject({
      origem: "somar",
      rotulo: "Orçamento com os materiais das pranchas somados",
      desfazer_texto: expect.stringMatching(/^Volta o orçamento para antes de somar os materiais das pranchas \(R\$ [\d.,]+, 1 item\)\.$/),
    });
    expect(depois.versoes.find((v) => !v.ativa)).toMatchObject({ rotulo: "Materiais das pranchas", desfazer_texto: null });
    expect(e.registro.at(-1)!.texto).toMatch(/^Somou 1 item ao orçamento de Casa Teste \(\+R\$/);

    chamar("POST", `registro/${gravou.registro_id}/desfazer`);
    const final = chamar("GET", `obras/${o.id}/orcamento`).corpo as O;
    expect(final.totais.atual).toBe(antes.totais.atual);
    expect(final.versoes.filter((v) => v.ativa).map((v) => v.id)).toEqual(antes.versoes.map((v) => v.id));
  });

  it("muda a ordem das etapas antes de aprovar: renumera, guarda o preço editado e o Desfazer volta a ordem", () => {
    const o = criar().corpo as { id: string };
    chamar("POST", `obras/${o.id}/orcamento/estrutura`, { itens: [LAJE], aplicar: true, chave_idempotencia: "o1", etapa: "Estrutura" });
    chamar("POST", `obras/${o.id}/orcamento/estrutura`, { itens: [ACO], aplicar: true, chave_idempotencia: "o2", etapa: "Serviços preliminares" });
    const aco = (chamar("GET", `obras/${o.id}/orcamento`).corpo as O).itens.find((i) => i.descricao === ACO.nome)!;
    chamar("PATCH", `obras/${o.id}/orcamento/itens/${aco.id}`, { valor_unitario: 700 });
    const antes = chamar("GET", `obras/${o.id}/orcamento`).corpo as O;
    expect(antes.etapas.map((et) => et.descricao)).toEqual(["Estrutura", "Serviços preliminares"]);

    expect(chamar("POST", `obras/${o.id}/orcamento/etapas/ordem`, { ordem: ["1"], chave_idempotencia: "ordem-0001" }).status).toBe(422);
    const r = chamar("POST", `obras/${o.id}/orcamento/etapas/ordem`, { ordem: ["2", "1"], chave_idempotencia: "ordem-0002" });
    expect(r.corpo).toMatchObject({ etapas: [{ etapa: "1", descricao: "Serviços preliminares" }, { etapa: "2", descricao: "Estrutura" }] });
    // a mesma chave não grava outra versão
    chamar("POST", `obras/${o.id}/orcamento/etapas/ordem`, { ordem: ["2", "1"], chave_idempotencia: "ordem-0002" });
    const depois = chamar("GET", `obras/${o.id}/orcamento`).corpo as O;
    expect(depois.etapas.map((et) => et.descricao)).toEqual(["Serviços preliminares", "Estrutura"]);
    expect(depois.itens.find((i) => i.descricao === ACO.nome)).toMatchObject({ numero: "1.1", valor_unitario: 700 });
    expect(depois.versoes.filter((v) => v.ativa)).toHaveLength(1);
    expect(depois.totais.atual).toBe(antes.totais.atual);
    expect(e.registro.at(-1)!.texto).toBe("Reordenou as etapas do orçamento de Casa Teste");
    expect(depois.versoes.find((v) => v.ativa)).toMatchObject({ origem: "reordenar", rotulo: "Etapas reordenadas" });

    chamar("POST", `registro/${(r.corpo as { registro_id: string }).registro_id}/desfazer`);
    const final = chamar("GET", `obras/${o.id}/orcamento`).corpo as O;
    expect(final.etapas.map((et) => et.descricao)).toEqual(["Estrutura", "Serviços preliminares"]);
    expect(final.versoes.map((v) => v.situacao)).toEqual(["substituida", "vigente", "desfeita"]);
  });

  it("ordem das etapas, como a API: chave repetida com outra ordem, versão que não é a vigente e etapa em uso dão 409", () => {
    const o = criar().corpo as { id: string };
    chamar("POST", `obras/${o.id}/orcamento/estrutura`, { itens: [LAJE], aplicar: true, chave_idempotencia: "w1", etapa: "Estrutura" });
    chamar("POST", `obras/${o.id}/orcamento/estrutura`, { itens: [ACO], aplicar: true, chave_idempotencia: "w2", etapa: "Fundação" });
    chamar("POST", `obras/${o.id}/orcamento/estrutura`, { itens: [{ ...ACO, nome: "Tapume" }], aplicar: true, chave_idempotencia: "w3", etapa: "Preliminares" });
    const vista = (chamar("GET", `obras/${o.id}/orcamento`).corpo as O).versoes.find((v) => v.ativa)!.id;

    expect(chamar("POST", `obras/${o.id}/orcamento/etapas/ordem`, { ordem: ["2", "1", "3"], chave_idempotencia: "chave-001", versao_id: vista }).status).toBe(200);
    expect(chamar("POST", `obras/${o.id}/orcamento/etapas/ordem`, { ordem: ["2", "1", "3"], chave_idempotencia: "chave-001", versao_id: vista }).status).toBe(200);
    const outra = chamar("POST", `obras/${o.id}/orcamento/etapas/ordem`, { ordem: ["1", "3", "2"], chave_idempotencia: "chave-001" });
    expect(outra.status).toBe(409);
    // a ordem montada sobre a numeração de antes moveria a etapa errada
    const velha = chamar("POST", `obras/${o.id}/orcamento/etapas/ordem`, { ordem: ["1", "3", "2"], chave_idempotencia: "chave-002", versao_id: vista });
    expect(velha).toMatchObject({ status: 409, corpo: { detail: expect.stringMatching(/orçamento mudou/) } });

    // um gasto na etapa 2 (a Estrutura, depois da troca): só passa a ordem que a mantém no número 2
    e.gastos.gastos.push({ id: "g-x", obra_id: o.id, etapa: "2", estornado: false, valor: 1000 } as never);
    const presa = chamar("POST", `obras/${o.id}/orcamento/etapas/ordem`, { ordem: ["2", "1", "3"], chave_idempotencia: "chave-003" });
    expect(presa).toMatchObject({ status: 409, corpo: { detail: "Já há lançamento (gasto, tópico ou cronograma) na etapa 2 Estrutura: renumerar levaria o lançamento para outra etapa." } });
    expect(chamar("POST", `obras/${o.id}/orcamento/etapas/ordem`, { ordem: ["3", "2", "1"], chave_idempotencia: "chave-004" }).status).toBe(200);
  });

  it("o preço editado no orçamento somado continua achando o item (id pela posição na versão)", () => {
    const o = criar().corpo as { id: string };
    chamar("POST", `obras/${o.id}/orcamento/estrutura`, { itens: [LAJE], aplicar: true, chave_idempotencia: "q1" });
    chamar("POST", `obras/${o.id}/orcamento/estrutura`, { itens: [{ ...ACO, valor_unitario: 0 }], aplicar: true, chave_idempotencia: "q2" });
    const aco = (chamar("GET", `obras/${o.id}/orcamento`).corpo as O).itens.find((i) => i.descricao === ACO.nome)!;
    expect(chamar("PATCH", `obras/${o.id}/orcamento/itens/${aco.id}`, { valor_unitario: 700 }).status).toBe(200);
    expect((chamar("GET", `obras/${o.id}/orcamento`).corpo as O).itens.find((i) => i.descricao === ACO.nome)!.valor_unitario).toBe(700);
  });
});

describe("demonstração: paginação pelo cursor antes_de", () => {
  type R = import("../contrato").EntradaRegistro;
  it("a 2ª página começa logo depois da 1ª, sem repetir nem pular", () => {
    const o = chamar("POST", "obras", { nome: "Casa Paginada", chave_idempotencia: "paginacao-1" }).corpo as { id: string };
    // um instante por entrada: o cursor é o criado_em, e empate não é o que este teste olha
    for (let i = 0; i < 5; i++)
      e.registro.push({ id: `r-${i}`, tenant_id: e.usuarios[0]!.tenant_id, criado_em: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), quem: "x", obra_id: o.id, origem: "tela", texto: `${i}`, proposta_id: null, desfazer: null, desfeito: false });
    const todos = chamar("GET", `registro?obra_id=${o.id}`).corpo as R[];
    const p1 = chamar("GET", `registro?obra_id=${o.id}&limite=2`).corpo as R[];
    const p2 = chamar("GET", `registro?obra_id=${o.id}&limite=2&antes_de=${encodeURIComponent(p1.at(-1)!.criado_em)}`).corpo as R[];
    expect(p2.some((p) => p1.some((x) => x.id === p.id))).toBe(false);
    const juntos = [...p1, ...p2];
    expect(juntos.map((p) => p.id)).toEqual(todos.slice(0, juntos.length).map((p) => p.id));
  });
});

describe("demonstração: orçamento por etapas", () => {
  it("GET …/orcamento traz a versão de verdade (12 etapas); a importação EAP por planilha responde 422", () => {
    const o = chamar("GET", `obras/${obraId()}/orcamento`).corpo as import("../contrato").Orcamento;
    expect(o.versoes).toHaveLength(1);
    expect(o.versoes[0]).toMatchObject({ tipo: "contrato", numero: 0, ativa: true, descricao: "Orçamento", etapas: 12 });
    expect(o.etapas[0]).toEqual(expect.objectContaining({ etapa: "1", descricao: "Serviços preliminares", aditivos: 0 }));
    const itens = o.itens.filter((i) => i.tipo === "item");
    expect(o.totais).toMatchObject({ n_itens: itens.length, n_etapas: 12, aditivos: 0 });
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
    expect(depois.etapas).toHaveLength(13);
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
  it("a obra em andamento nasce com cronograma; a vitrine vem vazia com as etapas; a medição ainda responde 422", () => {
    const c = chamar("GET", `obras/${obraId()}/cronograma`).corpo as import("../contrato").Cronograma;
    expect(c).toMatchObject({ meses: 12, medicoes: [] });
    expect(c.mensal).toHaveLength(12);
    const vitrine = e.obras.find((o) => o.nome === "Residencial Alto Padrão")!;
    const v = chamar("GET", `obras/${vitrine.id}/cronograma`).corpo as import("../contrato").Cronograma;
    expect(v).toMatchObject({ inicio: null, meses: 0, mensal: [], medicoes: [] });
    expect(v.etapas.length).toBeGreaterThan(0);
    expect(chamar("POST", `obras/${obraId()}/medicoes`, {}).status).toBe(422);
  });

  it("desembolso: sem cronograma vem vazio (não 404); com ele, segue o previsto e o que falta desconta o gasto", () => {
    const vitrine = e.obras.find((o) => o.nome === "Residencial Alto Padrão")!;
    const r = chamar("GET", `obras/${vitrine.id}/desembolso`);
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ base: "sem_cronograma", meses: [], termino_projetado: null });
    const d = chamar("GET", `obras/${obraId()}/desembolso`).corpo as import("../contrato").Desembolso;
    expect(d.meses).toHaveLength(12);
    expect(d.totais.gasto).toBeGreaterThan(0);
    expect(d.totais.falta).toBeLessThan(d.totais.orcado);
    // o que já foi pago sai da conta: o projetado dos meses que vêm não passa do previsto do cronograma inteiro
    const projetado = d.meses.reduce((t, m) => t + m.projetado, 0);
    expect(projetado).toBeGreaterThan(0);
    expect(projetado).toBeLessThan(d.meses.reduce((t, m) => t + m.previsto, 0));
  });
});

describe("demonstração: cronograma (motor + grava e desfaz)", () => {
  const criarEmOrcamento = () => {
    const o = chamar("POST", "obras", { nome: "Casa Cronograma", chave_idempotencia: "cronograma-1", verba: 1_000_000 }).corpo as { id: string };
    chamar("POST", `obras/${o.id}/orcamento/estrutura`, {
      itens: [
        { nome: "Fundação em sapata", unidade: "m³", quantidade: 10_000, valor_unitario: 50_000 },
        { nome: "Estrutura de concreto", unidade: "m³", quantidade: 20_000, valor_unitario: 60_000 },
      ],
      aplicar: true,
    });
    return o;
  };

  it("sem cronograma: GET traz as etapas do orçamento, sem meses", () => {
    const o = criarEmOrcamento();
    const cr = chamar("GET", `obras/${o.id}/cronograma`).corpo as import("../contrato").Cronograma;
    expect(cr.inicio).toBeNull();
    expect(cr.meses).toBe(0);
    expect(cr.etapas.length).toBeGreaterThanOrEqual(1);
  });

  it("PUT grava a grade, o GET devolve mensal/prazo calculados, e o desfazer apaga", () => {
    const o = criarEmOrcamento();
    const etapas = (chamar("GET", `obras/${o.id}/cronograma`).corpo as import("../contrato").Cronograma).etapas;
    const corpo = {
      inicio: "2026-01",
      meses: 4,
      etapas: etapas.map((et, i) => ({ etapa: et.etapa, percentuais: i === 0 ? [5000, 5000, 0, 0] : [0, 0, 5000, 5000] })),
    };
    const salvo = chamar("PUT", `obras/${o.id}/cronograma`, corpo).corpo as import("../contrato").Cronograma & { registro_id: string };
    expect(salvo.inicio).toBe("2026-01");
    expect(salvo.meses).toBe(4);
    expect(salvo.mensal).toHaveLength(4);
    // o previsto acumulado fecha no orçado da obra
    const total = salvo.etapas.reduce((s, et) => s + et.atual, 0);
    expect(salvo.mensal.at(-1)!.previsto_acumulado).toBe(total);
    expect(salvo.prazo.termino_contratual).toBe("2026-04");
    // desfazer apaga o cronograma
    chamar("POST", `registro/${salvo.registro_id}/desfazer`);
    expect((chamar("GET", `obras/${o.id}/cronograma`).corpo as import("../contrato").Cronograma).meses).toBe(0);
  });

  it("PUT recusa etapa que não fecha 100%", () => {
    const o = criarEmOrcamento();
    const etapas = (chamar("GET", `obras/${o.id}/cronograma`).corpo as import("../contrato").Cronograma).etapas;
    const r = chamar("PUT", `obras/${o.id}/cronograma`, { inicio: "2026-01", meses: 2, etapas: [{ etapa: etapas[0]!.etapa, percentuais: [3000, 3000] }] });
    expect(r.status).toBe(422);
  });
});

describe("demonstração: IA propõe o cronograma e a aprovação o cria", () => {
  const criarEmOrcamento = () => {
    const o = chamar("POST", "obras", { nome: "Casa IA Cronograma", chave_idempotencia: "ia-cronograma-1", verba: 1_000_000 }).corpo as { id: string };
    chamar("POST", `obras/${o.id}/orcamento/estrutura`, {
      itens: [
        { nome: "Fundação em sapata", unidade: "m³", quantidade: 10_000, valor_unitario: 50_000 },
        { nome: "Estrutura de concreto", unidade: "m³", quantidade: 20_000, valor_unitario: 60_000 },
      ],
      aplicar: true,
    });
    return o;
  };

  it("propor cria uma Proposta pendente de tipo cronograma; aprovar grava o cronograma; desfazer apaga", () => {
    const o = criarEmOrcamento();
    const prop = chamar("POST", `obras/${o.id}/cronograma/propor`).corpo as import("../contrato").Proposta;
    expect(prop.tipo).toBe("cronograma");
    expect(prop.status).toBe("pendente");
    expect((prop.dados as { meses: number }).meses).toBeGreaterThan(0);
    // antes de aprovar, Cronograma ainda vazio
    expect((chamar("GET", `obras/${o.id}/cronograma`).corpo as import("../contrato").Cronograma).meses).toBe(0);
    // aprova a proposta → cria o cronograma
    const r = chamar("POST", `propostas/${prop.id}/aprovar`).corpo as { proposta: import("../contrato").Proposta; registro: { id: string } };
    expect(r.proposta.status).toBe("aprovada");
    const cr = chamar("GET", `obras/${o.id}/cronograma`).corpo as import("../contrato").Cronograma;
    expect(cr.meses).toBeGreaterThan(0);
    expect(cr.inicio).toBe((prop.dados as { inicio: string }).inicio);
    expect(cr.mensal.length).toBe(cr.meses);
    // desfazer a aprovação volta a ficar sem cronograma
    chamar("POST", `registro/${r.registro.id}/desfazer`);
    expect((chamar("GET", `obras/${o.id}/cronograma`).corpo as import("../contrato").Cronograma).meses).toBe(0);
  });

  it("propor recusa obra que já tem cronograma", () => {
    const o = criarEmOrcamento();
    const prop = chamar("POST", `obras/${o.id}/cronograma/propor`).corpo as import("../contrato").Proposta;
    chamar("POST", `propostas/${prop.id}/aprovar`);
    const r = chamar("POST", `obras/${o.id}/cronograma/propor`);
    expect(r.status).toBe(409);
  });
});

describe("demonstração: a IA sequencia o cronograma por fase (multi-etapa)", () => {
  it("etapas fora de ordem → a proposta reordena fundação → alvenaria → acabamento", () => {
    const o = chamar("POST", "obras", { nome: "Casa Multietapa", chave_idempotencia: "multietapa-99", verba: 5_000_000 }).corpo as { id: string };
    // três etapas, numeradas na ordem 1=Fundação, 2=Acabamento, 3=Alvenaria (fora da ordem de obra, de propósito)
    chamar("POST", `obras/${o.id}/orcamento/estrutura`, { etapa: "Fundação", itens: [{ nome: "Concreto", unidade: "m³", quantidade: 20_000, valor_unitario: 49_600 }], aplicar: true, chave_idempotencia: "mult-fund-01" });
    chamar("POST", `obras/${o.id}/orcamento/estrutura`, { etapa: "Acabamento", itens: [{ nome: "Pintura", unidade: "m²", quantidade: 300_000, valor_unitario: 2_000 }], aplicar: true, chave_idempotencia: "mult-acab-01" });
    chamar("POST", `obras/${o.id}/orcamento/estrutura`, { etapa: "Alvenaria", itens: [{ nome: "Bloco", unidade: "un", quantidade: 1_000_000, valor_unitario: 200 }], aplicar: true, chave_idempotencia: "mult-alv-001" });

    const prop = chamar("POST", `obras/${o.id}/cronograma/propor`).corpo as import("../contrato").Proposta;
    const etapas = (prop.dados as { etapas: { etapa: string; percentuais: number[] }[] }).etapas;
    const inicio = (chave: string) => etapas.find((e) => e.etapa === chave)!.percentuais.findIndex((p) => p > 0);
    // 1=Fundação (fase inicial), 3=Alvenaria (vedação), 2=Acabamento (final): a IA reordena por fase de obra
    expect(inicio("1")).toBeLessThan(inicio("3"));
    expect(inicio("3")).toBeLessThan(inicio("2"));
    for (const et of etapas) expect(et.percentuais.reduce((s, x) => s + x, 0)).toBe(10000); // cada etapa fecha 100%
  });

  it("a obra-vitrine do demo já vem pronta para a IA: em orçamento, 4 etapas, sem cronograma, e a proposta vira escada", () => {
    const vit = e.obras.find((o) => o.nome === "Residencial Alto Padrão")!;
    expect(vit.status).toBe("em_orcamento");
    // sem cronograma: pronta para o "Gerar com IA" da tela
    expect((chamar("GET", `obras/${vit.id}/cronograma`).corpo as import("../contrato").Cronograma).meses).toBe(0);
    const orc = chamar("GET", `obras/${vit.id}/orcamento`).corpo as { etapas: { descricao: string }[] };
    expect(orc.etapas.map((et) => et.descricao)).toEqual(["Fundação", "Superestrutura", "Alvenaria", "Acabamento"]);

    const prop = chamar("POST", `obras/${vit.id}/cronograma/propor`).corpo as import("../contrato").Proposta;
    const etapas = (prop.dados as { meses: number; etapas: { etapa: string; percentuais: number[] }[] }).etapas;
    const dados = prop.dados as { meses: number };
    expect(dados.meses).toBe(14); // respeita o prazo da obra (prazo_meses)
    const inicio = (n: string) => etapas.find((et) => et.etapa === n)!.percentuais.findIndex((p) => p > 0);
    // 1=Fundação → 2=Superestrutura → 3=Alvenaria → 4=Acabamento: a escada por fase de obra
    expect(inicio("1")).toBeLessThanOrEqual(inicio("2"));
    expect(inicio("2")).toBeLessThanOrEqual(inicio("3"));
    expect(inicio("3")).toBeLessThan(inicio("4"));
    for (const et of etapas) expect(et.percentuais.reduce((s, x) => s + x, 0)).toBe(10000);

    // aprovar grava o cronograma na obra-vitrine, com os 14 meses do prazo
    chamar("POST", `propostas/${prop.id}/aprovar`);
    expect((chamar("GET", `obras/${vit.id}/cronograma`).corpo as import("../contrato").Cronograma).meses).toBe(14);
  });
});
