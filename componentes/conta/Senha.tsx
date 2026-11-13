"use client";
/**
 * Troca da própria senha. Qualquer papel troca a sua; a API confere a atual, derruba as outras sessões e devolve uma
 * nova para este aparelho (lib/sessao.trocarSenha guarda). As senhas digitadas saem do estado assim que a troca dá
 * certo ou o formulário é fechado.
 */
import { useEffect, useRef, useState } from "react";
import { trocarSenha } from "@/lib/sessao";
import { useCasca } from "../contexto";
import { Icone } from "../Icone";
import s from "./conta.module.css";

export const SENHA_MIN = 8;
const SENHA_MAX = 256;

/**
 * O que a tela já sabe recusar sem perguntar à API (o resto — senha atual errada, igual à atual, igual ao e-mail —
 * vem da API com a mensagem pronta). Devolve null quando dá para enviar.
 */
export function problemaNaSenha(atual: string, nova: string, confirmar: string): string | null {
  if (!atual) return "Informe a senha atual.";
  if (nova.length < SENHA_MIN) return `A nova senha precisa ter pelo menos ${SENHA_MIN} caracteres.`;
  if (nova.length > SENHA_MAX) return `A nova senha pode ter no máximo ${SENHA_MAX} caracteres.`;
  if (nova !== confirmar) return "A confirmação não confere com a nova senha.";
  return null;
}

export function Senha(props: { className: string; email: string }) {
  const { avisar } = useCasca();
  const [aberto, setAberto] = useState(false);
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [ver, setVer] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const primeiro = useRef<HTMLInputElement>(null);
  // Ao abrir, o foco já vai para o primeiro campo: é o único passo seguinte possível.
  useEffect(() => {
    if (aberto) primeiro.current?.focus();
  }, [aberto]);

  const problema = problemaNaSenha(atual, nova, confirmar);
  // Só aponta o que a pessoa já terminou de digitar: avisar "curta" no primeiro caractere é ruído.
  const curta = nova.length > 0 && nova.length < SENHA_MIN;
  const naoConfere = confirmar.length > 0 && confirmar !== nova;

  const fechar = () => {
    setAberto(false);
    setAtual("");
    setNova("");
    setConfirmar("");
    setVer(false);
    setErro(null);
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problema || ocupado) return;
    setOcupado(true);
    setErro(null);
    const r = await trocarSenha(atual, nova);
    setOcupado(false);
    if (!r.ok) {
      setErro(r.mensagem);
      return;
    }
    fechar();
    avisar("Senha trocada. Os outros aparelhos foram desconectados.");
  };

  const campo = (id: string, rotulo: string, valor: string, mudar: (v: string) => void, auto: string, descrito?: string, abaixo?: React.ReactNode) => (
    <div className={s.campoSenha}>
      <label className={s.rotulo} htmlFor={id}>
        {rotulo}
      </label>
      <input
        ref={id === "senha-atual" ? primeiro : undefined}
        id={id}
        className={`f ${s.entrada}`}
        type={ver ? "text" : "password"}
        autoComplete={auto}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        value={valor}
        onChange={(ev) => {
          mudar(ev.target.value);
          if (erro) setErro(null);
        }}
        aria-describedby={descrito}
        aria-invalid={descrito?.startsWith("erro-") || undefined}
      />
      {abaixo}
    </div>
  );

  return (
    <section className={props.className} aria-labelledby="t-senha" data-aberto={aberto}>
      {/* Recolhível com botão (e não <details>): fechar precisa esquecer o que foi digitado, e o details fecharia sem avisar. */}
      <h2 id="t-senha" className={s.h2Senha}>
        <button
          type="button"
          className={s.abreSenha}
          aria-expanded={aberto}
          aria-controls={aberto ? "form-senha" : undefined}
          aria-describedby="senha-explica"
          aria-label="Trocar senha"
          onClick={() => (ocupado ? undefined : aberto ? fechar() : setAberto(true))}
        >
          <span className={s.abreSenhaT}>Trocar senha</span>
          <span id="senha-explica" className={s.abreSenhaMeta}>
            Os outros aparelhos são desconectados.
          </span>
          <Icone nome="chevDown" tam={17} className={s.seta} />
        </button>
      </h2>
      {!aberto ? null : (
        <form id="form-senha" className={s.formSenha} onSubmit={enviar} noValidate>
          {/* Para o gerenciador de senhas saber de qual conta é a senha nova. */}
          <input type="text" name="username" autoComplete="username" value={props.email} readOnly hidden />
          {/* Os três campos lado a lado no desktop: cada aviso fica embaixo do seu campo. */}
          <div className={s.camposSenha}>
            {campo("senha-atual", "Senha atual", atual, setAtual, "current-password")}
            {campo(
              "senha-nova",
              "Nova senha",
              nova,
              setNova,
              "new-password",
              curta ? "erro-senha-curta" : "dica-senha",
              curta ? (
                <div id="erro-senha-curta" className="campo-erro">
                  Pelo menos {SENHA_MIN} caracteres.
                </div>
              ) : (
                <div id="dica-senha" className={s.dica}>
                  Pelo menos {SENHA_MIN} caracteres, diferente da atual e do seu e-mail.
                </div>
              ),
            )}
            {campo(
              "senha-confirmar",
              "Confirmar a nova senha",
              confirmar,
              setConfirmar,
              "new-password",
              naoConfere ? "erro-senha-confere" : undefined,
              naoConfere ? (
                <div id="erro-senha-confere" className="campo-erro">
                  A confirmação não confere com a nova senha.
                </div>
              ) : null,
            )}
          </div>

          <button type="button" className={s.verSenhas} aria-pressed={ver} onClick={() => setVer((v) => !v)}>
            <Icone nome={ver ? "olhoFechado" : "olho"} tam={16} />
            {ver ? "Esconder as senhas" : "Mostrar as senhas"}
          </button>

          {erro ? (
            <div className="campo-erro" role="alert">
              {erro}
            </div>
          ) : null}

          <div className={s.acoesSenha}>
            <button type="submit" className="btn pri" disabled={!!problema || ocupado} aria-busy={ocupado}>
              {ocupado ? <Icone nome="loader" className="spin" tam={15} /> : null}
              Salvar a nova senha
            </button>
            <button type="button" className="btn" onClick={fechar} disabled={ocupado}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
