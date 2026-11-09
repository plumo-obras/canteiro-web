"use client";
/**
 * A casa da obra: o que importa hoje, sem gastar token. As contas e as frases vêm prontas de GET /obras/{id}/hoje; aqui
 * só entram a saudação, o dia e o que já está na casca (as propostas esperando). Cada ponto leva à tela certa.
 */
import { useEffect, useState, type ReactNode } from "react";
import type { AcaoHoje, EventoSemana, HojeNaObra as HojeT, Obra, PontoHoje, PrioridadeHoje } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { CartaoProposta } from "../CartaoProposta";
import { useCasca } from "../contexto";
import { Icone } from "../Icone";
import { telaDe, type AbaAtiva } from "../sessoes";
import { useCarregar } from "../useCarregar";
import s from "./hoje.module.css";

/** Quantos cartões cabem ao lado do resumo; o resto fica em Aprovações. */
const MAX_CARTOES = 3;

const ROTULO_PRIORIDADE: Record<PrioridadeHoje, string> = { pede_voce: "Pede você", atencao: "Atenção", a_caminho: "A caminho", ok: "Em dia" };

/** Fuso da obra, não o do navegador: quem abre de longe não pode ler "bom dia" às 22 h de São Paulo. */
export function saudacao(agora = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hourCycle: "h23", timeZone: "America/Sao_Paulo" }).format(agora));
  return h < 12 ? "Bom dia." : h < 18 ? "Boa tarde." : "Boa noite.";
}

const meioDia = (d: string) => new Date(`${d}T12:00:00-03:00`);
const noFuso = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { ...o, timeZone: "America/Sao_Paulo" });

