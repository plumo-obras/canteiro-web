"use client";
/**
 * /conta: perfil, chave própria da Anthropic e créditos de IA. Tudo vem do servidor (GET /conta e GET /uso); o papel
 * mostrado aqui só decide o que a tela oferece: quem barra de verdade a troca da chave é a API.
 */
import { useState } from "react";
import type { Obra, Papel, Usuario } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { Icone } from "../Icone";
import { useCarregar } from "../useCarregar";
import { Chave } from "./Chave";
import { Creditos } from "./Creditos";
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

  const c = conta.dado;
  return (
    <>
      <header className={s.cab}>
        <h1 className={s.titulo}>Conta</h1>
        <p className={s.sub}>Seu perfil, a chave da Anthropic e os créditos de IA da empresa.</p>
      </header>

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
          <section className={`${s.bloco} ${s.perfil}`} aria-labelledby="t-perfil">
            <h2 id="t-perfil" className={s.h2}>
              Perfil
            </h2>
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
                <dt>Papel</dt>
                <dd>
                  <span className={s.papel}>{PAPEL[c.usuario.papel].nome}</span>
                  <span className={s.diz}>{PAPEL[c.usuario.papel].diz}</span>
                </dd>
              </div>
              <div>
                <dt>Empresa</dt>
                <dd>{c.tenant.nome}</dd>
              </div>
            </dl>
          </section>

          <Chave
            className={`${s.bloco} ${s.chave}`}
            situacao={c.chave_propria}
            podeTrocar={c.usuario.papel === "master"}
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
        </div>
      )}
      {/* O usuário logado já está no topo; aqui fica só para leitores de tela saberem de quem é a conta. */}
      <span className="sr-only">Conta de {usuario.nome}</span>
    </>
  );
}
