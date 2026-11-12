"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { entrar } from "@/lib/sessao";
import { Icone, Logo } from "./Icone";
import { useCelular } from "./midia";
import { ModeloVitrine } from "./ModeloVitrine";
import { BotaoTema } from "./tema";
import s from "./entrar.module.css";

// O que o Plumo faz, na ordem em que acontece: é a promessa da vitrine, não um menu.
const PASSOS = ["Modelo 3D", "Orçamento e compras", "Cronograma", "Acompanhe conversando"];
const FACES = [s.f0, s.f1, s.f2, s.f3, s.f4, s.f5, s.f6, s.f7, s.f8] as const;
// As disciplinas sobre o modelo: o que já saiu das pranchas e o que vem em seguida (decorativo, como o próprio modelo).
const SELOS = [
  { texto: "E-01 Fundações", tom: "ok", classe: s.seloFund },
  { texto: "E-05 Laje", tom: "ok", classe: s.seloLaje },
  { texto: "H-01 Hidráulica · a seguir", tom: "vem", classe: s.seloHidr },
] as const;

export function FormEntrar({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [manter, setManter] = useState(true);
  const celular = useCelular();

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setErro(null);
    const r = await entrar(email, senha, manter).catch(() => ({ ok: false as const, mensagem: "Sem conexão com o servidor. Tente de novo." }));
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
          <p className={s.sub}>{celular ? "Mande a planta. O Plumo monta a obra." : "Entre para acompanhar suas obras."}</p>

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

          <div className={s.linha}>
            <label className={s.manter}>
              <input type="checkbox" checked={manter} onChange={(e) => setManter(e.target.checked)} />
              Manter conectado neste navegador
            </label>
            {/* Não há recuperação de senha por e-mail: quem cria e troca acesso é o master da conta. */}
            {celular ? null : <span className={s.ajuda}>Esqueceu a senha? Fale com o admin da empresa.</span>}
          </div>

          <button type="submit" className={s.botao} disabled={ocupado} aria-busy={ocupado}>
            {ocupado ? <Icone nome="loader" className="spin" tam={16} /> : null}
            Entrar
          </button>
          {celular ? <p className={s.ajudaCel}>Esqueceu a senha? Fale com o admin da empresa.</p> : null}

          {/* Só na demonstração, e recolhida: não é parte da tela de entrar de verdade. */}
          {demo ? (
            <details className={s.nota}>
              <summary>Modo de demonstração</summary>
              <p>
                Qualquer e-mail e senha entram como admin. Um e-mail que começa com <b>leitura</b> entra com o papel de leitura, e um
                que começa com <b>master</b> entra como master.
              </p>
            </details>
          ) : null}
        </form>

        <footer className={s.rodape}>Plumo © {new Date().getFullYear()}</footer>
      </section>

      {/* A vitrine: a estrutura que sai das pranchas. Vem depois do formulário no DOM (o leitor de tela chega primeiro em
          entrar); no celular sobe para o topo, menor, só pelo CSS. */}
      <aside className={s.vitrine} aria-label="O que o Plumo faz">
        <ModeloVitrine className={s.modelo} faces={FACES} />
        {SELOS.map((x) => (
          <span key={x.texto} className={`${s.selo} ${x.classe}`} data-tom={x.tom} aria-hidden="true">
            {x.texto}
          </span>
        ))}
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
