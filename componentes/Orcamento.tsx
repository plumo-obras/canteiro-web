"use client";
/**
 * Aba Orçamento: a planilha da construtora como ela é, etapa → item, em versões (o contrato e os aditivos que somam a
 * ele). O cabeçalho responde "quanto foi contratado, quanto entrou de aditivo e quanto está orçado agora"; as somas
 * vêm prontas da API (GET /obras/{id}/orcamento), a tela só agrupa e filtra o que já chegou. Comprometido e Realizado
 * dependem de pedidos e notas, então só aparecem quando a obra estiver andando: aqui não se inventa número.
 */
import { useState } from "react";
import type { Obra, Orcamento as DadosOrcamento, VersaoOrcamento } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtReais } from "@/lib/formato";
import { mensagemDe, useCasca } from "./contexto";
import { Confirmar, Drawer } from "./Dialogo";
import { CabecalhoPagina } from "./CabecalhoPagina";
import { useCelular } from "./midia";
import { Icone } from "./Icone";
import { useCarregar } from "./useCarregar";
import { ImportarOrcamento } from "./obra/ImportarOrcamento";
import { MARGEM_CENTAVOS, tagVerba } from "./obra/verba";
import { BlocoAditivos, csvAndamento, fmtPctAditivo } from "./orcamento/Andamento";
import { baixarCsv } from "@/lib/csv";
import { MenuMais } from "./MenuMais";
import { ListaEtapas } from "./orcamento/ListaEtapas";
import { Ajuda } from "./Ajuda";
import { ProximoPasso } from "./ProximoPasso";
import { situacao } from "./suprimentos/Itens";


export const nomeVersao = (v: Pick<VersaoOrcamento, "tipo" | "numero">) => (v.tipo === "contrato" ? "Orçamento inicial" : `${v.numero}º aditivo`);
const SUFIXO_PROJETO = "(projeto).csv";
/** Só veio das pranchas: toda versão vigente é a Estrutura lançada pelo Projeto (a API dá esse nome ao arquivo). */
export const soDasPranchas = (versoes: Pick<VersaoOrcamento, "ativa" | "arquivo">[]) => {
  const vigentes = versoes.filter((v) => v.ativa);
  return vigentes.length > 0 && vigentes.every((v) => v.arquivo.endsWith(SUFIXO_PROJETO));
};
/**
 * O nome da versão para a pessoa. A API manda pronto (`rotulo`); a de antes não, e aí o "Estrutura (projeto).csv",
 * que é o nome interno das pranchas, não pode aparecer.
 */
export const rotuloVersao = (v: Pick<VersaoOrcamento, "rotulo" | "descricao" | "arquivo">) =>
  v.rotulo || (v.arquivo.endsWith(SUFIXO_PROJETO) ? "Materiais das pranchas" : v.descricao);
/** O arquivo enviado; o das pranchas não é arquivo de ninguém (o rótulo já diz de onde veio). */
const arquivoEnviado = (arquivo: string) => (arquivo.endsWith(SUFIXO_PROJETO) ? "" : arquivo);
export const fmtData = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");
const comSinal = (c: number) => (c < 0 ? `−${fmtReais(-c)}` : `+${fmtReais(c)}`);
const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

/** precisa (milésimos) × preço (centavos) → centavos, como a lista de materiais soma. */
const totalInsumo = (precisa: number, valor: number) => Math.round((precisa * valor) / 1000);

