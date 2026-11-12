"use client";
/**
 * Os materiais que saem das pranchas: o que o projeto estrutural pede para sair do papel (aço por bitola, concreto,
 * forma, enchimento), cada um com o insumo do SINAPI que é o mesmo produto e o preço de referência na UF da obra.
 * Nada vai para o orçamento sozinho: o cartão mostra quantos saíram, e só o clique confirmado grava. Numa obra que já
 * tem orçamento, a gravação soma a ele (antes de aprovar) ou vira aditivo (depois), e isso não pode acontecer sem a
 * pessoa ver; o que parece repetir um item do orçamento vem marcado para ficar de fora.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/cliente";
import type { ItemPrevia, MaterialDoProjeto, Obra, Orcamento, PreviaVersao } from "@/lib/contrato";
import { fmtReais } from "@/lib/formato";
import { uuid7 } from "@/lib/ids";
import { tradutor, type MateriaisProjeto, type MaterialProjeto } from "@/lib/tradutor";
import { mensagemDe, useCasca } from "../contexto";
import { Confirmar, Drawer } from "../Dialogo";
import { Icone } from "../Icone";
import { Faixa, LinkTela, ProximoPasso } from "../ProximoPasso";
import { useCarregar } from "../useCarregar";
import s from "./projeto.module.css";

/** O nome do insumo na obra: legível em Compras, estável entre envios (reenviar atualiza, não duplica) e com o código. */
export function nomeNaObra(m: MaterialProjeto): string {
  return m.referencia ? `${m.especificacao} (SINAPI ${m.referencia.codigo})` : m.especificacao;
}

/** Só vai para a obra o que tem quantidade: vigota sem quantidade é para confirmar com o fornecedor. */
export function paraAObra(itens: MaterialProjeto[]): MaterialDoProjeto[] {
  return itens
    .filter((m) => m.quantidade > 0)
    .map((m) => ({
      nome: nomeNaObra(m),
      unidade: m.unidade,
      quantidade: Math.round(m.quantidade * 1000),
      valor_unitario: m.referencia?.preco_centavos ?? 0,
    }));
}

const ETAPA = "Estrutura";
const assinatura = (itens: Pick<MaterialDoProjeto, "nome" | "quantidade" | "valor_unitario">[]) =>
  itens
    .map((m) => `${m.nome}|${m.quantidade}|${m.valor_unitario}`)
    .sort()
    .join(";");

/**
 * Estes materiais já estão no orçamento? "igual" esconde o botão: lançar de novo somaria um aditivo com os mesmos
 * materiais. "anterior" é uma Estrutura de outras pranchas, que continua valendo se a pessoa lançar esta.
 */
export function situacaoNoOrcamento(materiais: MaterialDoProjeto[], orc: Orcamento | null): "fora" | "igual" | "anterior" {
  const estruturas = (orc?.versoes ?? []).filter((v) => v.ativa && v.descricao === ETAPA);
  if (!estruturas.length) return "fora";
  const estes = assinatura(materiais);
  const lancada = estruturas.some(
    (v) =>
      assinatura(
        orc!.itens.filter((i) => i.versao_id === v.id && i.tipo === "item").map((i) => ({ nome: i.descricao, quantidade: i.quantidade, valor_unitario: i.valor_unitario })),
      ) === estes,
  );
  return lancada ? "igual" : "anterior";
}

const unidade = (u: string) => ({ m3: "m³", m2: "m²" })[u] ?? u;

const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

