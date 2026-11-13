"use client";
/**
 * Aba Orçamento: a planilha da construtora como ela é, etapa → item, em versões (o contrato e os aditivos que somam a
 * ele). O cabeçalho responde "quanto foi contratado, quanto entrou de aditivo e quanto está orçado agora"; as somas
 * vêm prontas da API (GET /obras/{id}/orcamento), a tela só agrupa e filtra o que já chegou. Comprometido e Realizado
 * dependem de pedidos e notas, então só aparecem quando a obra estiver andando: aqui não se inventa número.
 */
import { Children, useState, type ReactNode } from "react";
import type { Obra, Orcamento as DadosOrcamento, VersaoOrcamento } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtReais } from "@/lib/formato";
import { mensagemDe, useCasca } from "./contexto";
import { Confirmar } from "./Dialogo";
import { CabecalhoTela } from "./orcamento/CabecalhoTela";
import { useCelular } from "./midia";
import { Icone } from "./Icone";
import { useCarregar } from "./useCarregar";
import { ImportarOrcamento } from "./obra/ImportarOrcamento";
import { tagVerba } from "./obra/verba";
import { BlocoAditivos, csvAndamento, reaisInteiros } from "./orcamento/Andamento";
import { baixarCsv } from "@/lib/csv";
import { ListaEtapas } from "./orcamento/ListaEtapas";
import { BotaoPlumo } from "./BotaoPlumo";
import { situacao } from "./suprimentos/Itens";
import s from "./orcamento/orcamento.module.css";


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
  const { versao, podeOperar, avisar, avisarFeito, mudou } = useCasca();
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
  const celular = useCelular();
  const { irParaTela } = useCasca();
  // Um botão só no cabeçalho: as ações de arquivo vão no "⋯"; aprovar fica à vista enquanto é a vez dele.
  const menu = [
    ...(podeOperar && (temOrcamento || materiais.length) ? [{ rotulo: "Importar planilha", acao: () => setModal("importar") }] : []),
    ...(podeOperar && temContrato ? [{ rotulo: "Prever obra completa (estimar fases)", acao: () => void organizarFases() }] : []),
    ...(dado && temOrcamento ? [{ rotulo: "Exportar CSV", acao: () => exportarCsv(obra, dado) }] : []),
  ];

  const vigentes = dado?.versoes.filter((v) => v.ativa) ?? [];
  const nAditivos = vigentes.filter((v) => v.tipo === "aditivo").length;
  const ultimaData = vigentes.map((v) => v.data ?? "").sort().at(-1);
  const verba = t ? tagVerba(t.atual, obra.verba) : null;
  const estado = desfazendo ? "desfazendo a aprovação" : !emOrcamento ? "aprovada" : temContrato ? "em orçamento" : "começando";
  // A linha de contexto do protótipo: qual versão é esta (inicial + aditivos), de quando, o estado e como fica contra
  // o valor fechado no contrato.
  const contexto = temOrcamento
    ? [`Versão ${1 + nAditivos}${ultimaData ? ` de ${fmtData(ultimaData).slice(0, 5)}` : ""}`, estado, verba?.texto].filter(Boolean).join(" · ")
    : undefined;

  return (
    <div className={`page ${s.tela}`}>
      <CabecalhoTela
        titulo="Orçamento"
        contexto={contexto}
        selo={dado ? <span className={`pill ${emOrcamento || desfazendo ? "st-orc" : "ok"}`}>{desfazendo ? "desfazendo" : !emOrcamento ? "aprovado" : temContrato ? "em orçamento" : "começando"}</span> : undefined}
        acoes={
          <>
            <BotaoPlumo rotulo="Perguntar sobre o orçamento" />
            {podeOperar && podeAprovar ? (
              <button type="button" className="btn amb" onClick={() => setModal("aprovar")}>
                <Icone nome="check" tam={15} />
                Aprovar orçamento
              </button>
            ) : null}
          </>
        }
        menu={menu}
        rotuloMenu="Mais ações do orçamento"
      />
      {/* no celular o Aprovar não cabe no cabeçalho: vem logo abaixo, onde quem aprova vê */}
      {celular && podeOperar && podeAprovar ? (
        <button type="button" className={`btn amb ${s.cheio}`} onClick={() => setModal("aprovar")}>
          <Icone nome="check" tam={15} />
          Aprovar orçamento
        </button>
      ) : null}
      {t && temOrcamento ? <FaixaOrcamento t={t} obra={obra} celular={celular} /> : null}

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
          <Etiquetas>
            {soDasPranchas(dado.versoes) ? (
              <Etiqueta tom="info">
                Tem só o que as pranchas trazem: estrutura e fundações. Cobertura, piso, instalações e mão de obra ainda não estão nele.
                {/* direto ao somar: é o caminho de quem quer completar, sem a pergunta "o que é esta planilha" */}
                {podeOperar && emOrcamento ? (
                  <button type="button" className={s.etqAcao} onClick={() => setModal("somar")}>
                    Somar a planilha da obra
                  </button>
                ) : null}
              </Etiqueta>
            ) : null}
            {/* O próximo passo depois de aprovar vira a etiqueta azul do protótipo, um link para Compras: no fim da
                tela ficava a 1.800 px e quem aprovava não via. Antes de aprovar, comprar não existe. */}
            {!emOrcamento && !desfazendo && nFalta ? (
              <EtiquetaPasso obraId={obra.id} etapa={primeiraEtapa} nFalta={nFalta} />
            ) : null}
            {nSemPreco ? (
              <Etiqueta tom="atencao">
                <b>{plural(nSemPreco, "item sem preço", "itens sem preço")}</b>: {nSemPreco === 1 ? "entra" : "entram"} com R$ 0,00 e o orçado atual fica abaixo do custo real.
                {podeOperar && !desfazendo ? " Toque no preço, na linha do item, para preencher." : ""}
              </Etiqueta>
            ) : null}
            {emOrcamento ? (
              <Etiqueta tom="neutro">Aprovado, a obra passa para em andamento e o orçamento vira a referência de custo por etapa. Dá para desfazer pelo Histórico.</Etiqueta>
            ) : null}
            {/* importada a lista de materiais, ela não aparece aqui (não é o orçamento por etapas): dizer onde ficou */}
            {materiais.length ? (
              <Etiqueta tom="neutro">
                A lista de materiais ({plural(materiais.length, "insumo", "insumos")}, {fmtReais(totalMateriais)}) fica em Compras.
              </Etiqueta>
            ) : null}
          </Etiquetas>
          <ListaEtapas obra={obra} orc={dado} nomeVersao={nomeVersao} />
          {/* Versões, aditivos e os dados do contrato não estão no protótipo: ficam recolhidos no fim, para conferir */}
          {dado.versoes.length >= 1 || nAditivos || textoContrato(obra) ? (
            <details className={s.recolhido}>
              <summary>
                <Icone nome="chevRight" tam={14} />
                {nAditivos ? `Versões e aditivos (${dado.versoes.length})` : dado.versoes.length ? "Versões do orçamento" : "Dados do contrato"}
              </summary>
              <div className={s.recolhidoCorpo}>
                {textoContrato(obra) ? <p className={s.contrato}>{textoContrato(obra)}</p> : null}
                <BlocoAditivos orc={dado} nomeVersao={nomeVersao} fmtData={fmtData} />
                {dado.versoes.length ? <Versoes versoes={dado.versoes} atual={dado.totais.atual} /> : null}
              </div>
            </details>
          ) : null}
          {celular ? (
            <button type="button" className={`btn ${s.plumoCheio}`} onClick={() => irParaTela("conversa")}>
              <Icone nome="spark" tam={16} />
              Perguntar sobre o orçamento
            </button>
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
 * Os quatro números do Orçamento numa faixa só, como no protótipo: orçado atual (inicial + aditivos embaixo),
 * comprometido (% do orçado), realizado e saldo a comprometer (o valor fechado embaixo, sem conta de margem: dinheiro
 * se calcula na API). Em reais
 * inteiros; o valor com centavos fica no title. No celular, 2 × 2 e só rótulo e valor.
 */
function FaixaOrcamento({ t, obra, celular }: { t: DadosOrcamento["totais"]; obra: Obra; celular: boolean }) {
  const pctComp = t.atual ? (t.comprometido / t.atual) * 100 : 0;
  const celulas: { rotulo: string; valor: number; sub?: ReactNode; neg?: boolean }[] = [
    {
      rotulo: "Orçado atual",
      valor: t.atual,
      sub: t.aditivos ? (
        <>
          inicial <span className="fx-nw">{reaisInteiros(t.contratado)}</span> {t.aditivos < 0 ? "−" : "+"} aditivos <span className="fx-nw">{reaisInteiros(Math.abs(t.aditivos))}</span>
        </>
      ) : obra.verba ? (
        <>
          contrato <span className="fx-nw">{reaisInteiros(obra.verba)}</span>
        </>
      ) : undefined,
    },
    { rotulo: "Comprometido", valor: t.comprometido, sub: `${pctComp.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do orçado` },
    // o orçado é preço de contrato (com BDI e mão de obra): o realizado de uma etapa não é o % executado dela
    { rotulo: "Realizado", valor: t.realizado, sub: "entregue e lançado" },
    {
      rotulo: celular ? "Saldo" : "Saldo a comprometer",
      valor: t.saldo,
      neg: t.saldo < 0,
      sub: obra.verba ? `valor fechado ${reaisInteiros(obra.verba)}` : undefined,
    },
  ];
  return (
    <section className={s.faixa} aria-label="Resumo do orçamento">
      <dl className={s.celulas}>
        {celulas.map((c) => (
          <div key={c.rotulo}>
            <dt>{c.rotulo}</dt>
            <dd className={c.neg ? "t-neg" : undefined} title={fmtReais(c.valor)}>
              {c.valor < 0 ? `−${reaisInteiros(-c.valor)}` : reaisInteiros(c.valor)}
            </dd>
            {/* a legenda num dd próprio: <small> solto dentro do grupo do dl é marcação inválida */}
            {c.sub && !celular ? (
              <dd>
                <small>{c.sub}</small>
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}

/** O próximo passo depois de aprovar, na etiqueta azul: a primeira etapa e quantos itens faltam, com o link para Compras. */
function EtiquetaPasso({ obraId, etapa, nFalta }: { obraId: string; etapa?: string; nFalta: number }) {
  const { irParaTela } = useCasca();
  const busca = new URLSearchParams({ obra: obraId, tela: "suprimentos" });
  return (
    <section className={`${s.etq} ${s.info}`} aria-label="Próximo passo">
      <span className={s.bola} aria-hidden="true" />
      <span>
        {etapa ? `A primeira etapa é ${etapa}: ` : "Orçamento aprovado: "}
        {plural(nFalta, "item ainda não foi comprado", "itens ainda não foram comprados")}.{" "}
        {/* link de verdade, para abrir em outra aba; o clique simples troca a tela sem recarregar */}
        <a
          className={s.etqAcao}
          href={`/?${busca}`}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            irParaTela("suprimentos");
          }}
        >
          Comprar o que vem primeiro
        </a>
      </span>
    </section>
  );
}

/** Os avisos da tela em etiquetas curtas, numa linha que quebra: avisam sem empurrar a planilha para baixo. */
function Etiquetas({ children }: { children: ReactNode }) {
  const itens = Children.toArray(children).filter(Boolean);
  return itens.length ? <div className={s.etiquetas}>{itens}</div> : null;
}

function Etiqueta({ tom, children }: { tom: "info" | "atencao" | "neutro"; children: ReactNode }) {
  return (
    // a dica neutra não é aviso: só o que pede atenção é anunciado como nota
    <p className={`${s.etq} ${s[tom]}`} role={tom === "neutro" ? undefined : "note"}>
      <span className={s.bola} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** Os dados do contrato à vista, só leitura (antes ficavam na linha de dados da obra): o engenheiro consulta sem abrir a edição. */
export function textoContrato(o: Pick<Obra, "numero_contrato" | "verba" | "bdi" | "data_base">): string {
  return [
    // sem o número, o valor sozinho embaixo da faixa não diz o que é: o rótulo vai junto
    o.numero_contrato ? `Contrato nº ${o.numero_contrato}` : o.verba ? `Contrato ${fmtReais(o.verba)}` : null,
    o.numero_contrato && o.verba ? fmtReais(o.verba) : null,
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
