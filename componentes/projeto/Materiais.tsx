"use client";
/**
 * Aba Materiais do Projeto 3D: o que o projeto estrutural pede para sair do papel (aço por bitola, concreto, forma,
 * enchimento), cada material com o insumo do SINAPI que é o mesmo produto e o preço de referência na UF da obra.
 * Entender os materiais já os leva ao Orçamento (viram a versão «Estrutura»); comprar é só depois de aprovar o
 * orçamento. Esta tela só lista — não lança nada por botão.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/cliente";
import type { MaterialDoProjeto, Obra } from "@/lib/contrato";
import { fmtReais } from "@/lib/formato";
import { tradutor, type MateriaisProjeto, type MaterialProjeto } from "@/lib/tradutor";
import { useCasca } from "../contexto";
import { Icone } from "../Icone";
import s from "./projeto.module.css";

const ORIGEM = "projeto estrutural";

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

/** Assinatura estável do conjunto de materiais: reabrir a aba com o mesmo projeto não relança a Estrutura. */
function assinatura(itens: MaterialDoProjeto[]): string {
  const txt = itens.map((m) => `${m.nome}|${m.unidade}|${m.quantidade}|${m.valor_unitario}`).join(";");
  let h = 5381;
  for (let i = 0; i < txt.length; i++) h = ((h << 5) + h + txt.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const unidade = (u: string) => ({ m3: "m³", m2: "m²" })[u] ?? u;

export function Materiais({ obra, ids }: { obra: Obra; ids: string[] }) {
  const { podeOperar, mudou, avisarFeito } = useCasca();
  const [dados, setDados] = useState<MateriaisProjeto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const aplicado = useRef<string>("");
  const chaveIds = ids.join(",");

  useEffect(() => {
    if (!chaveIds) return;
    let vivo = true;
    setErro(null);
    tradutor
      .materiais(chaveIds.split(","), obra.uf || "SP")
      .then((d) => vivo && setDados(d))
      .catch((e) => vivo && setErro((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [chaveIds, obra.uf]);

  // O projeto inteiro (o que tem quantidade) é a versão "Estrutura" do orçamento.
  const todos = useMemo(() => (dados ? paraAObra(dados.itens) : []), [dados]);

  // Entender os materiais já os leva ao Orçamento: assim que a lista com preço fica pronta, ela vira a versão
  // "Estrutura" (uma vez por conteúdo — reabrir a aba não duplica). Comprar é só depois de aprovar o orçamento.
  useEffect(() => {
    if (!podeOperar || !todos.length) return;
    const chave = `estrutura:${obra.id}:${assinatura(todos)}`;
    if (aplicado.current === chave) return;
    const marca = `canteiro:estrutura:${obra.id}`;
    try {
      if (localStorage.getItem(marca) === chave) {
        aplicado.current = chave;
        return;
      }
    } catch {
      /* sem localStorage: aplica assim mesmo (a chave torna idempotente no servidor) */
    }
    aplicado.current = chave;
    let vivo = true;
    api
      .estruturaDoProjeto(obra.id, todos, true, chave)
      .then((r) => {
        if (!vivo) return;
        try {
          localStorage.setItem(marca, chave);
        } catch {
          /* ignore */
        }
        if (r.aplicado) {
          mudou();
          avisarFeito("Materiais do projeto no Orçamento (etapa «Estrutura»). Aprove o orçamento para comprar.", r.registro_id ?? undefined);
        }
      })
      .catch(() => {
        aplicado.current = ""; // falhou: deixa tentar de novo numa próxima abertura
      });
    return () => {
      vivo = false;
    };
  }, [obra.id, todos, podeOperar, mudou, avisarFeito]);

  if (erro) {
    return (
      <div className="aviso-erro" role="alert">
        <Icone nome="alert" tam={15} />
        <span>{erro}</span>
      </div>
    );
  }
  if (!dados) {
    return (
      <div className="carregando" role="status">
        <Icone nome="loader" className="spin" />
        Levantando os materiais do projeto…
      </div>
    );
  }
  if (!dados.itens.length) {
    return <p className={s.explica}>Os materiais aparecem quando houver folha de detalhamento (quadro de aço, concreto e forma) no pacote.</p>;
  }

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
      {podeOperar ? (
        <p className={s.explica}>
          Estes materiais já estão no <b>Orçamento</b> como a etapa «Estrutura». Para comprar, aprove o orçamento.
        </p>
      ) : null}
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