/** Os materiais das folhas já lidas. Fica na tela do Projeto porque a aba Materiais e o cartão mostram a mesma leitura. */
export function useMateriais(ids: string[], uf: string) {
  const [dados, setDados] = useState<MateriaisProjeto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const chaveIds = ids.join(",");

  useEffect(() => {
    if (!chaveIds) return;
    let vivo = true;
    // A leitura anterior não vale para as folhas novas: com ela na tela, o botão levaria materiais velhos ao orçamento.
    setDados(null);
    setErro(null);
    tradutor
      .materiais(chaveIds.split(","), uf)
      .then((d) => vivo && setDados(d))
      .catch((e) => vivo && setErro((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [chaveIds, uf]);

  return { dados: chaveIds ? dados : null, erro: chaveIds ? erro : null, semFolhas: !chaveIds };
}

const SEM_FOLHA_DE_DETALHE = "Os materiais aparecem quando houver folha de detalhamento (quadro de aço, concreto e forma) no pacote.";

/** A aba Materiais do painel: só lista. */
export function Materiais({ dados, erro, semFolhas }: { dados: MateriaisProjeto | null; erro: string | null; semFolhas: boolean }) {
  if (erro) {
    return (
      <div className="aviso-erro" role="alert">
        <Icone nome="alert" tam={15} />
        <span>{erro}</span>
      </div>
    );
  }
  if (semFolhas) return <p className={s.explica}>{SEM_FOLHA_DE_DETALHE}</p>;
  if (!dados) {
    return (
      <div className="carregando" role="status">
        <Icone nome="loader" className="spin" />
        Levantando os materiais do projeto…
      </div>
    );
  }
  if (!dados.itens.length) return <p className={s.explica}>{SEM_FOLHA_DE_DETALHE}</p>;
  return <ListaMateriais dados={dados} />;
}

function ListaMateriais({ dados }: { dados: MateriaisProjeto }) {
  const ref = dados.referencia;
  return (
    <>
      <div className={s.matCab}>
        <span>
          {ref ? (
            <>
              Preços de referência: <b>SINAPI {ref.mes.split("-").reverse().join("/")}</b> · {ref.uf}
            </>
          ) : (
            "Sem a base SINAPI neste ambiente: materiais sem código e sem preço."
          )}
        </span>
        {dados.total_referencia_centavos ? <b className={s.matTotal}>{fmtReais(dados.total_referencia_centavos)}</b> : null}
      </div>
      <ul className={s.materiais} aria-label="Materiais do projeto">
        {dados.itens.map((m) => (
          <li key={m.chave}>
            <div className={s.matLinha}>
              <b>{m.especificacao}</b>
              <span className="num">{m.quantidade > 0 ? `${m.quantidade.toLocaleString("pt-BR")} ${unidade(m.unidade)}` : "a confirmar"}</span>
            </div>
            {m.referencia ? (
              <span className={s.deonde}>
                SINAPI {m.referencia.codigo}
                {m.referencia.preco_centavos != null ? ` · ${fmtReais(m.referencia.preco_centavos)}/${unidade(m.unidade)}` : " · sem preço nesta UF"}
                {m.referencia.total_centavos ? ` · ${fmtReais(m.referencia.total_centavos)}` : ""}
              </span>
            ) : (
              <span className={s.resp}>Sem item avulso no SINAPI: cotar com o fornecedor</span>
            )}
            {m.ajuste ? <span className={s.falta}>{m.ajuste}</span> : null}
            {m.nota ? <span className={s.resp}>{m.nota}</span> : null}
          </li>
        ))}
      </ul>
      {dados.avisos.map((a) => (
        <p key={a} className={s.explica}>
          {a}
        </p>
      ))}
    </>
  );
}

/**
 * O próximo passo do Projeto, um por vez e no topo da tela: primeiro levar os materiais; levados, ver o orçamento.
 * Pranchas que mudaram depois de levar não empurram outro aditivo: levar de novo fica como opção, sem destaque.
 */
export function CartaoMateriais({ obra, dados, erro }: { obra: Obra; dados: MateriaisProjeto | null; erro?: string | null }) {
  const { podeOperar, versao, mudou, avisar, avisarFeito } = useCasca();
  const todos = useMemo(() => (dados ? paraAObra(dados.itens) : []), [dados]);
  const tem = todos.length > 0;
  const orc = useCarregar(() => (tem ? api.orcamento(obra.id) : Promise.resolve(null)), [obra.id, versao, tem]);
  const situacao = situacaoNoOrcamento(todos, orc.dado);
  const levado = !!orc.dado && situacao === "igual";
  // O botão clicado some ao levar: o foco e o olhar vão para o que entrou no lugar, em vez de ficar só o aviso.
  const irAoOrcamento = useRef<HTMLAnchorElement>(null);
  const acabouDeLevar = useRef(false);
  useEffect(() => {
    if (!levado || !acabouDeLevar.current) return;
    acabouDeLevar.current = false;
    irAoOrcamento.current?.focus({ preventScroll: true });
  }, [levado]);
  const [vendo, setVendo] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [previa, setPrevia] = useState<PreviaVersao | null>(null);
  // Os marcados "não levar": a API os tira da prévia, a cópia fica aqui para a caixa continuar à vista e desmarcável.
  const [ignorados, setIgnorados] = useState<Record<string, ItemPrevia>>({});
  // Vale até dar certo: se a API gravou e a resposta se perdeu, repetir com a mesma chave não duplica o aditivo. Depois
  // de gravar ela é trocada, porque depois de um Desfazer a mesma chave devolveria a versão desfeita sem gravar nada.
  // Materiais diferentes pedem outra: a API recusa a chave já usada para outro conteúdo.
  const chave = useRef<{ conteudo: string; valor: string } | null>(null);

  // O upload do projeto é a aprovação: na 1ª vez (orçamento ainda sem nenhuma versão) os
  // materiais das pranchas entram sozinhos, sem o passo manual. Havendo orçamento, mudança de
  // prancha vira aditivo e segue pela mão — toda escrita cai no Histórico com Desfazer.
  const autoFluiu = useRef(false);
  const orcVazio = !!orc.dado && !(orc.dado.versoes ?? []).some((v) => v.ativa);
  useEffect(() => {
    if (autoFluiu.current || !podeOperar || !tem || !orcVazio || situacao !== "fora") return;
    autoFluiu.current = true;
    void (async () => {
      try {
        const r = await api.estruturaDoProjeto(obra.id, todos, true, uuid7(), []);
        if (!r.aplicado) return void (autoFluiu.current = false);
        acabouDeLevar.current = true;
        mudou();
        avisarFeito(`${plural(todos.length, "material das pranchas entrou", "materiais das pranchas entraram")} no orçamento.`, r.registro_id);
      } catch {
        autoFluiu.current = false; // a próxima releitura tenta de novo; a chave idempotente evita duplicar
      }
    })();
  }, [podeOperar, tem, orcVazio, situacao, obra.id, todos, mudou, avisarFeito]);

  if (erro || (dados && !tem)) {
    return <ProximoPasso obraId={obra.id} para="orcamento" acao="Ver o orçamento" titulo="As pranchas estão lidas." texto="Confira no orçamento o que já entrou e o que falta lançar." />;
  }
  if (!dados || (!orc.dado && !orc.erro)) return null;
  const semQuantidade = dados.itens.length - todos.length;
  const semPreco = todos.filter((m) => !m.valor_unitario).length;

  const ordens = (ign: Record<string, ItemPrevia>) => Object.keys(ign).map(Number).sort((a, b) => a - b);

  // A prévia vem antes do diálogo: é a API que diz se entra como orçamento inicial, soma ou aditivo, e por quanto.
  async function preparar(ign: Record<string, ItemPrevia> = {}) {
    setPreparando(true);
    try {
      const p = await api.estruturaDoProjeto(obra.id, todos, false, undefined, ordens(ign));
      if (p.erros.length) return avisar(p.erros[0]!.mensagem, true);
      // tirar um item muda o conteúdo gravado: a API recusa a mesma chave para outro conteúdo
      const conteudo = `${assinatura(todos)}|${ordens(ign).join(",")}`;
      if (chave.current?.conteudo !== conteudo) chave.current = { conteudo, valor: uuid7() };
      setIgnorados(ign);
      setPrevia(p);
    } catch (e) {
      avisar(mensagemDe(e), true);
    } finally {
      setPreparando(false);
    }
  }

  async function levar() {
    let r: PreviaVersao;
    try {
      r = await api.estruturaDoProjeto(obra.id, todos, true, chave.current!.valor, ordens(ignorados));
    } catch (e) {
      mudou(); // a resposta pode ter se perdido com a gravação feita: relê o orçamento para o cartão mostrar o que valeu
      throw e;
    }
    if (!r.aplicado) throw new Error(r.erros[0]?.mensagem ?? "Os materiais não entraram no orçamento. Tente de novo.");
    const somou = previa?.total_apos != null;
    chave.current = null;
    acabouDeLevar.current = true;
    setPrevia(null);
    setIgnorados({});
    mudou();
    avisarFeito(
      somou ? "Materiais das pranchas somados ao orçamento." : `Materiais das pranchas no orçamento, como ${r.tipo === "aditivo" ? "aditivo" : "orçamento inicial"}.`,
      r.registro_id,
      { fixo: somou },
    );
  }

  const alternar = (i: ItemPrevia) => {
    const k = String(i.ordem);
    const { [k]: tirado, ...resto } = ignorados;
    void preparar(tirado ? resto : { ...ignorados, [k]: i });
  };

  const ver = (
    <button type="button" className="btn" onClick={() => setVendo(true)}>
      Ver
    </button>
  );
  // Enquanto o auto-fluxo da 1ª vez roda, o botão manual some: a tela não oferece de novo o que já está entrando.
  const autoEntrando = orcVazio && situacao === "fora" && podeOperar;
  const destacarLevar = situacao === "fora" && podeOperar && !autoEntrando;
  const verOrcamento = situacao === "fora" && podeOperar ? null : (
    <LinkTela obraId={obra.id} para="orcamento" ref={irAoOrcamento}>
      Ver o orçamento
    </LinkTela>
  );
  return (
    <>
      <Faixa
        rotulo="Próximo passo"
        titulo={levado ? `${plural(todos.length, "material das pranchas já está", "materiais das pranchas já estão")} no orçamento.` : `${plural(todos.length, "material saiu das pranchas", "materiais saíram das pranchas")}.`}
        texto={levado ? "Confira os preços e o que falta lançar." : autoEntrando ? "Entrando no orçamento automaticamente…" : situacao === "anterior" ? "O orçamento ainda tem a Estrutura de pranchas anteriores." : "Só entram no orçamento se você levar."}
      >
        {ver}
        {autoEntrando ? (
          <span className="btn" aria-busy="true" aria-live="polite">
            <Icone nome="loader" className="spin" tam={14} /> Entrando…
          </span>
        ) : podeOperar && !levado ? (
          <button type="button" className={destacarLevar ? "btn amb" : "btn"} disabled={preparando} aria-busy={preparando} onClick={() => preparar()}>
            {preparando ? <Icone nome="loader" className="spin" tam={14} /> : null}
            Levar para o orçamento…
          </button>
        ) : null}
        {verOrcamento}
      </Faixa>
      {vendo ? (
        <Drawer titulo="Materiais das pranchas" fechar={() => setVendo(false)}>
          <ListaMateriais dados={dados} />
        </Drawer>
      ) : null}
      {previa ? (
        <Confirmar
          titulo="Levar os materiais para o orçamento?"
          confirmar={
            previa.total_apos != null
              ? `Somar ao orçamento (+${fmtReais(previa.total)})`
              : previa.tipo === "aditivo"
                ? `Lançar aditivo de ${fmtReais(previa.total)}`
                : "Levar para o orçamento"
          }
          fechar={() => {
            setPrevia(null);
            setIgnorados({});
          }}
          aoConfirmar={levar}
        >
          <div className="prev-resumo">
            <div>
              <span className="prev-n">{fmtReais(previa.total)}</span>
              <span>{previa.total_apos != null ? "a somar" : previa.tipo === "aditivo" ? "de aditivo" : "no orçamento inicial"}</span>
            </div>
            <div>
              <span className="prev-n">{previa.n_itens.toLocaleString("pt-BR")}</span>
              <span>{previa.n_itens === 1 ? "item" : "itens"}</span>
            </div>
          </div>
          <p style={{ margin: "4px 0 0" }}>
            {previa.total_apos != null
              ? `Esta obra já tem orçamento, ainda não aprovado: os materiais somam a ele, na etapa ${ETAPA}, e ele fica com ${fmtReais(previa.total_apos)}.`
              : previa.tipo === "aditivo"
                ? `Esta obra já tem orçamento aprovado: os materiais entram como aditivo, na etapa ${ETAPA}, e somam ao orçado atual.`
                : `Os materiais viram a etapa ${ETAPA} do orçamento inicial desta obra.`}
            {situacao === "anterior" ? ` A ${ETAPA} de pranchas anteriores continua valendo: para trocar, desfaça a anterior antes.` : ""}
          </p>
          {semQuantidade || semPreco ? (
            <p className="mut sm" style={{ margin: "8px 0 0" }}>
              {[
                semQuantidade ? `${plural(semQuantidade, "material sem quantidade fica", "materiais sem quantidade ficam")} de fora.` : "",
                semPreco ? `${plural(semPreco, "material sem preço de referência entra", "materiais sem preço de referência entram")} com R$ 0,00.` : "",
              ]
                .filter(Boolean)
                .join(" ")}
            </p>
          ) : null}
          <RepetidosDasPranchas previa={previa} ignorados={ignorados} alternar={alternar} ocupado={preparando} />
        </Confirmar>
      ) : null}
    </>
  );
}

/** O que parece já estar no orçamento (o concreto e o aço da planilha da obra, por exemplo): levar de novo conta em dobro. */
function RepetidosDasPranchas(p: { previa: PreviaVersao; ignorados: Record<string, ItemPrevia>; alternar: (i: ItemPrevia) => void; ocupado: boolean }) {
  const lista = [...p.previa.itens.filter((i) => i.tipo === "item" && i.repetido_de), ...Object.values(p.ignorados)].sort((a, b) => a.ordem - b.ordem);
  if (!lista.length) return null;
  return (
    <div className="aviso-atencao" role="note" style={{ marginTop: 10 }}>
      <Icone nome="alert" tam={15} />
      <div>
        <p>
          <b>{lista.length === 1 ? "1 material parece já estar no orçamento." : `${lista.length} materiais parecem já estar no orçamento.`}</b> Levar de novo conta em
          dobro: marque o que deve ficar de fora.
        </p>
        <ul className="lista-repetidos">
          {lista.map((i) => (
            <li key={i.ordem}>
              <label className="adt-ignorar">
                <input type="checkbox" checked={String(i.ordem) in p.ignorados} disabled={p.ocupado} onChange={() => p.alternar(i)} />
                <span>
                  Não levar {i.descricao} <span className="mut">· no orçamento: {i.repetido_de!.descricao}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