/** "2026-11-09" → "Segunda, 09/11". */
export function diaPorExtenso(d: string): string {
  const dia = noFuso({ weekday: "long" }).format(meioDia(d)).replace("-feira", "");
  return `${dia[0]!.toUpperCase()}${dia.slice(1)}, ${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

/** "2026-11-12" → "qui 12". */
export const diaCurto = (d: string) => `${noFuso({ weekday: "short" }).format(meioDia(d)).replace(".", "")} ${d.slice(8, 10)}`;

/** A frase da API; se ela disser só a situação, a web acrescenta o que está esperando. */
export function fraseDoDia(r: HojeT["resumo"]): string {
  if (!r.esperando || r.frase.includes("esperando")) return r.frase;
  return `${r.frase.replace(/\.$/, "")}, com ${r.esperando === 1 ? "1 coisa" : `${r.esperando} coisas`} esperando você.`;
}

/** "Segunda, 09/11 · semana 2 de 20". */
export function linhaDoDia(hoje: string, r: HojeT["resumo"]): string {
  const semana = r.semana_atual && r.semanas_total ? ` · semana ${r.semana_atual} de ${r.semanas_total}` : "";
  return `${diaPorExtenso(hoje)}${semana}`;
}

function Acao({ acao, classe }: { acao: AcaoHoje; classe: string }) {
  const { irParaTela } = useCasca();
  // tela que esta versão da web não conhece: melhor sem botão do que um botão que não leva a lugar nenhum
  const tela: AbaAtiva | undefined = telaDe(acao.tela);
  if (!tela) return null;
  return (
    <button type="button" className={classe} onClick={() => irParaTela(tela)}>
      {acao.rotulo}
    </button>
  );
}

function Ponto({ p }: { p: PontoHoje }) {
  return (
    <li className={s.ponto}>
      <span className={`${s.dot} ${s[p.prioridade]}`} aria-hidden="true" />
      <p className={s.texto}>
        <span className="sr-only">{ROTULO_PRIORIDADE[p.prioridade]}: </span>
        <b>{p.titulo}</b> <span className="mut">{p.detalhe}</span>
      </p>
      {p.acao ? <Acao acao={p.acao} classe={`btn sm ${s.acao}`} /> : null}
    </li>
  );
}

function Evento({ e }: { e: EventoSemana }) {
  return (
    <li className={s.evento}>
      <span className={`mut ${s.quando}`}>{diaCurto(e.data)}</span>
      <p className={s.texto}>
        {e.titulo} {e.detalhe ? <span className="mut">· {e.detalhe}</span> : null}
      </p>
      {e.acao ? <Acao acao={e.acao} classe="link" /> : null}
    </li>
  );
}

function EsperandoVoce({ obraId }: { obraId: string }) {
  const { cartoes, irParaTela } = useCasca();
  const pendentes = Object.values(cartoes)
    .filter((c) => c.proposta.obra_id === obraId && c.proposta.status === "pendente")
    .map((c) => c.proposta.id);
  const chavePendentes = pendentes.join(",");
  // Quem acabou de ser decidido continua aqui, com "Aprovado · Desfazer", até a próxima vez que a tela abrir.
  const [vistos, setVistos] = useState<string[]>([]);
  useEffect(() => {
    if (chavePendentes) setVistos((v) => [...v, ...chavePendentes.split(",").filter((id) => !v.includes(id))]);
  }, [chavePendentes]);
  const primeira = pendentes[0];
  const lista = vistos.filter((id) => cartoes[id]);
  const aMostra = [...lista.filter((id) => pendentes.includes(id)).slice(0, MAX_CARTOES), ...lista.filter((id) => !pendentes.includes(id))];
  const fora = pendentes.length - Math.min(pendentes.length, MAX_CARTOES);
  return (
    <section aria-labelledby="hoje-esperando">
      <h2 id="hoje-esperando" className={s.tituloBloco}>
        Esperando você {pendentes.length ? <small>· {pendentes.length}</small> : null}
      </h2>
      {aMostra.length ? (
        <div className="ld-lista ld-estreita">
          {aMostra.map((id) => (
            <CartaoProposta key={id} id={id} foco={id === primeira} />
          ))}
        </div>
      ) : (
        <p className={`card ${s.nada}`}>Nenhuma proposta para aprovar.</p>
      )}
      {fora ? (
        <button type="button" className={`link ${s.verTodas}`} onClick={() => irParaTela("aprovacoes")}>
          Ver as outras {fora} em Aprovações
        </button>
      ) : null}
    </section>
  );
}

/** `alternativa`: o que mostrar se a API no ar ainda não tem a rota. `abaixo`: o que vem depois do resumo. */
export function HojeNaObra({ obra, alternativa, abaixo }: { obra: Obra; alternativa: ReactNode; abaixo?: ReactNode }) {
  const { versao } = useCasca();
  const { dado, erro, carregando } = useCarregar(() => api.hojeNaObra(obra.id), [obra.id, versao]);

  if (carregando && !dado) {
    return (
      <div className="carregando" role="status">
        <Icone nome="loader" className="spin" tam={15} />
        Olhando a obra…
      </div>
    );
  }
  if (erro && !dado) {
    return (
      <div className="aviso-erro" role="alert">
        <Icone nome="alert" tam={15} />
        {erro}
      </div>
    );
  }
  if (!dado) return <>{alternativa}</>;
  // as propostas já aparecem uma a uma em "Esperando você"
  const pontos = dado.pontos.filter((p) => p.tipo !== "aprovacoes_pendentes");

  return (
    <div className={s.casa}>
      <div className={s.coluna}>
        <section className={`card ${s.hoje}`} aria-labelledby="hoje-titulo">
          <div className={s.cabeca}>
            <span className={s.mestre} aria-hidden="true">
              <Icone nome="spark" tam={18} />
            </span>
            <div>
              <h1 id="hoje-titulo" className={s.titulo}>
                {saudacao()} {fraseDoDia(dado.resumo)}
              </h1>
              <p className="mut">{linhaDoDia(dado.hoje, dado.resumo)}. Olhei compras, cronograma e gastos. O que importa hoje:</p>
            </div>
          </div>
          {pontos.length ? (
            <ul className={s.pontos} aria-label="Hoje na obra">
              {pontos.map((p) => (
                <Ponto key={p.tipo} p={p} />
              ))}
            </ul>
          ) : (
            <p className={s.tudoEmDia}>
              <Icone nome="check" tam={15} />
              Nada pedindo você hoje.
            </p>
          )}
          {dado.mais ? <p className={`mut sm ${s.mais}`}>E mais {dado.mais === 1 ? "1 ponto" : `${dado.mais} pontos`} depois destes.</p> : null}
        </section>
      </div>
      <div className={s.coluna}>
        <EsperandoVoce obraId={obra.id} />
        <section className={`card ${s.semana}`} aria-labelledby="hoje-semana">
          <h2 id="hoje-semana" className={s.tituloBloco}>
            Esta semana
          </h2>
          {dado.semana.length ? (
            <ul className={s.eventos}>
              {dado.semana.map((e, i) => (
                <Evento key={`${e.data}-${i}`} e={e} />
              ))}
            </ul>
          ) : (
            <p className="mut">Nenhuma entrega ou início de etapa nos próximos 7 dias.</p>
          )}
        </section>
      </div>
      <p className={`mut sm ${s.nota}`}>O mestre de obras só propõe. Nada é pedido, pago ou mudado sem o seu toque, e tudo fica no Histórico com Desfazer.</p>
      {abaixo ? <div className={s.nota}>{abaixo}</div> : null}
    </div>
  );
}
