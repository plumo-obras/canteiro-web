"use client";
/**
 * A casa da obra: o que importa hoje, sem gastar token. As contas e as frases vêm prontas de GET /obras/{id}/hoje; aqui
 * só entram a saudação, o dia e o que já está na casca (as propostas esperando). Cada ponto leva à tela certa.
 * O que espera a pessoa e a semana viram etiquetas no topo: a conversa fica com a largura e o detalhe abre numa gaveta.
 */
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { AcaoHoje, EventoSemana, HojeNaObra as HojeT, Obra, PontoHoje, PrioridadeHoje } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { CartaoProposta } from "../CartaoProposta";
import { useCasca } from "../contexto";
import { Icone } from "../Icone";
import { telaDe, type AbaAtiva } from "../sessoes";
import { DISCIPLINAS_SIMULADAS } from "@/lib/simulado/projeto";
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

/** A API diz só a situação; o que está esperando a web acrescenta, pelo número que vem pronto. */
export function fraseDoDia(r: HojeT["resumo"]): string {
  if (!r.esperando) return r.frase;
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
    <button type="button" className={classe} onClick={() => irParaTela(tela, acao.filtro)}>
      {acao.rotulo}
    </button>
  );
}

function Ponto({ p }: { p: PontoHoje }) {
  const { podeOperar } = useCasca();
  // "Falta você confirmar" não vale para quem só lê: fica o fato, sem a cobrança
  const detalhe = p.prioridade === "pede_voce" && !podeOperar ? "" : p.detalhe;
  return (
    <li className={s.ponto}>
      <span className={`${s.dot} ${s[p.prioridade]}`} aria-hidden="true" />
      <p className={s.texto}>
        <span className="sr-only">{podeOperar ? ROTULO_PRIORIDADE[p.prioridade] : p.prioridade === "pede_voce" ? "Pendente" : ROTULO_PRIORIDADE[p.prioridade]}: </span>
        <b>{p.titulo}</b> <span className="mut">{detalhe}</span>
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

type Cartoes = ReturnType<typeof useCasca>["cartoes"];
const pendentesDa = (cartoes: Cartoes, obraId: string) =>
  Object.values(cartoes)
    .filter((c) => c.proposta.obra_id === obraId && c.proposta.status === "pendente")
    .map((c) => c.proposta.id);

function EsperandoVoce({ obraId }: { obraId: string }) {
  const { cartoes, irParaTela, podeOperar } = useCasca();
  const pendentes = pendentesDa(cartoes, obraId);
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
        {podeOperar ? "Esperando você" : "Aguardando aprovação"} {pendentes.length ? <small>· {pendentes.length}</small> : null}
      </h2>
      {aMostra.length ? (
        <div className="ld-lista ld-estreita">
          {aMostra.map((id) => (
            <CartaoProposta key={id} id={id} foco={id === primeira} />
          ))}
        </div>
      ) : (
        <p className={`card ${s.nada}`}>{podeOperar ? "Nenhuma proposta para aprovar." : "Nenhuma proposta pendente."}</p>
      )}
      {fora ? (
        <button type="button" className={`link ${s.verTodas}`} onClick={() => irParaTela("aprovacoes")}>
          Ver as outras {fora} em Aprovações
        </button>
      ) : null}
    </section>
  );
}

/**
 * `alternativa`: o que mostrar se a API no ar ainda não tem a rota. `abaixo`: o que vem depois do resumo. `visivel`: a
 * conversa fica montada e escondida atrás das outras telas; escondida, ela não busca, e ao voltar relê se algo mudou.
 */
export function HojeNaObra(props: { obra: Obra; alternativa: ReactNode; abaixo?: ReactNode; visivel?: boolean }) {
  const { versao, podeOperar } = useCasca();
  const { visivel = true } = props;
  // "versão ao chegar aqui": só anda com a casa à vista, e é o que dispara a busca
  const [versaoVista, setVersaoVista] = useState<number | null>(visivel ? versao : null);
  useEffect(() => {
    if (visivel) setVersaoVista(versao);
  }, [visivel, versao]);
  if (versaoVista === null) return null;
  return <Casa {...props} versao={versaoVista} podeOperar={podeOperar} />;
}

type Gaveta = "esperando" | "semana";

function Casa({ obra, alternativa, abaixo, versao, podeOperar }: { obra: Obra; alternativa: ReactNode; abaixo?: ReactNode; versao: number; podeOperar: boolean }) {
  const { dado, erro, carregando } = useCarregar(() => api.hojeNaObra(obra.id), [obra.id, versao]);
  const { cartoes, irParaTela } = useCasca();
  const [gaveta, setGaveta] = useState<Gaveta | null>(null);
  const caixa = useRef<HTMLElement>(null);
  const quemAbriu = useRef<HTMLElement | null>(null);
  const fechar = () => {
    setGaveta(null);
    quemAbriu.current?.focus({ preventScroll: true });
  };
  const alternar = (g: Gaveta) => (e: MouseEvent<HTMLButtonElement>) => {
    if (gaveta === g) return fechar();
    quemAbriu.current = e.currentTarget;
    setGaveta(g);
  };
  useEffect(() => {
    if (!gaveta) return;
    caixa.current?.querySelector<HTMLElement>("button,a,[tabindex]")?.focus({ preventScroll: true });
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [gaveta]);

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
  const { pontos } = dado;
  const nPendentes = pendentesDa(cartoes, obra.id).length;
  const rotuloEsperando = podeOperar
    ? nPendentes === 0
      ? "Nada esperando você"
      : `${nPendentes} ${nPendentes === 1 ? "aprovação" : "aprovações"}`
    : nPendentes === 0
      ? "Nada aguardando aprovação"
      : `${nPendentes} aguardando aprovação`;
  // o que pede atenção vira etiqueta também (o detalhe continua na lista abaixo); a próxima disciplina é SIMULADA
  const atencao = pontos.filter((p) => p.prioridade === "atencao" && p.acao && telaDe(p.acao.tela));
  const proxima = DISCIPLINAS_SIMULADAS.find((d) => d.situacao === "proxima");

  return (
    <div className={s.casa}>
      <div className={s.principal}>
        <div className={s.etiquetas} role="group" aria-label="Atalhos da obra">
          <button
            type="button"
            className={`${s.etq}${nPendentes ? ` ${s.amb}` : ""}`}
            aria-expanded={gaveta === "esperando"}
            aria-controls="hoje-gaveta"
            onClick={alternar("esperando")}
          >
            <span className={s.bola} aria-hidden="true" />
            {rotuloEsperando}
          </button>
          {atencao.map((p) => (
            <button key={p.tipo} type="button" className={`${s.etq} ${s.ver}`} onClick={() => irParaTela(telaDe(p.acao!.tela)!, p.acao!.filtro)}>
              <span className={s.bola} aria-hidden="true" />
              {p.titulo.replace(/\.$/, "")}
            </button>
          ))}
          {proxima ? (
            <button type="button" className={`${s.etq} ${s.azu}`} onClick={() => irParaTela("projeto")}>
              <span className={s.bola} aria-hidden="true" />
              {proxima.nome}: falta a planta
            </button>
          ) : null}
          <button type="button" className={s.etq} aria-expanded={gaveta === "semana"} aria-controls="hoje-gaveta" onClick={alternar("semana")}>
            <Icone nome="calendario" tam={14} />
            Esta semana{dado.semana.length ? ` · ${dado.semana.length}` : ""}
          </button>
        </div>
        {/* o resumo do dia é uma mensagem do Plumo, não um título: a conversa continua embaixo dela */}
        <section className={s.hoje} aria-labelledby="hoje-titulo">
          <div className={s.cabeca}>
            <span className={s.mestre} aria-hidden="true">
              <Icone nome="spark" tam={16} />
            </span>
            <div className={s.corpoMsg}>
              <span className={s.metaMsg}>Plumo · {linhaDoDia(dado.hoje, dado.resumo)}</span>
              <p id="hoje-titulo" className={s.titulo}>
                {saudacao()} {podeOperar ? fraseDoDia(dado.resumo) : dado.resumo.frase}
              </p>
              <p className={s.sub}>Olhei compras, cronograma e gastos. O que importa hoje:</p>
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
        {abaixo ? <div className={s.nota}>{abaixo}</div> : null}
      </div>
      {gaveta ? (
        <>
          <div className={s.fundo} aria-hidden="true" onClick={fechar} />
          <aside id="hoje-gaveta" ref={caixa} className={`card ${s.gaveta}`} aria-label={gaveta === "esperando" ? "Esperando você" : "Esta semana"}>
            <button type="button" className={`btn sm ${s.fechar}`} aria-label="Fechar" onClick={fechar}>
              <Icone nome="x" tam={16} />
            </button>
            {gaveta === "esperando" ? (
              <EsperandoVoce obraId={obra.id} />
            ) : (
              <section aria-labelledby="hoje-semana">
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
            )}
          </aside>
        </>
      ) : null}
    </div>
  );
}
