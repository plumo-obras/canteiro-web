"use client";
/**
 * A aba Conversa: histórico, campo e o streaming do POST /conversa. Cada evento SSE vira estado na hora: `ferramenta`
 * vira o chip "usou almoxarifado…", `texto` cresce o balão, `proposta` vira o cartão de decisão (que só a pessoa aprova).
 */
import { Fragment, useLayoutEffect, useRef, useState, type Dispatch, type ReactNode } from "react";
import type { Obra } from "@/lib/contrato";
import { conversar } from "@/lib/cliente";
import { CartaoProposta } from "./CartaoProposta";
import { mensagemDe, useCasca } from "./contexto";
import { Icone } from "./Icone";
import { novaPergunta, type AcaoSessoes, type MsgAgente, type Sessao } from "./sessoes";

const SUGESTOES = ["Quanto falta de cimento?", "Precisa comprar bloco?", "O aço chega a tempo?"];

/** Texto do agente com parágrafos e **negrito**, sem HTML cru (o texto do modelo é dado, nunca marcação). */
export function TextoAgente({ texto }: { texto: string }) {
  const negrito = (linha: string) =>
    linha.split(/(\*\*[^*]+\*\*)/g).map((t, i) => (t.startsWith("**") && t.endsWith("**") && t.length > 4 ? <b key={i}>{t.slice(2, -2)}</b> : <Fragment key={i}>{t}</Fragment>));
  return (
    <>
      {texto.split(/\n{2,}/).map((par, i) => (
        <p key={i}>
          {par.split("\n").map((l, j) => (
            <Fragment key={j}>
              {j > 0 ? <br /> : null}
              {negrito(l)}
            </Fragment>
          ))}
        </p>
      ))}
    </>
  );
}

function BalaoAgente({ m }: { m: MsgAgente }) {
  const esperando = !m.terminou && !m.texto && !m.erro;
  let corpo: ReactNode = null;
  if (m.texto) {
    corpo = (
      <div className="bub">
        <TextoAgente texto={m.texto} />
        {!m.terminou ? <span className="cursor" aria-hidden="true" /> : null}
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

export function Conversa({ sessao, obra, despachar }: { sessao: Sessao; obra: Obra | undefined; despachar: Dispatch<AcaoSessoes> }) {
  const { receberPropostas } = useCasca();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  // Se a pessoa trocou de sessão no meio da resposta, o fluxo continua; o campo segue travado até o fim dele.
  const ultima = sessao.mensagens[sessao.mensagens.length - 1];
  const falando = enviando || (ultima?.papel === "agente" && !ultima.terminou);
  const [anuncio, setAnuncio] = useState("");
  const parar = useRef<AbortController | null>(null);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const colado = useRef(true);

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
    setAnuncio("O agente está respondendo.");
    colado.current = true;
    const ctl = new AbortController();
    parar.current = ctl;
    try {
      for await (const e of conversar({ sessao_id: sessao.servidorId, obra_id: sessao.obraId, texto: pergunta }, ctl.signal)) {
        if (e.tipo === "proposta") receberPropostas([e.proposta]);
        despachar({ tipo: "evento", sessaoId: sessao.id, msgId: agente.id, evento: e });
      }
      despachar({ tipo: "parou", sessaoId: sessao.id, msgId: agente.id });
      setAnuncio("Resposta do agente pronta.");
    } catch (x) {
      const abortou = ctl.signal.aborted;
      despachar({ tipo: "parou", sessaoId: sessao.id, msgId: agente.id, erro: abortou ? "Você parou a resposta." : mensagemDe(x) });
      setAnuncio(abortou ? "Resposta interrompida." : "A conversa falhou.");
    } finally {
      parar.current = null;
      setEnviando(false);
      campo.current?.focus({ preventScroll: true });
    }
  }

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
        className="msgs"
        ref={lista}
        onScroll={(e) => {
          const el = e.currentTarget;
          colado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        aria-label="Mensagens da conversa"
        role="log"
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
        ) : sessao.mensagens.length === 0 ? (
          <div className="ca-vazio">
            <div className="aiav">
              <Icone nome="spark" tam={20} />
            </div>
            <h2>O que você quer saber da {obra?.nome ?? "obra"}?</h2>
            <p>O agente consulta o almoxarifado e os pedidos, mostra a conta e prepara a compra. Nada é gravado sem a sua aprovação.</p>
            <div className="chips">
              {SUGESTOES.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => void perguntar(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
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
            Pergunte ao agente
          </label>
          <textarea
            id={`campo-${sessao.id}`}
            ref={campo}
            rows={1}
            value={texto}
            placeholder={`Pergunte sobre a ${obra?.nome ?? "obra"}…`}
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
            {falando && parar.current ? (
              <button type="button" className="btn sm" onClick={() => parar.current?.abort()}>
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
