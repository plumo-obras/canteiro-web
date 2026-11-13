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
import type { MaterialDoProjeto, Obra, Orcamento } from "@/lib/contrato";
import { fmtReais } from "@/lib/formato";
import { uuid7 } from "@/lib/ids";
import { tradutor, type MateriaisProjeto, type MaterialProjeto } from "@/lib/tradutor";
import { useCasca } from "../contexto";
import { Drawer } from "../Dialogo";
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
/**
 * Onde os materiais das pranchas estão em relação ao orçamento e ao cronograma, e a entrada automática da 1ª vez.
 *
 * O upload do projeto é a aprovação: na 1ª vez (orçamento ainda sem nenhuma versão) os materiais das pranchas entram
 * no orçamento sozinhos, sem passo manual — toda escrita cai no Histórico com Desfazer. Só na 1ª vez: depois o
 * orçamento é reorganizado em fases (prever obra, cronograma), e re-levar aqui apagaria esse trabalho.
 *
 * `autoFluir` é de quem fica montado com a página (o Projeto); o cartão da gaveta só lê, para a entrada não ser feita
 * duas vezes por dois donos.
 */
export function useFluxoMateriais(obra: Obra, dados: MateriaisProjeto | null, autoFluir = true) {
  const { podeOperar, versao, mudou, avisarFeito } = useCasca();
  const todos = useMemo(() => (dados ? paraAObra(dados.itens) : []), [dados]);
  const tem = todos.length > 0;
  const orc = useCarregar(() => (tem ? api.orcamento(obra.id) : Promise.resolve(null)), [obra.id, versao, tem]);
  const cron = useCarregar(() => (tem ? api.cronograma(obra.id) : Promise.resolve(null)), [obra.id, versao, tem]);
  const situacao = situacaoNoOrcamento(todos, orc.dado);
  const levado = !!orc.dado && situacao === "igual";
  const temCronograma = !!cron.dado?.inicio && (cron.dado.meses ?? 0) > 0;
  const orcVazio = !!orc.dado && !(orc.dado.versoes ?? []).some((v) => v.ativa);
  // Enquanto a entrada da 1ª vez roda, quem mostra o próximo passo diz "Entrando…".
  const entrando = orcVazio && situacao === "fora" && podeOperar;
  const acabouDeFluir = useRef(false);
  const autoFluiu = useRef(false);
  useEffect(() => {
    if (!autoFluir || autoFluiu.current || !podeOperar || !tem || !orcVazio || situacao !== "fora") return;
    autoFluiu.current = true;
    void (async () => {
      try {
        const r = await api.estruturaDoProjeto(obra.id, todos, true, uuid7(), []);
        if (!r.aplicado) return void (autoFluiu.current = false);
        acabouDeFluir.current = true;
        mudou();
        avisarFeito(`${plural(todos.length, "material das pranchas entrou", "materiais das pranchas entraram")} no orçamento.`, r.registro_id);
      } catch {
        autoFluiu.current = false;
      }
    })();
  }, [autoFluir, podeOperar, tem, orcVazio, situacao, obra.id, todos, mudou, avisarFeito]);
  return { todos, tem, orc, situacao, levado, temCronograma, entrando, acabouDeFluir };
}

export function CartaoMateriais({ obra, dados, erro, autoFluir = true }: { obra: Obra; dados: MateriaisProjeto | null; erro?: string | null; autoFluir?: boolean }) {
  const { podeOperar, irParaTela } = useCasca();
  const { todos, tem, orc, levado, temCronograma, entrando, acabouDeFluir } = useFluxoMateriais(obra, dados, autoFluir);
  // Entrados os materiais, o foco vai para o próximo passo (o cronograma), não para o aviso.
  const irAoProximo = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!levado || !acabouDeFluir.current) return;
    acabouDeFluir.current = false;
    irAoProximo.current?.focus({ preventScroll: true });
  }, [levado, acabouDeFluir]);
  const [vendo, setVendo] = useState(false);

  if (erro || (dados && !tem)) {
    return <ProximoPasso obraId={obra.id} para="orcamento" acao="Ver o orçamento" titulo="As pranchas estão lidas." texto="Confira no orçamento o que já entrou e o que falta lançar." />;
  }
  if (!dados || (!orc.dado && !orc.erro)) return null;

  const ver = (
    <button type="button" className="btn" onClick={() => setVendo(true)}>
      Ver
    </button>
  );
  // Entrados os materiais, o próximo passo é a previsão de entrega: gerar o cronograma (ou, se já existe, abri-lo — sem
  // oferecer "gerar" de novo). Viewer fica com o orçamento.
  return (
    <>
      <Faixa
        rotulo="Próximo passo"
        titulo={levado ? `${plural(todos.length, "material das pranchas já está", "materiais das pranchas já estão")} no orçamento.` : `${plural(todos.length, "material saiu das pranchas", "materiais saíram das pranchas")}.`}
        texto={levado ? "Confira os preços e o que falta lançar." : entrando ? "Entrando no orçamento automaticamente…" : "Veja no orçamento o que já entrou."}
      >
        {ver}
        {!podeOperar ? (
          <LinkTela obraId={obra.id} para="orcamento">
            Ver o orçamento
          </LinkTela>
        ) : entrando ? (
          <span className="btn" aria-busy="true" aria-live="polite">
            <Icone nome="loader" className="spin" tam={14} /> Entrando…
          </span>
        ) : temCronograma ? (
          <button type="button" ref={irAoProximo} className="btn amb" onClick={() => irParaTela("cronograma")}>
            Ver o cronograma
          </button>
        ) : (
          <button type="button" ref={irAoProximo} className="btn amb" onClick={() => irParaTela("cronograma", { gerar: true })}>
            Gerar cronograma
          </button>
        )}
      </Faixa>
      {vendo ? (
        <Drawer titulo="Materiais das pranchas" fechar={() => setVendo(false)}>
          <ListaMateriais dados={dados} />
        </Drawer>
      ) : null}
    </>
  );
}

