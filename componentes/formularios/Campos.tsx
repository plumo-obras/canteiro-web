"use client";
/**
 * Peças dos formulários que gravam (sempre dentro de um Modal): campo com rótulo, dica e erro amarrados por
 * aria-describedby, e o envio que trava o botão enquanto a API responde. O erro de cada campo aparece embaixo dele;
 * o erro da API, no fim do formulário.
 */
import { useId, useState, type ReactNode } from "react";
import { mensagemDe } from "../contexto";

export function Campo(props: {
  rotulo: string;
  dica?: ReactNode;
  /** A dica vira alerta (âmbar): o valor é aceito, mas merece um segundo olhar. */
  alerta?: boolean;
  erro?: string | null;
  children: (a: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
}) {
  const id = useId();
  const desc = [props.dica ? `${id}-dica` : "", props.erro ? `${id}-erro` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="campo">
      <label className="l" htmlFor={id}>
        {props.rotulo}
      </label>
      {props.children({
        id,
        "aria-invalid": !!props.erro,
        "aria-describedby": desc,
      })}
      {props.dica ? (
        <div id={`${id}-dica`} className={`campo-dica${props.alerta ? " alerta" : ""}`}>
          {props.dica}
        </div>
      ) : null}
      {props.erro ? (
        <div id={`${id}-erro`} className="campo-erro" role="alert">
          {props.erro}
        </div>
      ) : null}
    </div>
  );
}

/** Envio de formulário: `validar` devolve os erros por campo (vazio = ok); `gravar` só roda se passou. */
export function useEnvio<E extends Record<string, string | null>>(validar: () => E, gravar: () => Promise<void>) {
  const [erros, setErros] = useState<Partial<E>>({});
  const [erroApi, setErroApi] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const enviar = async (ev?: React.FormEvent) => {
    ev?.preventDefault();
    const es = validar();
    const algum = Object.values(es).some(Boolean);
    setErros(es);
    setErroApi(null);
    if (algum) {
      // O foco vai para o primeiro campo com erro: quem usa leitor de tela ouve o problema na hora.
      requestAnimationFrame(() => document.querySelector<HTMLElement>(".modal [aria-invalid=true], .form-pagina [aria-invalid=true]")?.focus());
      return;
    }
    setOcupado(true);
    try {
      await gravar();
    } catch (x) {
      setErroApi(mensagemDe(x));
    } finally {
      // O modal fecha ao gravar, mas o formulário em passos continua na tela e precisa do botão de volta.
      setOcupado(false);
    }
  };
  return { erros, erroApi, ocupado, enviar };
}

export function ErroApi({ texto }: { texto: string | null }) {
  return texto ? (
    <div className="aviso-erro form-erro" role="alert">
      {texto}
    </div>
  ) : null;
}