export function Orcamento({ obra }: { obra: Obra }) {
  const { versao, podeOperar, avisarFeito, mudou, avisar } = useCasca();
  const orc = useCarregar(() => api.orcamento(obra.id), [obra.id, versao]);
  const ins = useCarregar(() => api.listarInsumos(obra.id), [obra.id, versao]);
  const [modal, setModal] = useState<"importar" | "somar" | "aprovar" | null>(null);

  const dado = orc.dado;
  const materiais = (ins.dado ?? []).filter((i) => i.insumo.precisa_ate_o_fim > 0);
  const totalMateriais = materiais.reduce((t, i) => t + totalInsumo(i.insumo.precisa_ate_o_fim, i.insumo.valor_unitario), 0);
  const temContrato = !!dado?.versoes.some((v) => v.tipo === "contrato" && v.ativa);
  const emOrcamento = obra.status === "em_orcamento";
  const podeAprovar = emOrcamento && (temContrato || materiais.length > 0);
  const nFalta = (ins.dado ?? []).filter((i) => situacao(i.conta) === "falta").length;
  const primeiraEtapa = dado?.etapas.find((e) => e.descricao)?.descricao;
  const desfazendo = obra.status === "desfazendo_aprovacao";
  const nSemPreco = temContrato
    ? (dado?.itens ?? []).filter((i) => i.tipo === "item" && !i.valor_unitario).length
    : materiais.filter((i) => !i.insumo.valor_unitario).length;

  const aprovar = async () => {
    const r = await api.aprovarOrcamento(obra.id);
    setModal(null);
    mudou();
    avisarFeito(`Orçamento aprovado. ${obra.nome} está em andamento.`, r.registro_id ?? null);
  };

  // Prevê a obra completa: organiza os serviços por fase e ESTIMA as fases que faltam (distribuição típica de obra),
  // para o cronograma nascer da fundação à entrega. Conforme o orçamento é detalhado, a estimativa vira real.
  const organizarFases = async () => {
    try {
      const r = await api.organizarFases(obra.id);
      mudou();
      avisarFeito(`Obra prevista em ${r.fases.length} fases${r.estimadas ? ` (${r.estimadas} estimadas)` : ""}. O cronograma já sai da fundação à entrega.`, r.registro_id);
    } catch (e) {
      avisar(mensagemDe(e));
    }
  };

  const t = dado?.totais;
  const temOrcamento = !!dado?.versoes.length;
  // Estimativa × realidade: quanto do orçamento já é real (detalhado) e quanto ainda é estimativa da IA.
  const estimadoTotal = (dado?.itens ?? []).filter((i) => i.tipo === "item" && i.fonte === "estimativa").reduce((s, i) => s + i.total, 0);
  const totalOrc = t?.atual ?? 0;
  const pctReal = totalOrc ? Math.round(((totalOrc - estimadoTotal) / totalOrc) * 100) : 100;
  const [historico, setHistorico] = useState(false);
  // Um botão só no cabeçalho: as ações de arquivo e o histórico vão no "⋯"; aprovar fica à vista enquanto é a vez dele.
  const menu = [
    ...(podeOperar && (temOrcamento || materiais.length) ? [{ rotulo: "Importar planilha", acao: () => setModal("importar") }] : []),
    ...(podeOperar && temContrato ? [{ rotulo: "Prever obra completa (estimar fases)", acao: () => void organizarFases() }] : []),
    ...(dado && temOrcamento ? [{ rotulo: "Exportar CSV", acao: () => exportarCsv(obra, dado) }] : []),
    ...(dado && dado.versoes.length ? [{ rotulo: "Histórico de versões", acao: () => setHistorico(true) }] : []),
  ];

  return (
    <div className="page">
      <CabecalhoPagina
        titulo="Orçamento"
        selo={dado ? <span className={`pill ${emOrcamento || desfazendo ? "st-orc" : "st-ok"}`}>{desfazendo ? "desfazendo a aprovação" : !emOrcamento ? "aprovado" : temContrato ? "em orçamento" : "começando"}</span> : undefined}
        acao={
          podeOperar && podeAprovar ? (
            <button type="button" className="btn amb" onClick={() => setModal("aprovar")}>
              <Icone nome="check" tam={15} />
              Aprovar
            </button>
          ) : null
        }
        menu={menu}
        rotuloMenu="Mais ações do orçamento"
        {...(t && temOrcamento ? numerosOrcamento(t, obra) : {})}
      />
      {historico && dado ? (
        <Drawer titulo="Histórico de versões" fechar={() => setHistorico(false)}>
          <Versoes versoes={dado.versoes} atual={dado.totais.atual} todas />
        </Drawer>
      ) : null}

      {desfazendo ? <AvisoDesfazendo obra={obra} nItens={materiais.length} /> : null}

      {/* Estimativa × realidade: a 1ª previsão é especulação; conforme a pessoa detalha cada fase, vira real. */}
      {estimadoTotal > 0 ? (
        <div className="est-resumo">
          <div className="est-topo">
            <span><b>{pctReal}% detalhado</b> <span className="mut">· {100 - pctReal}% estimado pela IA</span></span>
            <span className="mut sm">{fmtReais(estimadoTotal)} em serviços estimados</span>
          </div>
          <div className="est-barra" role="progressbar" aria-valuenow={pctReal} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${pctReal}%` }} />
          </div>
          <p className="mut sm">Os serviços marcados <span className="pill estimativa">estimativa</span> são a previsão da IA (padrão de obra, cruzado com o SINAPI). Conforme você detalha cada fase, viram reais e o cronograma se ajusta.</p>
        </div>
      ) : null}

      {/* Logo abaixo do cabeçalho, onde estava o Aprovar: no fim da tela ficava a 1.800 px e quem aprovava não via.
          Antes de aprovar, o próximo passo é o próprio Aprovar; comprar só existe depois dele. */}
      {dado && !emOrcamento && !desfazendo && nFalta ? (
        <ProximoPasso
          obraId={obra.id}
          para="suprimentos"
          acao="Comprar o que vem primeiro"
          titulo={primeiraEtapa ? `A primeira etapa é ${primeiraEtapa}.` : "O orçamento está aprovado."}
          texto={`${plural(nFalta, "item ainda não foi comprado", "itens ainda não foram comprados")}.`}
        />
      ) : null}

      {orc.erro ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          {orc.erro}
        </div>
      ) : null}

      {orc.carregando && !dado ? (
        <div className="carregando" role="status">
          <Icone nome="loader" className="spin" tam={15} />
          Carregando o orçamento…
        </div>
      ) : dado && !dado.versoes.length ? (
        <div className="card vazio">
          <Icone nome="planilha" tam={24} />
          <h3>Nenhum orçamento ainda</h3>
          <p>
            Importe a planilha do orçamento do jeito que ela está, com etapas, itens e subtotais. Você confere a prévia antes de gravar, e o total fecha no
            centavo com a planilha.
          </p>
          {materiais.length ? (
            <p className="mut sm" style={{ marginTop: 10 }}>
              A lista de materiais já tem {plural(materiais.length, "insumo", "insumos")} ({fmtReais(totalMateriais)}): ela é o que comprar e estocar, não o
              orçamento por etapas.
            </p>
          ) : null}
          {podeOperar ? (
            <button type="button" className="btn amb" style={{ marginTop: 16 }} onClick={() => setModal("importar")}>
              Importar planilha
            </button>
          ) : null}
        </div>
      ) : dado ? (
        <>
          {soDasPranchas(dado.versoes) ? (
            <div className="aviso-atencao" role="note">
              <Icone nome="alert" tam={15} />
              <div>
                <p>
                  <b>Este orçamento tem só o que as pranchas trazem: estrutura e fundações.</b> Cobertura, piso, instalações e mão de obra ainda não estão nele.
                  {podeOperar && emOrcamento ? " Para completar, some a planilha da obra a ele." : ""}
                </p>
                {/* direto ao somar: é o caminho de quem quer completar, sem a pergunta "o que é esta planilha" */}
                {podeOperar && emOrcamento ? (
                  <button type="button" className="btn sm" onClick={() => setModal("somar")}>
                    Somar a planilha da obra
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {nSemPreco ? (
            <div className="aviso-atencao" role="note">
              <Icone nome="alert" tam={15} />
              <p>
                <b>{plural(nSemPreco, "item sem preço", "itens sem preço")}.</b> {nSemPreco === 1 ? "Ele entra" : "Eles entram"} com R$ 0,00, e o orçado atual fica abaixo do custo real.
                {podeOperar && !desfazendo ? " Toque no preço, na linha do item, para preencher." : ""}
              </p>
            </div>
          ) : null}
          {emOrcamento ? (
            <p className="mut sm">
              Aprovado, a obra passa para em andamento e o orçamento vira a referência de custo por etapa. Dá para desfazer pelo Histórico.
            </p>
          ) : null}
          {dado.etapas.length ? <ResumoOrcamento orc={dado} /> : null}
          <ListaEtapas obra={obra} orc={dado} nomeVersao={nomeVersao} />
          <BlocoAditivos orc={dado} nomeVersao={nomeVersao} fmtData={fmtData} />
          {/* Versão única (só o contrato, ex.: a Estrutura do projeto) não vira um bloco à parte — a etapa já a mostra.
              O bloco aparece quando há aditivos, que é quando a comparação entre versões passa a importar. */}
          {dado.versoes.length > 1 ? <Versoes versoes={dado.versoes} atual={dado.totais.atual} /> : null}
          {materiais.length ? (
            <p className="mut sm">
              A lista de materiais ({plural(materiais.length, "insumo", "insumos")}, {fmtReais(totalMateriais)}) fica em Suprimentos.
            </p>
          ) : null}
        </>
      ) : null}

      {modal === "importar" || modal === "somar" ? <ImportarOrcamento obra={obra} fechar={() => setModal(null)} inicio={modal === "somar" ? "somar" : undefined} /> : null}
      {modal === "aprovar" ? (
        <Confirmar titulo="Aprovar o orçamento?" confirmar={nSemPreco ? "Aprovar mesmo assim" : "Aprovar orçamento"} fechar={() => setModal(null)} aoConfirmar={aprovar}>
          <div className="prev-resumo">
            <div>
              <span className="prev-n">{fmtReais(temContrato ? (t?.atual ?? 0) : totalMateriais)}</span>
              <span>{temContrato ? "orçado atual" : "na lista de materiais"}</span>
            </div>
            <div>
              <span className="prev-n">{(temContrato ? (t?.n_itens ?? 0) : materiais.length).toLocaleString("pt-BR")}</span>
              <span>{temContrato ? ((t?.n_itens ?? 0) === 1 ? "item" : "itens") : materiais.length === 1 ? "insumo" : "insumos"}</span>
            </div>
          </div>
          {nSemPreco ? (
            <div className="aviso-atencao" role="note">
              <Icone nome="alert" tam={15} />
              <p>
                <b>{plural(nSemPreco, "item está sem preço", "itens estão sem preço")}.</b> {nSemPreco === 1 ? "Ele entra" : "Eles entram"} com R$ 0,00 na referência de custo da obra.
              </p>
            </div>
          ) : null}
          <p className="mut" style={{ margin: "4px 0 0" }}>
            {obra.nome} sai de em orçamento e passa para em andamento. Dá para desfazer pelo Histórico enquanto nada mudar depois.
          </p>
        </Confirmar>
      ) : null}
    </div>
  );
}

/** O Desfazer da aprovação ficou pela metade: Compras está incompleta até ele terminar, e é daqui que se continua. */
function AvisoDesfazendo({ obra, nItens }: { obra: Obra; nItens: number }) {
  const { podeOperar, mudou, avisar } = useCasca();
  const [ocupado, setOcupado] = useState(false);
  // fica no aviso, não num toast: é o que diz o que resolver (ex.: cancelar um pedido) antes de tentar de novo
  const [erro, setErro] = useState<string | null>(null);
  const continuar = async () => {
    setOcupado(true);
    setErro(null);
    try {
      await api.desfazerRegistro(obra.desfazendo_registro_id!);
      mudou();
      avisar("Aprovação desfeita. A obra voltou para em orçamento.");
    } catch (e) {
      setErro(mensagemDe(e));
      mudou();
    } finally {
      setOcupado(false);
    }
  };
  return (
    <div className="aviso-atencao" role="note">
      <Icone nome="alert" tam={15} />
      <div>
        <p>
          <b>O Desfazer da aprovação parou no meio: {plural(nItens, "item ainda em Compras", "itens ainda em Compras")}.</b> Enquanto ele não terminar, não dá para fazer pedido nem editar o orçamento.
        </p>
        {erro ? (
          <p className="campo-erro" role="alert">
            {erro}
          </p>
        ) : null}
        {podeOperar && obra.desfazendo_registro_id ? (
          <button type="button" className="btn sm" disabled={ocupado} aria-busy={ocupado} onClick={continuar}>
            {ocupado ? <Icone nome="loader" className="spin" tam={14} /> : null}
            Continuar o Desfazer
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** "R$ 2,07 mi", "R$ 23,3 mil": o valor curto do celular (o cheio aparece no toque). */
export function reaisCurtos(c: number): string {
  const r = Math.abs(c) / 100;
  const s = c < 0 ? "−" : "";
  if (r >= 1_000_000) return `${s}R$ ${(r / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (r >= 1_000) return `${s}R$ ${(r / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return fmtReais(c);
}

/**
 * Valor que no celular aparece curto ("R$ 2,07 mi"); tocar alterna para o cheio. Um só nó de texto, escolhido por JS:
 * o truque anterior (texto cheio com font-size 0 e o curto num ::after) quebrava no portal, que impõe tamanho mínimo de
 * fonte: o texto "escondido" voltava a ocupar espaço e empurrava o curto para fora ("R$ 2,0"). O cheio fica no
 * aria-label e no title.
 */
function Valor({ c, classe = "" }: { c: number; classe?: string }) {
  const [cheio, setCheio] = useState(false);
  const celular = useCelular();
  const curto = celular && !cheio;
  return (
    <button
      type="button"
      className={`of-valor ${classe}${cheio ? " cheio" : ""}`}
      aria-label={fmtReais(c)}
      title={fmtReais(c)}
      onClick={() => setCheio((x) => !x)}
    >
      {curto ? reaisCurtos(c) : fmtReais(c)}
    </button>
  );
}

/**
 * Os números do Orçamento na faixa do cabeçalho: o orçado atual grande (com a pílula do aditivo, o detalhe num toque)
 * e comprometido · realizado · saldo embaixo. A linha do contrato fecha a faixa.
 */
function numerosOrcamento(t: DadosOrcamento["totais"], obra: Obra): Pick<Parameters<typeof CabecalhoPagina>[0], "principal" | "numeros" | "rodapeNumeros"> {
  const saldo = t.saldo;
  const pctComp = t.atual ? (t.comprometido / t.atual) * 100 : 0;
  const verba = tagVerba(t.atual, obra.verba);
  // Só há aditivo depois de aprovar (antes, a planilha soma ao orçamento): o selo não aparece sem um de verdade.
  const pilula = t.aditivos ? `${fmtPctAditivo(t.aditivos_pct)} aditivo` : verba && verba.texto !== "bate com o contrato" ? verba.texto : null;
  // O vermelho é da comparação com o valor fechado; no selo de aditivo, o % é só informação.
  const acima = !t.aditivos && verba?.tom === "acima";
  return {
    principal: {
      rotulo: "Orçado atual",
      valor: fmtReais(t.atual),
      tag: pilula ? (
        <Ajuda rotulo="Detalhe do orçado atual" gatilho={pilula} classe={`of-pilula${acima ? " t-acima" : ""}`}>
          Orçamento inicial {fmtReais(t.contratado)}
          {t.aditivos ? ` ${comSinal(t.aditivos)} em aditivos` : ""} = {fmtReais(t.atual)}.
          {obra.verba ? ` Valor do contrato da obra: ${fmtReais(obra.verba)}${verba ? ` (${verba.texto})` : ""}.` : ""}
        </Ajuda>
      ) : undefined,
    },
    numeros: [
      { rotulo: "Comprometido", valor: <Valor c={t.comprometido} />, sub: `${pctComp.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` },
      {
        rotulo: (
          <>
            <span className="fx-rt">Realizado</span>
            <Ajuda rotulo="o realizado">
              Compras e serviços recebidos, pelo preço do pedido. O orçado é preço de contrato (com BDI e mão de obra), então o realizado de uma etapa não é o
              % executado dela: a medição física fica no Cronograma.
            </Ajuda>
          </>
        ),
        valor: <Valor c={t.realizado} />,
      },
      { rotulo: "Saldo", valor: <Valor c={saldo} classe={saldo < 0 ? "t-neg" : ""} /> },
    ],
    // cada valor numa peça sem quebra ("R$ 2.035.001,59" nunca parte); quem quebra é o separador
    rodapeNumeros: textoContrato(obra)
      ? textoContrato(obra)
          .split(" · ")
          .map((t, i) => (
            <span key={i}>
              {i ? " · " : ""}
              <span className="fx-nw">{t}</span>
            </span>
          ))
      : undefined,
  };
}

/** Os dados do contrato à vista, só leitura (antes ficavam na linha de dados da obra): o engenheiro consulta sem abrir a edição. */
export function textoContrato(o: Pick<Obra, "numero_contrato" | "verba" | "bdi" | "data_base">): string {
  return [
    o.numero_contrato ? `Contrato nº ${o.numero_contrato}` : null,
    o.verba ? fmtReais(o.verba) : null,
    o.bdi ? `BDI ${(o.bdi / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : null,
    o.data_base ? `data-base ${o.data_base.slice(5, 7)}/${o.data_base.slice(0, 4)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}


/** CSV do andamento por etapa, para o diretor abrir no Excel (o menu "⋯" do cabeçalho). */
function exportarCsv(obra: Obra, orc: DadosOrcamento) {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const nome = obra.nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  baixarCsv(`andamento-${nome}-${hoje}.csv`, csvAndamento(orc));
}

/**
 * Uma linha de orientação antes da lista de etapas, para bater o olho e saber o orçamento: quantas etapas e itens e a
 * maior etapa (onde está o dinheiro). Os números vêm prontos da API; a tela só acha o maior.
 */
function ResumoOrcamento({ orc }: { orc: DadosOrcamento }) {
  const maior = [...orc.etapas].filter((e) => e.descricao).sort((a, b) => b.atual - a.atual)[0];
  return (
    <p className="orc-resumo mut sm">
      <span className="fx-nw">{plural(orc.totais.n_etapas, "etapa", "etapas")}</span>
      {" · "}
      <span className="fx-nw">{plural(orc.totais.n_itens, "item", "itens")}</span>
      {maior ? (
        <>
          {" · maior etapa "}
          <span className="fx-nw">
            <b>{maior.descricao}</b> ({fmtReais(maior.atual)})
          </span>
        </>
      ) : null}
    </p>
  );
}

/* ---------------- versões: o contrato e os aditivos, com Desfazer ---------------- */

/**
 * A situação vem da API (`situacao`). Sem ela (API antiga), segue a cadeia: fora de vigência, a versão foi substituída
 * se outra que não foi desfeita a substituiu (pranchas → somar → reordenar: as duas primeiras), senão foi desfeita.
 */
export function situacaoDe(
  v: Pick<VersaoOrcamento, "id" | "ativa" | "situacao">,
  versoes: Pick<VersaoOrcamento, "id" | "ativa" | "situacao" | "substitui">[],
  vistas: Set<string> = new Set(),
): NonNullable<VersaoOrcamento["situacao"]> {
  if (v.situacao) return v.situacao;
  if (v.ativa) return "vigente";
  if (vistas.has(v.id)) return "desfeita";
  vistas.add(v.id);
  return versoes.some((o) => o.substitui === v.id && situacaoDe(o, versoes, vistas) !== "desfeita") ? "substituida" : "desfeita";
}

/**
 * À vista só o que vale hoje para conferir: o contrato vigente e o último aditivo vigente. Os aditivos vigentes mais
 * antigos, os desfeitos e os substituídos ficam no histórico recolhido (com o mesmo Desfazer, quando couber).
 */
export function separarVersoes<T extends Pick<VersaoOrcamento, "id" | "tipo" | "ativa" | "numero">>(versoes: T[]) {
  const contrato = versoes.find((v) => v.tipo === "contrato" && v.ativa);
  const ultimoAditivo = versoes.filter((v) => v.tipo === "aditivo" && v.ativa).sort((a, b) => b.numero - a.numero)[0];
  const ids = new Set([ultimoAditivo?.id, contrato?.id].filter(Boolean));
  const principais = [ultimoAditivo, contrato].filter((v): v is T => !!v);
  return { principais, historico: versoes.filter((v) => !ids.has(v.id)) };
}

function Versoes({ versoes, atual, todas = false }: { versoes: VersaoOrcamento[]; atual: number; todas?: boolean }) {
  const { podeOperar, mudou, avisarFeito } = useCasca();
  const [confirmando, setConfirmando] = useState<VersaoOrcamento | null>(null);
  const situacao = (v: VersaoOrcamento) => ({ vigente: "vigente", substituida: "substituída", desfeita: "desfeita" } as const)[situacaoDe(v, versoes)];

  /** O que muda de fato ao desfazer: com um clique só, a pessoa tirava o contrato de vigência sem saber. */
  const consequencia = (v: VersaoOrcamento) => {
    if (v.desfazer_texto) return v.desfazer_texto;
    if (v.tipo === "aditivo") return `O ${nomeVersao(v)} sai de vigência e o orçado atual volta para ${fmtReais(atual - v.total)}.`;
    const anterior = versoes.find((o) => o.id === v.substitui);
    const nomeAnterior = anterior ? rotuloVersao(anterior) : "";
    return anterior
      ? `O orçamento inicial sai de vigência e volta o anterior: ${fmtReais(anterior.total)}, ${plural(anterior.itens, "item", "itens")}${nomeAnterior ? ` (${nomeAnterior})` : ""}.`
      : "O orçamento inicial sai de vigência e a obra fica sem orçamento: os pedidos e saídas perdem a lista de etapas até importar de novo.";
  };

  const desfazer = async (v: VersaoOrcamento) => {
    await api.desfazerRegistro(v.registro_id!);
    setConfirmando(null);
    mudou();
    avisarFeito(`${nomeVersao(v)} desfeito.`, null);
  };

  const { principais, historico } = separarVersoes(versoes);
  const linha = (v: VersaoOrcamento) => {
          const st = situacao(v);
    return (
      <li key={v.id} className={`orc-v${v.ativa ? "" : " desfeito"}`}>
        <div className="orc-v-t">
          <div>
            <b>{nomeVersao(v)}</b>
            {rotuloVersao(v) ? <span>: {rotuloVersao(v)}</span> : null}
            <span className={`pill ${st === "vigente" ? "st-ok" : "st-orc"}`}>{st}</span>
          </div>
          <div className="mut sm">
            {[fmtData(v.data), plural(v.itens, "item", "itens"), plural(v.etapas, "etapa", "etapas"), arquivoEnviado(v.arquivo)].filter(Boolean).join(" · ")}
          </div>
        </div>
        <span className="num orc-v-n">{v.tipo === "aditivo" ? comSinal(v.total) : fmtReais(v.total)}</span>
        {podeOperar && v.ativa && v.registro_id ? (
          <button type="button" className="btn hist-b" onClick={() => setConfirmando(v)} aria-label={`Desfazer ${nomeVersao(v)}`}>
            <Icone nome="undo" tam={14} />
            Desfazer
          </button>
        ) : null}
      </li>
    );
  };

  return (
    <section aria-label="Versões do orçamento">
      <h3 className="sectit">Versões</h3>
      <ul className="card lista orc-versoes">{(todas ? versoes : principais).map(linha)}</ul>
      {/* desfeitas e substituídas só servem para conferir: recolhidas, para a lista mostrar o que vale hoje */}
      {!todas && historico.length ? (
        <details className="cobertos">
          <summary>
            <Icone nome="chevRight" tam={14} />
            Ver histórico de versões ({historico.length})
          </summary>
          <ul className="card lista orc-versoes">{historico.map(linha)}</ul>
        </details>
      ) : null}
      {confirmando ? (
        <Confirmar titulo={`Desfazer o ${nomeVersao(confirmando).toLowerCase()}?`} confirmar="Desfazer" fechar={() => setConfirmando(null)} aoConfirmar={() => desfazer(confirmando)}>
          <p style={{ margin: "4px 0 0" }}>{consequencia(confirmando)}</p>
        </Confirmar>
      ) : null}
    </section>
  );
}
