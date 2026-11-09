"use client";
/**
 * Os materiais que saem das pranchas: o que o projeto estrutural pede para sair do papel (aço por bitola, concreto,
 * forma, enchimento), cada um com o insumo do SINAPI que é o mesmo produto e o preço de referência na UF da obra.
 * Nada vai para o orçamento sozinho: o cartão mostra quantos saíram, e só o clique confirmado grava. Numa obra que já
 * tem contrato, a gravação vira aditivo, e isso não pode acontecer sem a pessoa ver.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/cliente";
import type { MaterialDoProjeto, Obra, Orcamento, PreviaVersao } from "@/lib/contrato";
import { fmtReais } from "@/lib/formato";
import { uuid7 } from "@/lib/ids";
import { tradutor, type MateriaisProjeto, type MaterialProjeto } from "@/lib/tradutor";
import { mensagemDe, useCasca } from "../contexto";
import { Confirmar, Drawer } from "../Dialogo";
import { Icone } from "../Icone";
import { Faixa } from "../ProximoPasso";
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

/** O cartão no fim do Projeto: quantos materiais saíram, ver a lista e, só com confirmação, levar para o orçamento. */
export function CartaoMateriais({ obra, dados }: { obra: Obra; dados: MateriaisProjeto | null }) {
  const { podeOperar, versao, mudou, avisar, avisarFeito } = useCasca();
  const todos = useMemo(() => (dados ? paraAObra(dados.itens) : []), [dados]);
  const tem = todos.length > 0;
  const orc = useCarregar(() => (tem ? api.orcamento(obra.id) : Promise.resolve(null)), [obra.id, versao, tem]);
  const [vendo, setVendo] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [previa, setPrevia] = useState<PreviaVersao | null>(null);
  // Uma chave por confirmação, nunca derivada do conteúdo: depois de um Desfazer, a mesma chave devolveria a versão
  // desfeita e nada entraria no orçamento. Repetir o POST com ela (rede caiu no meio) não duplica.
  const chave = useRef("");

  if (!dados || !tem || (!orc.dado && !orc.erro)) return null;
  const situacao = situacaoNoOrcamento(todos, orc.dado);
  const semQuantidade = dados.itens.length - todos.length;
  const semPreco = todos.filter((m) => !m.valor_unitario).length;

  // A prévia vem antes do diálogo: é a API que diz se entra como contrato ou aditivo, e por quanto.
  async function preparar() {
    setPreparando(true);
    try {
      const p = await api.estruturaDoProjeto(obra.id, todos, false);
      if (p.erros.length) return avisar(p.erros[0]!.mensagem, true);
      chave.current = uuid7();
      setPrevia(p);
    } catch (e) {
      avisar(mensagemDe(e), true);
    } finally {
      setPreparando(false);
    }
  }

  async function levar() {
    const r = await api.estruturaDoProjeto(obra.id, todos, true, chave.current);
    if (!r.aplicado) throw new Error(r.erros[0]?.mensagem ?? "Os materiais não entraram no orçamento. Tente de novo.");
    setPrevia(null);
    mudou();
    avisarFeito(`Materiais das pranchas no orçamento, como ${r.tipo === "aditivo" ? "aditivo" : "contrato"}.`, r.registro_id);
  }

  const ver = (
    <button type="button" className="btn" onClick={() => setVendo(true)}>
      Ver
    </button>
  );
  return (
    <>
      {situacao === "igual" ? (
        <Faixa rotulo="Materiais das pranchas" titulo={`${plural(todos.length, "material das pranchas já está", "materiais das pranchas já estão")} no orçamento.`}>
          {ver}
        </Faixa>
      ) : (
        <Faixa
          rotulo="Materiais das pranchas"
          titulo={`${plural(todos.length, "material saiu das pranchas", "materiais saíram das pranchas")}.`}
          texto={situacao === "anterior" ? "O orçamento ainda tem a Estrutura de pranchas anteriores." : "Só entram no orçamento se você levar."}
        >
          {ver}
          {podeOperar ? (
            <button type="button" className="btn" disabled={preparando} aria-busy={preparando} onClick={preparar}>
              {preparando ? <Icone nome="loader" className="spin" tam={14} /> : null}
              Levar para o orçamento…
            </button>
          ) : null}
        </Faixa>
      )}
      {vendo ? (
        <Drawer titulo="Materiais das pranchas" fechar={() => setVendo(false)}>
          <ListaMateriais dados={dados} />
        </Drawer>
      ) : null}
      {previa ? (
        <Confirmar
          titulo="Levar os materiais para o orçamento?"
          confirmar={previa.tipo === "aditivo" ? `Lançar aditivo de ${fmtReais(previa.total)}` : "Levar para o orçamento"}
          fechar={() => setPrevia(null)}
          aoConfirmar={levar}
        >
          <div className="prev-resumo">
            <div>
              <span className="prev-n">{fmtReais(previa.total)}</span>
              <span>{previa.tipo === "aditivo" ? "de aditivo" : "no contrato"}</span>
            </div>
            <div>
              <span className="prev-n">{previa.n_itens.toLocaleString("pt-BR")}</span>
              <span>{previa.n_itens === 1 ? "item" : "itens"}</span>
            </div>
          </div>
          <p style={{ margin: "4px 0 0" }}>
            {previa.tipo === "aditivo"
              ? `Esta obra já tem contrato: os materiais entram como aditivo, na etapa ${ETAPA}, e somam ao orçado atual.`
              : `Os materiais viram a etapa ${ETAPA} e o contrato desta obra.`}
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
        </Confirmar>
      ) : null}
    </>
  );
}
