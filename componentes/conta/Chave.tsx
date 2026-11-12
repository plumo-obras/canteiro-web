"use client";
/**
 * Chave própria da Anthropic. A tela nunca vê a chave guardada (a API devolve só os 4 últimos caracteres) e a que é
 * digitada sai do estado assim que é enviada. Trocar e remover são de admin ou master; leitura só vê a situação.
 */
import { useEffect, useRef, useState } from "react";
import type { ChavePropria } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtDiaHora } from "@/lib/formato";
import { mensagemDe, useCasca } from "../contexto";
import { Modal } from "../Dialogo";
import { Icone } from "../Icone";
import s from "./conta.module.css";

/** A mesma regra da API (ChaveCorpo): começa com sk-ant- e tem de 20 a 300 caracteres. */
export function problemaNaChave(chave: string): string | null {
  const c = chave.trim();
  if (!c) return "Cole a chave.";
  if (!c.startsWith("sk-ant-")) return "A chave da API da Anthropic começa com sk-ant-.";
  if (c.length < 20 || c.length > 300) return "Essa chave está curta ou longa demais. Copie de novo no Console.";
  return null;
}

export function Chave(props: {
  className: string;
  situacao: ChavePropria | null;
  podeTrocar: boolean;
  mudou: () => void;
  /** Celular: só a linha de situação; as ações abrem ao tocar no cartão. */
  compacto?: boolean;
}) {
  const { situacao, podeTrocar, mudou } = props;
  const { avisar } = useCasca();
  const ativa = !!situacao?.ativa;
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [remover, setRemover] = useState(false);
  const [aberto, setAberto] = useState(false);
  const cancelar = useRef<HTMLButtonElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  // O botão clicado some quando o formulário abre: o foco vai para o campo que entra no lugar dele.
  useEffect(() => {
    if (aberto) campo.current?.focus();
  }, [aberto]);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = problemaNaChave(valor);
    if (p) {
      setErro(p);
      return;
    }
    setOcupado(true);
    setErro(null);
    try {
      await api.salvarChaveAnthropic(valor.trim());
      setValor("");
      setAberto(false);
      avisar(ativa ? "Chave trocada. As próximas conversas já usam a nova." : "Chave conectada. As conversas deixam de gastar créditos.");
      mudou();
    } catch (x) {
      setErro(mensagemDe(x));
    } finally {
      setOcupado(false);
    }
  };

  const confirmarRemocao = async () => {
    setOcupado(true);
    try {
      await api.removerChaveAnthropic();
      setRemover(false);
      avisar("Chave removida. As conversas voltam a usar os créditos.");
      mudou();
    } catch (x) {
      avisar(mensagemDe(x), true);
    } finally {
      setOcupado(false);
    }
  };

  const final = situacao?.final?.replace(/^…/, "");
  // "por Marina em 12/11": o dia basta; a hora exata não muda nada para quem lê
  const quando = situacao?.cadastrada_em ? fmtDiaHora(situacao.cadastrada_em).split(" ")[0] : "";
  const quem = [situacao?.conectada_por ? `por ${situacao.conectada_por}` : "", quando ? `em ${quando}` : ""].filter(Boolean).join(" ");
  const [abertoCel, setAbertoCel] = useState(false);

  const como = (
    <details className={s.como}>
      <summary>
        Como conseguir a chave
        <Icone nome="chevDown" tam={15} className={s.seta} />
      </summary>
      <p className={s.texto}>
        Com uma chave própria, o Plumo usa a sua conta da Anthropic e não desconta créditos; a cobrança vem da Anthropic direto para você.
      </p>
      <p className={s.texto}>
        Precisa ser uma <b>chave de API de uma organização</b> no Console da Anthropic (console.anthropic.com, começa com <code>sk-ant-</code>). A
        assinatura Pro ou Max do Claude não serve.
      </p>
    </details>
  );

  // O pé do cartão: os botões, o formulário que entra no lugar deles (com o "como conseguir") ou o aviso de quem só lê.
  const pe = (
    <div className={s.pe}>
      {podeTrocar && !aberto ? (
        <div className={s.acoesChave}>
          <button type="button" className={`btn sm ${s.btPeq}`} onClick={() => setAberto(true)}>
            {ativa ? "Trocar chave" : "Conectar chave"}
          </button>
          {ativa ? (
            <button type="button" className={`btn sm ${s.btPeq}`} onClick={() => setRemover(true)} disabled={ocupado}>
              Remover
            </button>
          ) : null}
        </div>
      ) : podeTrocar ? (
        <form className={s.form} onSubmit={salvar} noValidate>
          <label className={s.rotulo} htmlFor="chave-anthropic">
            {ativa ? "Trocar por outra chave" : "Colar a chave"}
          </label>
          <div className={s.linha}>
            <input
              ref={campo}
              id="chave-anthropic"
              className={`f ${s.campo}`}
              type="password"
              name="chave-anthropic"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              placeholder="sk-ant-…"
              value={valor}
              onChange={(e) => {
                setValor(e.target.value);
                if (erro) setErro(null);
              }}
              aria-invalid={!!erro}
              aria-describedby={erro ? "erro-chave" : "dica-chave"}
            />
            <button type="submit" className="btn pri" disabled={ocupado || !valor} aria-busy={ocupado}>
              {ocupado ? <Icone nome="loader" className="spin" tam={15} /> : null}
              {/* a API confere a chave na Anthropic antes de guardar: pode levar alguns segundos */}
              {ocupado ? "Conferindo…" : ativa ? "Trocar chave" : "Conectar chave"}
            </button>
          </div>
          {erro ? (
            <div id="erro-chave" className="campo-erro" role="alert">
              {erro}
            </div>
          ) : (
            <div id="dica-chave" className={s.dica}>
              A chave é guardada cifrada e nunca mais aparece na tela, nem para você.
            </div>
          )}
          {como}
          <button
            type="button"
            className={`link ${s.cancelar}`}
            onClick={() => {
              setAberto(false);
              setValor("");
              setErro(null);
            }}
          >
            Cancelar
          </button>
        </form>
      ) : (
        <p className={s.so}>
          <Icone nome="info" tam={15} />
          Só admin ou master conecta, troca ou remove a chave.
        </p>
      )}
    </div>
  );

  const selo = (
    <span className={s.selo} data-tom={ativa ? "ok" : "neutro"}>
      {ativa ? "Ativa" : "Não conectada"}
    </span>
  );

  return (
    <section className={props.className} aria-labelledby="t-chave">
      {props.compacto ? (
        <>
          {/* Celular: o cartão é uma linha de situação; tocar abre as ações (o protótipo não as mostra de cara). */}
          <h2 id="t-chave" className={s.h2Cel}>
            <button type="button" className={s.abreCel} aria-expanded={abertoCel} onClick={() => setAbertoCel((v) => !v)}>
              <span className={s.esp}>Chave da Anthropic</span>
              {selo}
            </button>
          </h2>
          <p className={s.meta}>{ativa ? [`termina em …${final}`, quem].filter(Boolean).join(" · ") : "Não conectada: as conversas usam os créditos."}</p>
          {abertoCel ? pe : null}
        </>
      ) : (
        <>
          <div className={s.cabCartao}>
            <h2 id="t-chave" className={s.h2}>
              Chave da Anthropic
            </h2>
            {selo}
          </div>
          <p className={s.meta}>
            {ativa
              ? "A IA da empresa usa esta chave. Nada é cobrado dos créditos da plataforma."
              : "Nenhuma chave conectada. As conversas usam os créditos da empresa."}
          </p>
          {ativa ? (
            <dl className={s.dados}>
              <dt>Termina em</dt>
              <dd>
                <code className={s.final}>…{final}</code>
              </dd>
              {quem ? (
                <>
                  <dt>Conectada</dt>
                  <dd>{quem}</dd>
                </>
              ) : null}
            </dl>
          ) : null}
          {pe}
        </>
      )}

      {remover ? (
        <Modal
          titulo="Remover a chave da Anthropic?"
          fechar={() => !ocupado && setRemover(false)}
          focoInicial={cancelar}
          rodape={
            <>
              <button ref={cancelar} type="button" className="btn" onClick={() => setRemover(false)} disabled={ocupado}>
                Cancelar
              </button>
              <button type="button" className={`btn ${s.perigo}`} onClick={confirmarRemocao} disabled={ocupado} aria-busy={ocupado}>
                {ocupado ? <Icone nome="loader" className="spin" tam={15} /> : null}
                Remover
              </button>
            </>
          }
        >
          <p className={s.texto}>
            As conversas voltam a descontar os créditos da empresa. Para usar uma chave de novo, será preciso colá-la outra vez.
          </p>
        </Modal>
      ) : null}
    </section>
  );
}
