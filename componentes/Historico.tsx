"use client";
/**
 * Aba Histórico: o registro da obra (quem fez o quê, quando e de onde), o mais novo em cima, agrupado por dia. Toda
 * escrita gera uma entrada; a que tem receita de desfazer e ainda não foi desfeita mostra o botão. Desfazer daqui é o
 * mesmo POST /registro/{id}/desfazer do aviso e do cartão de proposta: a API recusa (409) se o pedido já andou.
 */
import { useEffect, useState } from "react";
import type { EntradaRegistro, Obra } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtHora } from "@/lib/formato";
import { useCasca } from "./contexto";
import { Confirmar } from "./Dialogo";
import { Icone } from "./Icone";
import { CabecalhoPagina } from "./CabecalhoPagina";
import { Paginacao, useMaisAntigos, usePaginas } from "./Paginacao";
import { ROTULO_STATUS } from "./CartaoProposta";

// A API entrega em levas de 60 (3 páginas cheias); a tela mostra 20 por vez.
const LIMITE = 60;
const POR_PAGINA = 20;

const ORIGEM: Record<string, string> = { tela: "pela tela", agente: "aprovou do agente", whatsapp: "pelo WhatsApp", sistema: "sistema" };

// O registro grava o status como na API ("em_transito"); na tela vale o rótulo do quadro ("Em trânsito").
const legivel = (t: string) =>
  t.replace(/\b(em_cotacao|aprovado|enviado|em_transito|parcial|recebido|conferido|cancelado)\b/g, (st) =>
    ROTULO_STATUS[st as keyof typeof ROTULO_STATUS].toLowerCase(),
  );

const fDia = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" });
const chaveDia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });

function rotuloDia(iso: string) {
  const d = chaveDia.format(new Date(iso));
  const hoje = chaveDia.format(new Date());
  const ontem = chaveDia.format(new Date(Date.now() - 86_400_000));
  return d === hoje ? "Hoje" : d === ontem ? "Ontem" : fDia.format(new Date(iso));
}

/** Autor só quando muda em relação à linha anterior, ou quando é o agente (aí sempre importa saber). */
export const mostrarAutor = (r: EntradaRegistro, anterior: EntradaRegistro | undefined) =>
  r.origem === "agente" || !anterior || (anterior.quem_nome ?? anterior.quem) !== (r.quem_nome ?? r.quem) || anterior.origem !== r.origem;

function Linha({ r, autor }: { r: EntradaRegistro; autor: boolean }) {
  const { podeOperar, mudou, avisar } = useCasca();
  const [confirmando, setConfirmando] = useState(false);
  // Desfazer pelo Histórico pede confirmação com o texto da entrada, como no Orçamento: um clique desfazia um
  // cronograma refeito ou um prazo sem a pessoa ver o quê.
  const desfazer = async () => {
    const d = await api.desfazerRegistro(r.id);
    setConfirmando(false);
    mudou();
    avisar(d?.texto ? legivel(d.texto) : `Desfeito: ${legivel(r.texto)}`);
  };
  return (
    <li className={`hist-l${r.desfeito ? " desfeito" : ""}`}>
      <span className="hist-h">{fmtHora(r.criado_em)}</span>
      <div className="hist-t">
        <div>{legivel(r.texto)}</div>
        {autor || r.desfeito ? (
          <div className="mut sm">
            {autor ? `${r.quem_nome ?? r.quem}${ORIGEM[r.origem] ? ` · ${ORIGEM[r.origem]}` : ""}` : ""}
            {r.desfeito ? `${autor ? " · " : ""}desfeito` : ""}
          </div>
        ) : null}
      </div>
      {podeOperar && r.desfazer && !r.desfeito ? (
        <button type="button" className="link hist-desf" onClick={() => setConfirmando(true)} aria-label={`Desfazer: ${r.texto}`}>
          <Icone nome="undo" tam={13} />
          Desfazer
        </button>
      ) : null}
      {confirmando ? (
        <Confirmar titulo={`Desfazer: ${legivel(r.texto)}?`} confirmar="Desfazer" fechar={() => setConfirmando(false)} aoConfirmar={desfazer}>
          <p style={{ margin: "4px 0 0" }}>
            Volta ao que era antes desta entrada ({fmtHora(r.criado_em)}, {r.quem_nome ?? r.quem}). Se algo mudou depois dela, o Plumo recusa e diz o quê.
          </p>
        </Confirmar>
      ) : null}
    </li>
  );
}

export function Historico({ obra }: { obra: Obra }) {
  const { versao } = useCasca();
  const mais = useMaisAntigos((antes) => api.listarRegistro(obra.id, LIMITE, antes), LIMITE, [obra.id, versao]);
  const { itens: dado, erro } = mais;
  const carregando = mais.buscando;
  const pag = usePaginas(dado ?? [], POR_PAGINA, [obra.id]);
  // Chegou na última página carregada e a API tem mais: já busca a próxima leva, e as páginas novas aparecem.
  const naUltima = pag.pagina === pag.total;
  const { acabou, buscando, carregarMais } = mais;
  useEffect(() => {
    if (naUltima && dado?.length && !acabou && !buscando) void carregarMais();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naUltima, dado?.length, acabou, buscando]);
  const dias: [string, EntradaRegistro[]][] = [];
  for (const r of pag.visiveis) {
    const d = rotuloDia(r.criado_em);
    const ultimo = dias.at(-1);
    if (ultimo?.[0] === d) ultimo[1].push(r);
    else dias.push([d, [r]]);
  }

  return (
    <div className="page">
      <CabecalhoPagina titulo="Histórico" />
      {erro ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          {erro}
        </div>
      ) : null}
      {carregando && !dado ? (
        <div className="carregando" role="status">
          <Icone nome="loader" className="spin" tam={15} />
          Carregando o histórico…
        </div>
      ) : dado && dado.length === 0 ? (
        <div className="card vazio">
          <Icone nome="history" tam={24} />
          <h3>Nada registrado ainda</h3>
          <p>Cada aprovação, pedido e lançamento no almoxarifado aparece aqui, com quem fez e o botão de desfazer.</p>
        </div>
      ) : (
        dias.map(([dia, rs]) => (
          <section key={dia} className="hist-dia" aria-label={dia}>
            <h3 className="sectit">{dia}</h3>
            <ul className="card lista hist">
              {rs.map((r, i) => (
                <Linha key={r.id} r={r} autor={mostrarAutor(r, rs[i - 1])} />
              ))}
            </ul>
          </section>
        ))
      )}
      {dado?.length ? (
        <Paginacao pagina={pag.pagina} total={pag.total} mudar={pag.setPagina} quantos={dado.length} porPagina={POR_PAGINA} nome="histórico" mais={!acabou} />
      ) : null}
    </div>
  );
}
