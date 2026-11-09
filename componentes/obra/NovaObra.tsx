"use client";
/**
 * Nova obra numa tela só: o básico para começar. Endereço, padrão e contrato ficam em Dados da obra, porque nada disso
 * impede de enviar o projeto, que é o que vem a seguir. A obra nasce "em orçamento" e abre direto na tela Projeto.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Usuario } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { uuid7 } from "@/lib/ids";
import { ErroApi, useEnvio } from "../formularios/Campos";
import { Icone } from "../Icone";
import { Moldura } from "../inicio/Moldura";
import { CamposNovaObra, dadosDe, formDe, validarObra, type FormObra } from "./CamposObra";
import s from "./obra.module.css";

export function NovaObraPagina({ demo }: { demo: boolean }) {
  return (
    <Moldura demo={demo} rota="inicio">
      {(u) => <NovaObra usuario={u} />}
    </Moldura>
  );
}

export function NovaObra({ usuario }: { usuario: Usuario }) {
  const router = useRouter();
  const [f, setF] = useState<FormObra>(() => formDe());
  // Uma chave por cadastro: clicar duas vezes (ou a rede repetir) não cria duas obras.
  const chave = useRef(uuid7());
  const mudar = (p: Partial<FormObra>) => setF((x) => ({ ...x, ...p }));

  const { erros, erroApi, ocupado, enviar } = useEnvio(
    () => validarObra(f, "tudo") as Record<string, string | null>,
    async () => {
      const dados = dadosDe(f);
      const o = await api.criarObra({ ...dados, nome: dados.nome!, chave_idempotencia: chave.current });
      router.push(`/?obra=${encodeURIComponent(o.id)}&tela=projeto`);
    },
  );

  if (usuario.papel === "viewer") {
    return (
      <div className="card vazio">
        <Icone nome="info" tam={24} />
        <h3>Seu papel não cadastra obras</h3>
        <p>Peça a um administrador da sua empresa para cadastrar a obra.</p>
      </div>
    );
  }

  return (
    <div className="form-pagina">
      <Link href="/inicio" className="voltar-link">
        ← Suas obras
      </Link>
      <section className="card form-card" aria-labelledby="nova-obra-titulo">
        <h1 id="nova-obra-titulo">Nova obra</h1>
        <p className="mut">O básico para começar. Endereço, padrão e dados do contrato você completa quando precisar.</p>
        <form id="form-nova-obra" onSubmit={enviar} noValidate>
          <CamposNovaObra f={f} mudar={mudar} erros={erros} />
          <ErroApi texto={erroApi} />
          <div className={s.rodape}>
            <p className="mut sm">Em seguida você envia o projeto, e o Plumo levanta os materiais da obra.</p>
            <button type="submit" className={`btn amb ${s.criar}`} disabled={ocupado} aria-busy={ocupado}>
              {ocupado ? <Icone nome="loader" className="spin" tam={14} /> : null}
              Criar obra
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
