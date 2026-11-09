"use client";
/**
 * A aba Conversa: histórico, campo e o streaming do POST /conversa. Cada evento SSE vira estado na hora: `ferramenta`
 * vira o chip "usou almoxarifado…", `texto` cresce o balão, `proposta` vira o cartão de decisão (que só a pessoa aprova).
 */
import { useLayoutEffect, useRef, useState, type Dispatch, type ReactNode } from "react";
import type { Obra, ResumoDaObra } from "@/lib/contrato";
import { conversar } from "@/lib/cliente";
import { CartaoProposta } from "./CartaoProposta";
import { HojeNaObra } from "./hoje/HojeNaObra";
import { mensagemDe, useCasca } from "./contexto";
import { Icone } from "./Icone";
import { MensagemMarkdown } from "./MensagemMarkdown";
import { novaPergunta, type AcaoSessoes, type MsgAgente, type Sessao } from "./sessoes";
import { sugestoesDaObra } from "./sugestoes";

/**
 * O fluxo em andamento de cada sessão, fora do componente: a Conversa remonta (key={sessao.id}) quando a pessoa troca
 * de conversa, e um ref por instância se perderia, levando o "Parar" junto, enquanto o fluxo da sessão anterior segue
 * rodando. Pela chave da sessão, quem volta para ela ainda acha como pará-la.
 */
const fluxos = new Map<string, AbortController>();

