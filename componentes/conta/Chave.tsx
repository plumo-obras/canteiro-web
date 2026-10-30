"use client";
/**
 * Chave própria da Anthropic. A tela nunca vê a chave guardada (a API devolve só os 4 últimos caracteres) e a que é
 * digitada sai do estado assim que é enviada. Trocar e remover são do papel master; os outros só veem a situação.
 */
import { useRef, useState } from "react";
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

export function Chave(props: { className: string; situacao: ChavePropria | null; podeTrocar: boolean; mudou: () => void }) {
  const { situacao, podeTrocar, mudou } = props;
  const { avisar } = useCasca();
  const ativa = !!situacao?.ativa;
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [remover, setRemover] = useState(false);
  const cancelar = useRef<HTMLButtonElement>(null);

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
  return (
    <section className={props.className} aria-labelledby="t-chave">
      <h2 id="t-chave" className={s.h2}>
        Chave própria da Anthropic
      </h2>
      <p className={s.situacao} data-ativa={ativa}>
        <span className={s.sinal} aria-hidden="true" />
        {ativa ? (
          <span>
            <b>Ativa</b>, termina em <code className={s.final}>…{final}</code>
            {situacao?.cadastrada_em ? <span className={s.diz}> · conectada em {fmtDiaHora(situacao.cadastrada_em)}</span> : null}
          </span>
        ) : (
          <span>
            <b>Nenhuma chave conectada.</b> As conversas usam os créditos da empresa.
          </span>
        )}
      </p>
      <p className={s.texto}>
        Com uma chave própria, o Canteiro usa a sua conta da Anthropic e não desconta créditos. A cobrança vem da Anthropic
        direto para você.
      </p>
      <div className={s.aviso} role="note">
        <Icone nome="info" tam={15} />
        <span>
          Precisa ser uma <b>chave de API de uma organização</b> no Console da Anthropic (console.anthropic.com, começa com{" "}
          <code>sk-ant-</code>). A assinatura Pro ou Max do Claude não serve.
        </span>
      </div>

      {podeTrocar ? (
        <form className={s.form} onSubmit={salvar} noValidate>
          <label className={s.rotulo} htmlFor="chave-anthropic">
            {ativa ? "Trocar por outra chave" : "Colar a chave"}
          </label>
          <div className={s.linha}>
            <input
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
              {ativa ? "Trocar chave" : "Conectar chave"}
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
          {ativa ? (
            <button type="button" className={`btn ${s.remover}`} onClick={() => setRemover(true)} disabled={ocupado}>
              Remover chave
            </button>
          ) : null}
        </form>
      ) : (
        <p className={s.so}>
          <Icone nome="info" tam={15} />
          Só quem tem o papel master conecta, troca ou remove a chave.
        </p>
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
