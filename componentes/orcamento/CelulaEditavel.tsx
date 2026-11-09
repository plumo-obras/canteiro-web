"use client";
/**
 * Número que se corrige na própria linha: toca, digita, Enter (ou sai do campo) grava; Esc desiste. Grava só o que
 * mudou, e o erro mantém o campo aberto com o que a pessoa digitou.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icone } from "../Icone";

export function CelulaEditavel(props: {
  rotulo: string;
  inicial: string;
  ajuda: string;
  ler: (texto: string) => number | null;
  salvar: (valor: number) => Promise<void>;
  alerta?: boolean;
  children: ReactNode;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const [invalido, setInvalido] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  // Enter grava e o campo fecha, o que dispara o blur: sem a trava, a mesma edição iria duas vezes.
  const gravando = useRef(false);
  const botao = useRef<HTMLButtonElement>(null);
  const voltarFoco = useRef(false);

  useEffect(() => {
    if (texto !== null) campo.current?.select();
    else if (voltarFoco.current) {
      voltarFoco.current = false;
      botao.current?.focus({ preventScroll: true });
    }
  }, [texto === null]); // eslint-disable-line react-hooks/exhaustive-deps -- só ao abrir e fechar, não a cada tecla

  const fechar = (foco: boolean) => {
    voltarFoco.current = foco;
    setInvalido(false);
    setTexto(null);
  };
  const gravar = async (foco: boolean) => {
    if (texto === null || gravando.current) return;
    if (texto.trim() === props.inicial) return fechar(foco);
    const v = props.ler(texto);
    if (v === null) return setInvalido(true);
    gravando.current = true;
    setOcupado(true);
    try {
      await props.salvar(v);
      fechar(foco);
    } catch {
      // o erro já foi avisado por quem salvou; o campo continua aberto para corrigir
    } finally {
      gravando.current = false;
      setOcupado(false);
    }
  };

  if (texto === null) {
    return (
      <button ref={botao} type="button" className={`eap-edit${props.alerta ? " alerta" : ""}`} aria-label={`Editar ${props.rotulo}`} onClick={() => setTexto(props.inicial)}>
        {props.children}
      </button>
    );
  }
  return (
    <>
      {ocupado ? <Icone nome="loader" className="spin" tam={12} /> : null}
      <input
        ref={campo}
        className="f eap-input"
        inputMode="decimal"
        autoComplete="off"
        aria-label={props.rotulo}
        aria-invalid={invalido}
        title={invalido ? props.ajuda : undefined}
        disabled={ocupado}
        value={texto}
        onChange={(e) => {
          setInvalido(false);
          setTexto(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void gravar(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            fechar(true);
          }
        }}
        onBlur={() => void gravar(false)}
      />
      {invalido ? (
        <span className="campo-erro" role="alert">
          {props.ajuda}
        </span>
      ) : null}
    </>
  );
}
