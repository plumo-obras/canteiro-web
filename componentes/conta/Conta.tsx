"use client";
/**
 * /conta: perfil, chave própria da Anthropic, uso de IA (com a franquia numa linha) e senha. Tudo vem do servidor (GET /conta e GET /uso); o papel
 * mostrado aqui só decide o que a tela oferece: quem barra de verdade a troca da chave é a API.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Obra, Papel, Usuario } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { sair } from "@/lib/sessao";
import { AVISO_PREVIA, problemaNoNome } from "@/lib/simulado/conta";
import { CabecalhoPagina } from "../CabecalhoPagina";
import { useCasca } from "../contexto";
import { Icone } from "../Icone";
import { useCelular } from "../midia";
import { trocarTema, useTema } from "../tema";
import { useCarregar } from "../useCarregar";
import { Chave } from "./Chave";
import { Creditos } from "./Creditos";
import { Senha } from "./Senha";
import s from "./conta.module.css";
import { ultimosDias } from "./formato";

const PAPEL: Record<Papel, { nome: string; diz: string }> = {
  viewer: { nome: "Leitura", diz: "vê tudo, não aprova nem opera" },
  admin: { nome: "Admin", diz: "aprova e opera; não gerencia usuários" },
  master: { nome: "Master", diz: "administra a conta da empresa" },
};

const iniciais = (n: string) =>
  n
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

export function Conta({ usuario }: { usuario: Usuario }) {
  const [versao, setVersao] = useState(0);
  const dias = ultimosDias(30);
  const conta = useCarregar(() => api.conta(), [versao]);
  // Consumo e nomes das obras não impedem a página: cada um falha sozinho, com o próprio aviso.
  const uso = useCarregar(() => api.uso(dias[0]!, dias.at(-1)!), [versao]);
  const obras = useCarregar(() => api.listarObras().catch(() => [] as Obra[]), []);

  const celular = useCelular();
  const c = conta.dado;
  const mudou = () => setVersao((v) => v + 1);
  return (
    <div className={s.miolo}>
      {/* No celular o título já está no topo (voltar + Conta); o h1 fica para leitores de tela. */}
      {celular ? (
        <h1 className="sr-only">Conta</h1>
      ) : (
        <CabecalhoPagina titulo="Conta" sub="Seu perfil, a senha, a chave da Anthropic e o uso de IA da empresa." />
      )}

      {conta.erro && !c ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          <span>
            Não consegui carregar a conta: {conta.erro}{" "}
            <button type="button" className={s.link} onClick={mudou}>
              Tentar de novo
            </button>
          </span>
        </div>
      ) : !c ? (
        <div className="carregando" role="status">
          <Icone nome="loader" className="spin" tam={15} />
          Carregando a conta…
        </div>
      ) : celular ? (
        <div className={s.grade}>
          <Perfil className={`${s.bloco} ${s.blocoCel}`} usuario={c.usuario} empresa={c.tenant.nome} compacto />
          <Chave className={`${s.bloco} ${s.blocoCel}`} situacao={c.chave_propria} podeTrocar={c.usuario.papel !== "viewer"} mudou={mudou} compacto />
          <Creditos
            className={`${s.bloco} ${s.blocoCel}`}
            creditos={c.creditos}
            chaveAtiva={!!c.chave_propria?.ativa}
            dias={dias}
            uso={uso}
            obras={obras.dado ?? []}
            compacto
          />
          {/* A senha entra na lista com Tema e Sair (o avatar fica longe do polegar). */}
          <OpcoesCelular email={c.usuario.email} />
        </div>
      ) : (
        <div className={s.grade}>
          {/* Perfil e chave: o mesmo esqueleto (título + selo, dados, pé), lado a lado e da mesma altura. */}
          <div className={s.duas}>
            <Perfil className={`${s.bloco} ${s.par}`} usuario={c.usuario} empresa={c.tenant.nome} />
            <Chave className={`${s.bloco} ${s.par}`} situacao={c.chave_propria} podeTrocar={c.usuario.papel !== "viewer"} mudou={mudou} />
          </div>
          <Creditos
            className={`${s.bloco} ${s.creditos}`}
            creditos={c.creditos}
            chaveAtiva={!!c.chave_propria?.ativa}
            dias={dias}
            uso={uso}
            obras={obras.dado ?? []}
          />
          <Senha className={`${s.bloco} ${s.senha}`} email={c.usuario.email} />
        </div>
      )}
      {/* O usuário logado já está no topo; aqui fica só para leitores de tela saberem de quem é a conta. */}
      <span className="sr-only">Conta de {usuario.nome}</span>
    </div>
  );
}