function BalaoAgente({ m }: { m: MsgAgente }) {
  const esperando = !m.terminou && !m.texto && !m.erro;
  let corpo: ReactNode = null;
  if (m.texto) {
    corpo = (
      <div className="bub">
        <MensagemMarkdown texto={m.texto} vivo={!m.terminou} />
      </div>
    );
  } else if (esperando) {
    corpo = (
      <div className="bub">
        <Icone nome="wrench" tam={14} />
        {m.ferramentas.length ? "usando ferramentas…" : "pensando…"}
      </div>
    );
  }
  return (
    <div className={`msg ai mv-entra${esperando ? " ca-pensando" : ""}`}>
      <div className="aiav">
        <Icone nome="spark" tam={16} />
      </div>
      <div className="corpo">
        {m.ferramentas.length ? (
          <ul className="tools" aria-label="Ferramentas usadas">
            {m.ferramentas.map((f, i) => (
              <li key={i} className={f.nivel}>
                <Icone nome={f.nivel === "propoe" ? "cart" : "package"} tam={13} />
                {f.resumo || f.nome}
              </li>
            ))}
          </ul>
        ) : null}
        {corpo}
        {m.erro ? (
          <div className="bub erro" role="alert">
            {m.erro}
          </div>
        ) : null}
        {m.propostas.length ? (
          <div className="ca-cartao">
            <div className="ld-lista">
              {m.propostas.map((id) => (
                <CartaoProposta key={id} id={id} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ConversaVazia({ sugestoes, perguntar }: { sugestoes: string[]; perguntar: (s: string) => void }) {
  return (
    <div className="ca-vazio">
      <div className="aiav">
        <Icone nome="spark" tam={20} />
      </div>
      {/* a obra já está no topo: o título não a repete */}
      <h2>O que você quer saber?</h2>
      <div className="chips">
        {sugestoes.map((s) => (
          <button key={s} type="button" className="chip" onClick={() => perguntar(s)}>
            {s}
          </button>
        ))}
      </div>
      <p className="ca-vazio-nota">Nada é gravado sem a sua aprovação.</p>
    </div>
  );
}

export function Conversa({ sessao, obra, resumo = null, despachar, visivel = true }: { sessao: Sessao; obra: Obra | undefined; resumo?: ResumoDaObra | null; visivel?: boolean; despachar: Dispatch<AcaoSessoes> }) {
  const { receberPropostas } = useCasca();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  // Se a pessoa trocou de sessão no meio da resposta, o fluxo continua; o campo segue travado até o fim dele.
  const ultima = sessao.mensagens[sessao.mensagens.length - 1];
  const falando = enviando || (ultima?.papel === "agente" && !ultima.terminou);
  const [anuncio, setAnuncio] = useState("");
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const colado = useRef(true);
  // A casa da obra abre com a conversa nova e fica acima dela; conversa antiga aberta do histórico vem sem ela.
  const [comCasa] = useState(() => !!obra && sessao.carregada && sessao.mensagens.length === 0);

  // Acompanha o fim da conversa enquanto o texto chega, a não ser que a pessoa tenha subido para reler.
  useLayoutEffect(() => {
    const el = lista.current;
    if (el && colado.current) el.scrollTop = el.scrollHeight;
  }, [sessao.mensagens]);

  async function perguntar(t: string) {
    const pergunta = t.trim();
    if (!pergunta || falando || !sessao.carregada) return;
    const { eu, agente } = novaPergunta(pergunta);
    despachar({ tipo: "perguntou", sessaoId: sessao.id, eu, agente });
    setTexto("");
    setEnviando(true);
    setAnuncio("O mestre de obras está respondendo.");
    colado.current = true;
    const ctl = new AbortController();
    fluxos.set(sessao.id, ctl);
    try {
      for await (const e of conversar({ sessao_id: sessao.servidorId, obra_id: sessao.obraId, texto: pergunta }, ctl.signal)) {
        if (e.tipo === "proposta") receberPropostas([e.proposta]);
        despachar({ tipo: "evento", sessaoId: sessao.id, msgId: agente.id, evento: e });
      }
      despachar({ tipo: "parou", sessaoId: sessao.id, msgId: agente.id });
      setAnuncio("Resposta do mestre de obras pronta.");
    } catch (x) {
      const abortou = ctl.signal.aborted;
      despachar({ tipo: "parou", sessaoId: sessao.id, msgId: agente.id, erro: abortou ? "Você parou a resposta." : mensagemDe(x) });
      setAnuncio(abortou ? "Resposta interrompida." : "A conversa falhou.");
    } finally {
      // só apaga se ainda for este fluxo: nada de levar embora o controle de uma pergunta mais nova
      if (fluxos.get(sessao.id) === ctl) fluxos.delete(sessao.id);
      setEnviando(false);
      campo.current?.focus({ preventScroll: true });
    }
  }

  const parar = fluxos.get(sessao.id);

  const tecla = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void perguntar(texto);
    }
  };
  const crescer = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(180, el.scrollHeight)}px`;
  };

  return (
    <>
      <div
        className={`msgs${comCasa ? " com-casa" : ""}`}
        ref={lista}
        onScroll={(e) => {
          const el = e.currentTarget;
          colado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        aria-label="Mensagens da conversa"
        role="log"
        // ao vivo, o resumo inteiro seria lido em voz alta ao carregar; quem avisa da resposta é o status abaixo
        aria-live={comCasa ? "off" : undefined}
      >
        {!sessao.carregada ? (
          sessao.erroCarga ? (
            <div className="aviso-erro" role="alert">
              <Icone nome="alert" tam={15} />
              <span>
                Não consegui abrir esta conversa: {sessao.erroCarga}{" "}
                <button type="button" className="link" onClick={() => despachar({ tipo: "falhouCarga", sessaoId: sessao.id, erro: null })}>
                  Tentar de novo
                </button>
              </span>
            </div>
          ) : (
            <div className="carregando" role="status">
              <Icone nome="loader" className="spin" tam={15} />
              Abrindo a conversa…
            </div>
          )
        ) : comCasa && obra ? (
          <>
            <HojeNaObra
              obra={obra}
              visivel={visivel}
              alternativa={sessao.mensagens.length ? null : <ConversaVazia sugestoes={sugestoesDaObra(obra, resumo)} perguntar={(s) => void perguntar(s)} />}
              abaixo={
                sessao.mensagens.length ? null : (
                  <div className="chips conv-sugestoes">
                    {sugestoesDaObra(obra, resumo).map((s) => (
                      <button key={s} type="button" className="chip" onClick={() => void perguntar(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                )
              }
            />
            {sessao.mensagens.length ? (
              <div className="conv-sob-casa">
                {sessao.mensagens.map((m) =>
                  m.papel === "eu" ? (
                    <div key={m.id} className="msg me mv-entra">
                      {m.texto}
                    </div>
                  ) : (
                    <BalaoAgente key={m.id} m={m} />
                  ),
                )}
              </div>
            ) : null}
          </>
        ) : sessao.mensagens.length === 0 ? (
          <ConversaVazia sugestoes={obra ? sugestoesDaObra(obra, resumo) : []} perguntar={(s) => void perguntar(s)} />
        ) : (
          sessao.mensagens.map((m) =>
            m.papel === "eu" ? (
              <div key={m.id} className="msg me mv-entra">
                {m.texto}
              </div>
            ) : (
              <BalaoAgente key={m.id} m={m} />
            ),
          )
        )}
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {anuncio}
      </div>
      <div className="ca-pe">
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void perguntar(texto);
          }}
        >
          <label htmlFor={`campo-${sessao.id}`} className="sr-only">
            Pergunte ao mestre de obras
          </label>
          <textarea
            id={`campo-${sessao.id}`}
            ref={campo}
            rows={1}
            value={texto}
            placeholder={comCasa ? "Peça algo ao mestre de obras…" : "Pergunte sobre a obra…"}
            onChange={(e) => {
              setTexto(e.target.value);
              crescer(e.target);
            }}
            onKeyDown={tecla}
          />
          <div className="row">
            <span className="ca-dica">
              <kbd>Enter</kbd> envia <kbd>Shift</kbd>+<kbd>Enter</kbd> quebra a linha
            </span>
            <span className="sp" />
            {falando && parar ? (
              <button type="button" className="btn sm" onClick={() => parar.abort()}>
                <Icone nome="square" tam={14} />
                Parar
              </button>
            ) : (
              <button type="submit" className="vs-enviar" aria-label="Enviar pergunta" disabled={!texto.trim() || falando || !sessao.carregada}>
                <Icone nome="arrowUp" tam={16} />
              </button>
            )}
          </div>
        </form>
      </div>
    </>
  );
}
