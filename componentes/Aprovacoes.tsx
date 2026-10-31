"use client";
/**
 * Aba Aprovações: o que o agente propôs e espera alguém aprovar. Quem é decidido aqui continua na lista (com
 * "Aprovado · Desfazer") até a próxima vez que a aba abrir, para o Desfazer estar onde a pessoa acabou de clicar.
 * O ocre só na primeira linha pendente: numa lista, uma primária por vez. "Todas as obras" junta a fila de quem cuida
 * de várias: cada cartão diz de que obra é.
 */
import { useEffect, useRef, useState } from "react";
import type { Obra } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { CartaoProposta } from "./CartaoProposta";
import { mensagemDe, useCasca } from "./contexto";
import { Icone } from "./Icone";

export function Aprovacoes({ obra, obras }: { obra: Obra; obras: Obra[] }) {
  const { cartoes, receberPropostas } = useCasca();
  const [todas, setTodas] = useState(false);
  const escopo = todas ? null : obra.id;
  const nomeObra = (id: string) => obras.find((o) => o.id === id)?.nome ?? "";
  const [ids, setIds] = useState<string[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const vistos = useRef<string[]>([]);

  useEffect(() => {
    let vivo = true;
    setIds(null);
    api
      .listarPropostas({ status: "pendente", ...(escopo ? { obra_id: escopo } : {}) })
      .then((ps) => {
        if (!vivo) return;
        receberPropostas(ps);
        vistos.current = ps.map((p) => p.id);
        setIds(vistos.current);
      })
      .catch((e) => vivo && setErro(mensagemDe(e)));
    return () => {
      vivo = false;
    };
  }, [escopo, receberPropostas]);

  // Proposta nova que chega pela conversa enquanto a aba está aberta entra no fim da lista.
  const lista = [...(ids ?? []), ...Object.values(cartoes).filter((c) => (!escopo || c.proposta.obra_id === escopo) && c.proposta.status === "pendente" && !(ids ?? []).includes(c.proposta.id)).map((c) => c.proposta.id)];
  const primeiraPendente = lista.find((id) => cartoes[id]?.proposta.status === "pendente");

  return (
    <div className="page">
      <div className="cab-tela">
        <h2>Aprovações</h2>
        {obras.length > 1 ? (
          <div className="seg seg-pq cab-acao" role="radiogroup" aria-label="De quais obras">
            <button type="button" role="radio" aria-checked={!todas} className={!todas ? "on" : ""} onClick={() => setTodas(false)}>
              {obra.nome}
            </button>
            <button type="button" role="radio" aria-checked={todas} className={todas ? "on" : ""} onClick={() => setTodas(true)}>
              Todas as obras
            </button>
          </div>
        ) : (
          <span className="mut sm">{obra.nome}</span>
        )}
      </div>
      {erro ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          {erro}
        </div>
      ) : null}
      {ids === null && !erro ? (
        <div className="carregando" role="status">
          <Icone nome="loader" className="spin" tam={15} />
          Carregando propostas…
        </div>
      ) : ids !== null && lista.length === 0 ? (
        <div className="card vazio">
          <Icone nome="checkCircle" tam={24} />
          <h3>Nada esperando você{todas ? "" : " nesta obra"}</h3>
          <p>Quando o agente preparar uma compra ou um ajuste, aparece aqui e na conversa.</p>
        </div>
      ) : (
        <div className="ld-lista">
          {lista.map((id) => (
            <CartaoProposta key={id} id={id} foco={id === primeiraPendente} obraNome={todas ? nomeObra(cartoes[id]?.proposta.obra_id ?? "") : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}