/**
 * Perfil: avatar, nome, e-mail, empresa e papel. "Editar nome" é prévia (lib/simulado/conta.ts): a API ainda não
 * troca o nome, então a tela muda só o que mostra e avisa que não salvou.
 */
function Perfil(props: { className: string; usuario: { nome: string; email: string; papel: Papel }; empresa: string; compacto?: boolean }) {
  const { avisar } = useCasca();
  const [nome, setNome] = useState(props.usuario.nome);
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const papel = PAPEL[props.usuario.papel];
  const selo = (
    <span className={s.selo} data-tom={props.usuario.papel === "viewer" ? "neutro" : "marca"}>
      {papel.nome}
    </span>
  );
  const quem = (
    <div className={s.quem}>
      <span className={s.av} aria-hidden="true">
        {iniciais(nome)}
      </span>
      <div className={s.quemT}>
        <b>{nome}</b>
        <span>{props.usuario.email}</span>
      </div>
      {props.compacto ? selo : null}
    </div>
  );

  if (props.compacto) {
    return (
      <section className={props.className} aria-label="Perfil">
        {quem}
      </section>
    );
  }

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const p = problemaNoNome(valor);
    if (p) {
      setErro(p);
      return;
    }
    setNome(valor.trim());
    setEditando(false);
    avisar(AVISO_PREVIA);
  };

  return (
    <section className={props.className} aria-labelledby="t-perfil">
      <div className={s.cabCartao}>
        <h2 id="t-perfil" className={s.h2}>
          Perfil
        </h2>
        {selo}
      </div>
      {quem}
      <dl className={s.dados}>
        <dt>Empresa</dt>
        <dd>{props.empresa}</dd>
        <dt>Papel</dt>
        <dd>
          {papel.nome} · {papel.diz}
        </dd>
      </dl>
      <div className={s.pe}>
        {editando ? (
          <form className={s.form} onSubmit={salvar} noValidate>
            <label className={s.rotulo} htmlFor="perfil-nome">
              Seu nome
            </label>
            <div className={s.linha}>
              <input
                id="perfil-nome"
                className={`f ${s.campo}`}
                value={valor}
                autoFocus
                autoComplete="name"
                onChange={(e) => {
                  setValor(e.target.value);
                  if (erro) setErro(null);
                }}
                aria-invalid={!!erro}
                aria-describedby={erro ? "erro-nome" : undefined}
              />
              <button type="submit" className="btn pri">
                Salvar
              </button>
            </div>
            {erro ? (
              <div id="erro-nome" className="campo-erro" role="alert">
                {erro}
              </div>
            ) : null}
            <button type="button" className={`link ${s.cancelar}`} onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </form>
        ) : (
          <button
            type="button"
            className={`btn sm ${s.btPeq}`}
            onClick={() => {
              setValor(nome);
              setErro(null);
              setEditando(true);
            }}
          >
            Editar nome
          </button>
        )}
      </div>
    </section>
  );
}

/** Trocar senha, Tema e Sair numa lista, como os ajustes de um celular. A senha abre o formulário ali mesmo. */
function OpcoesCelular({ email }: { email: string }) {
  const router = useRouter();
  const tema = useTema();
  const outro = tema === "escuro" ? "claro" : "escuro";
  return (
    <div className={s.opcoes} role="group" aria-label="Opções da conta">
      <Senha className={`${s.opcaoSenha}`} email={email} />
      <button type="button" className={s.opcao} aria-label={`Tema ${tema}: trocar para o ${outro}`} onClick={() => trocarTema(outro)}>
        <span className={s.opcaoT}>Tema</span>
        <span className={s.diz}>{tema}</span>
      </button>
      <button
        type="button"
        className={`${s.opcao} ${s.opcaoSair}`}
        onClick={async () => {
          await sair();
          router.replace("/entrar");
        }}
      >
        <span className={s.opcaoT}>Sair</span>
      </button>
    </div>
  );
}
