"use client";
/**
 * A base do cronograma: os serviços de cada etapa, direto do orçamento. Fica na tela de Cronograma (e na proposta da
 * IA) para a pessoa ver o que está sendo sequenciado — as durações saem daqui (quantidade × produtividade) — sem ter
 * de voltar ao Orçamento. Só leitura; a conta é da API.
 */
import type { ItemOrcamento } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtQtdUn } from "@/lib/formato";
import { useCarregar } from "../useCarregar";

export function BaseOrcamento({ obraId, aberto = false }: { obraId: string; aberto?: boolean }) {
  const { dado } = useCarregar(() => api.orcamento(obraId), [obraId]);
  if (!dado) return null;
  const itens = dado.itens.filter((i) => i.tipo === "item");
  if (!itens.length) return null;
  const porEtapa = new Map<string, ItemOrcamento[]>();
  for (const it of itens) {
    const lista = porEtapa.get(it.etapa);
    if (lista) lista.push(it);
    else porEtapa.set(it.etapa, [it]);
  }
  const etapas = dado.etapas.filter((e) => porEtapa.has(e.etapa));
  if (!etapas.length) return null;

  return (
    <details className="base-orc" open={aberto}>
      <summary>
        Base no orçamento <span className="base-orc-cont">{etapas.length} etapas · {itens.length} serviços</span>
      </summary>
      <div className="base-orc-grade">
        {etapas.map((e) => {
          const lista = porEtapa.get(e.etapa)!;
          return (
            <section key={e.etapa} className="base-orc-fase">
              <h4>
                {e.descricao} <span className="n">{lista.length}</span>
              </h4>
              <ul>
                {lista.map((it, i) => (
                  <li key={i}>
                    <span>{it.descricao}</span>
                    <em>{fmtQtdUn(it.quantidade, it.unidade)}</em>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </details>
  );
}
