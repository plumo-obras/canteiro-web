"use client";
/**
 * O que falta comprar, por etapa do orçamento: marca e faz o pedido. Quanto comprar vem pronto da conta da API
 * (`conta.comprar`); o valor é só a quantidade pelo preço do orçamento, a mesma multiplicação da linha do pedido.
 */
import { useMemo, useState } from "react";
import type { EtapaObra, ItemInsumo } from "@/lib/contrato";
import { fmtQtdUn, fmtReais } from "@/lib/formato";
import { totalLinha } from "../formularios/ModalNovoPedido";
import { useCasca } from "../contexto";
import { Icone } from "../Icone";
import s from "./compras.module.css";

/** O limite da API por pedido. */
const MAX_LINHAS = 50;

export interface GrupoFalta {
  chave: string;
  nome: string;
  itens: ItemInsumo[];
}

/** Agrupa o que falta comprar na ordem das etapas do orçamento; o que não tem etapa vem por último. */
export function faltaPorEtapa(itens: ItemInsumo[], etapas: EtapaObra[]): GrupoFalta[] {
  const falta = itens.filter((i) => i.conta.comprar > 0);
  const nomeDe = (c: string) => etapas.find((e) => e.etapa === c)?.descricao ?? `Etapa ${c}`;
  const chaves = [...new Set([...etapas.map((e) => e.etapa), ...falta.flatMap((i) => (i.insumo.etapa ? [i.insumo.etapa] : []))])];
  const grupos = chaves.map((c) => ({ chave: c, nome: nomeDe(c), itens: falta.filter((i) => i.insumo.etapa === c) }));
  grupos.push({ chave: "", nome: "Sem etapa", itens: falta.filter((i) => !i.insumo.etapa || !chaves.includes(i.insumo.etapa)) });
  return grupos.filter((g) => g.itens.length);
}

export const valorPeloOrcamento = (i: ItemInsumo) => totalLinha(i.conta.comprar, i.insumo.valor_unitario);

export function FaltaComprar(props: { itens: ItemInsumo[]; etapas: EtapaObra[]; fazerPedido: (marcados: ItemInsumo[]) => void; desfazendo?: boolean }) {
  const { itens, etapas, fazerPedido, desfazendo } = props;
  const { podeOperar: podeOperarConta } = useCasca();
  // Com o Desfazer da aprovação pela metade, a API recusa pedido novo: nem oferece.
  const podeOperar = podeOperarConta && !desfazendo;
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  const grupos = useMemo(() => faltaPorEtapa(itens, etapas), [itens, etapas]);
  const todos = grupos.flatMap((g) => g.itens);
  // O que já foi comprado sai da lista; a marca dele não pode continuar contando na barra.
  const marcados = todos.filter((i) => ids.has(i.insumo.id));
  const total = marcados.reduce((t, i) => t + valorPeloOrcamento(i), 0);
  const n = marcados.length;
  const demais = n > MAX_LINHAS;

  const alternar = (id: string) =>
    setIds((x) => {
      const novo = new Set(x);
      if (!novo.delete(id)) novo.add(id);
      return novo;
    });

  return (
    <section className={`card ${s.bloco}`} aria-labelledby="falta-titulo">
      <h2 id="falta-titulo" className={s.titulo}>
        Falta comprar {todos.length ? <small>· {todos.length === 1 ? "1 item" : `${todos.length.toLocaleString("pt-BR")} itens`} do orçamento</small> : null}
      </h2>
      {!todos.length ? (
        <p className={`mut ${s.vazio}`}>{itens.length ? "Tudo o que a obra precisa já foi comprado ou está a caminho." : "Os itens aparecem aqui quando o orçamento for aprovado."}</p>
      ) : (
        <>
          {desfazendo ? <p className={`mut ${s.vazio}`}>O Desfazer da aprovação parou no meio. Termine-o no Orçamento para voltar a comprar.</p> : null}
          {grupos.map((g) => (
            <div key={g.chave || "sem"} role="group" aria-label={g.nome}>
              <p className={s.grupo}>{g.nome}</p>
              <ul className={s.lista}>
                {g.itens.map((i) => {
                  const conteudo = (
                    <>
                      <span>{i.insumo.nome}</span>
                      <span className={`num ${s.qtd}`}>{fmtQtdUn(i.conta.comprar, i.insumo.unidade)}</span>
                      <span className={`num ${s.valor}`}>{i.insumo.valor_unitario ? fmtReais(valorPeloOrcamento(i)) : "sem preço"}</span>
                    </>
                  );
                  const marcado = ids.has(i.insumo.id);
                  return (
                    <li key={i.insumo.id}>
                      {podeOperar ? (
                        <label className={`${s.linha}${marcado ? ` ${s.marcada}` : ""}`}>
                          <input type="checkbox" checked={marcado} onChange={() => alternar(i.insumo.id)} />
                          {conteudo}
                        </label>
                      ) : (
                        <div className={`${s.linha} ${s.leitura}`}>{conteudo}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {n ? (
            <div className={s.barra}>
              <p>
                <b>{n === 1 ? "1 item marcado" : `${n} itens marcados`}</b> <span className="mut">· {fmtReais(total)} pelo orçamento</span>
                {demais ? <span className="campo-erro"> Até {MAX_LINHAS} itens por pedido.</span> : null}
              </p>
              <button
                type="button"
                className="btn amb"
                disabled={demais}
                onClick={() => fazerPedido(marcados)}
              >
                <Icone nome="plus" tam={15} />
                {n === 1 ? "Fazer pedido do item" : `Fazer pedido dos ${n} itens`}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
