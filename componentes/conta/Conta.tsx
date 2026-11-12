"use client";
/**
 * /conta: perfil, senha, chave própria da Anthropic e créditos de IA. Tudo vem do servidor (GET /conta e GET /uso); o papel
 * mostrado aqui só decide o que a tela oferece: quem barra de verdade a troca da chave é a API.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Obra, Papel, Usuario } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { sair } from "@/lib/sessao";
import { CabecalhoPagina } from "../CabecalhoPagina";
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
  admin: { nome: "Admin", diz: "aprova e opera as obras" },
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
  return (
    <>
      <CabecalhoPagina titulo="Conta" sub="Seu perfil, a senha, a chave da Anthropic e o uso de IA da empresa." />

      {conta.erro && !c ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          <span>
            Não consegui carregar a conta: {conta.erro}{" "}
            <button type="button" className={s.link} onClick={() => setVersao((v) => v + 1)}>
              Tentar de novo
            </button>
          </span>
        </div>
      ) : !c ? (
        <div className="carregando" role="status">
          <Icone nome="loader" className="spin" tam={15} />
          Carregando a conta…
        </div>
      ) : (
        <div className={s.grade}>
          {/* Perfil e chave: o mesmo esqueleto (título + selo, dados, pé), lado a lado e da mesma altura no desktop. */}
          <section className={`${s.bloco} ${s.par}`} aria-labelledby="t-perfil">
            <div className={s.cabCartao}>
              <h2 id="t-perfil" className={s.h2}>
                Perfil
              </h2>
              <span className={s.selo} data-tom={c.usuario.papel === "viewer" ? "neutro" : "marca"}>
                {PAPEL[c.usuario.papel].nome}
              </span>
            </div>
            <div className={s.quem}>
              <span className={s.av} aria-hidden="true">
                {iniciais(c.usuario.nome)}
              </span>
              <div className={s.quemT}>
                <b>{c.usuario.nome}</b>
                <span>{c.usuario.email}</span>
              </div>
            </div>
            <dl className={s.dados}>
              <div>
                <dt>Empresa</dt>
                <dd>{c.tenant.nome}</dd>
              </div>
              <div>
                <dt>Papel</dt>
                <dd>
                  <span className={s.papel}>{PAPEL[c.usuario.papel].nome}</span>
                  <span className={s.diz}>{PAPEL[c.usuario.papel].diz}</span>
                </dd>
              </div>
            </dl>
          </section>

          {/* A chave vem antes da senha no HTML porque no desktop ela fica ao lado do perfil: o Tab segue a ordem que se vê. */}
          <Chave
            className={`${s.bloco} ${s.par}`}
            situacao={c.chave_propria}
            podeTrocar={c.usuario.papel !== "viewer"}
            mudou={() => setVersao((v) => v + 1)}
          />

          <Creditos
            className={`${s.bloco} ${s.creditos}`}
            creditos={c.creditos}
            chaveAtiva={!!c.chave_propria?.ativa}
            dias={dias}
            uso={uso}
            obras={obras.dado ?? []}
          />

          {/* No celular a senha entra na lista com Tema e Sair (o avatar fica longe do polegar); no desktop, tema e sair
              já estão no menu do avatar e a senha é um cartão recolhido. */}
          {celular ? (
            <OpcoesCelular email={c.usuario.email} />
          ) : (
            <Senha className={`${s.bloco} ${s.senha}`} email={c.usuario.email} />
          )}
        </div>
      )}
      {/* O usuário logado já está no topo; aqui fica só para leitores de tela saberem de quem é a conta. */}
      <span className="sr-only">Conta de {usuario.nome}</span>
    </>
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
        <Icone nome={tema === "escuro" ? "lua" : "sol"} tam={17} />
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
        <Icone nome="logout" tam={17} />
        <span className={s.opcaoT}>Sair</span>
      </button>
    </div>
  );
}
