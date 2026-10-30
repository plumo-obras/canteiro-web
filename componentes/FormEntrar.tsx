"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { entrar } from "@/lib/sessao";
import { Icone, Logo } from "./Icone";

export function FormEntrar({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setErro(null);
    const r = await entrar(email, senha).catch(() => ({ ok: false as const, mensagem: "Sem conexão com o servidor. Tente de novo." }));
    if (r.ok) router.replace("/");
    else {
      setErro(r.mensagem);
      setOcupado(false);
    }
  };

  return (
    <main className="entrar">
      <form className="card" onSubmit={enviar} aria-describedby={erro ? "erro-entrar" : undefined}>
        <div className="brand">
          <Logo />
          Canteiro
        </div>
        <h1>Entrar</h1>
        <p className="mut" style={{ margin: 0 }}>
          Use o e-mail da sua empresa.
        </p>
        <label className="l" htmlFor="email">
          E-mail
        </label>
        <input id="email" className="f" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="l" htmlFor="senha">
          Senha
        </label>
        <input id="senha" className="f" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        {erro ? (
          <div id="erro-entrar" className="campo-erro" role="alert">
            {erro}
          </div>
        ) : null}
        <button type="submit" className="btn amb" disabled={ocupado} aria-busy={ocupado}>
          {ocupado ? <Icone nome="loader" className="spin" tam={15} /> : null}
          Entrar
        </button>
        {demo ? (
          <p className="nota">
            Modo de demonstração: qualquer e-mail e senha entram como admin. Um e-mail que começa com{" "}
            <b>leitura</b> entra com o papel de leitura.
          </p>
        ) : null}
      </form>
    </main>
  );
}
