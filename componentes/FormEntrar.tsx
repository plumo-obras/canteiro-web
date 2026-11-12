"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { entrar } from "@/lib/sessao";
import { Icone, Logo } from "./Icone";
import { ModeloVitrine } from "./ModeloVitrine";
import { BotaoTema } from "./tema";
import s from "./entrar.module.css";

// O que o Plumo faz, na ordem em que acontece: é a promessa da vitrine, não um menu.
const PASSOS = ["Modelo 3D", "Orçamento e compras", "Cronograma", "Acompanhe conversando"];
const FACES = [s.f0, s.f1, s.f2, s.f3, s.f4, s.f5, s.f6, s.f7, s.f8] as const;

export function FormEntrar({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setErro(null);
    const r = await entrar(email, senha).catch(() => ({ ok: false as const, mensagem: "Sem conexão com o servidor. Tente de novo." }));
    if (r.ok) router.replace("/inicio");
    else {
      setErro(r.mensagem);
      setOcupado(false);
    }
  };

  return (
    <main className={s.pagina}>
      <section className={s.lado}>
        <header className={s.topo}>
          <span className={s.marca}>
            <Logo />
            Plumo
          </span>
          <BotaoTema className={s.tema} />
        </header>

        <form className={s.form} onSubmit={enviar} aria-describedby={erro ? "erro-entrar" : undefined}>
          <h1 className={s.titulo}>Bem-vindo de volta</h1>
          <p className={s.sub}>Entre para acompanhar suas obras.</p>

          <label className={s.rotulo} htmlFor="email">
            E-mail
          </label>
          <div className={s.campo}>
            <input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="nome@empresa.com.br"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <span className={s.icone}>
              <Icone nome="email" tam={17} />
            </span>
          </div>

          <label className={s.rotulo} htmlFor="senha">
            Senha
          </label>
          <div className={s.campo}>
            <input
              id="senha"
              type={verSenha ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Sua senha"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
            <button
              type="button"
              className={s.olho}
              aria-label={verSenha ? "Esconder a senha" : "Mostrar a senha"}
              aria-pressed={verSenha}
              onClick={() => setVerSenha((v) => !v)}
            >
              <Icone nome={verSenha ? "olhoFechado" : "olho"} tam={17} />
            </button>
          </div>

          {erro ? (
            <div id="erro-entrar" className={s.erro} role="alert">
              {erro}
            </div>
          ) : null}

          <button type="submit" className={s.botao} disabled={ocupado} aria-busy={ocupado}>
            {ocupado ? <Icone nome="loader" className="spin" tam={16} /> : null}
            Entrar
          </button>

          {/* Não há recuperação de senha por e-mail: quem cria e troca acesso é o master da conta. */}
          <p className={s.ajuda}>Esqueceu a senha? Fale com o administrador da sua empresa.</p>

          {demo ? (
            <p className={s.nota}>
              Modo de demonstração: qualquer e-mail e senha entram como admin. Um e-mail que começa com <b>leitura</b> entra com o
              papel de leitura, e um que começa com <b>master</b> entra como master.
            </p>
          ) : null}
        </form>

        <footer className={s.rodape}>Plumo © {new Date().getFullYear()}</footer>
      </section>

      {/* A vitrine: a estrutura que sai das pranchas. Vem depois do formulário no DOM (o leitor de tela chega primeiro em
          entrar); no celular sobe para o topo, menor, só pelo CSS. */}
      <aside className={s.vitrine} aria-label="O que o Plumo faz">
        <ModeloVitrine className={s.modelo} faces={FACES} />
        <div className={s.vitrineTexto}>
          <h2 className={s.chamada}>
            Mande a planta.
            <br />O Plumo monta a obra.
          </h2>
          <ol className={s.passos}>
            {PASSOS.map((p, i) => (
              <li key={p}>
                <span className={s.passoN} aria-hidden="true">
                  {i + 1}
                </span>
                {p}
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </main>
  );
}
