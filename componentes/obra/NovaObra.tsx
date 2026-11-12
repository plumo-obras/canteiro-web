"use client";
/**
 * Nova obra numa tela só: os dados em blocos (só o nome é obrigatório, o contrato vem recolhido) e, ao lado, por onde
 * começar depois de criar. A obra nasce "em orçamento"; o começo escolhido só decide aonde a tela vai em seguida, pelos
 * caminhos que já existem: a tela Projeto (pranchas), a tela Orçamento (importar a planilha) ou de volta às obras.
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

type Comeco = "pranchas" | "planilha" | "cadastrar";

const COMECOS: { k: Comeco; titulo: string; texto: string }[] = [
  { k: "pranchas", titulo: "Enviar as pranchas", texto: "PDF, imagem ou DXF. O Plumo levanta os materiais, o orçamento e as compras." },
  { k: "planilha", titulo: "Já tenho a planilha do orçamento", texto: "Importe do jeito que ela está e confira a prévia antes de gravar." },
  { k: "cadastrar", titulo: "Só cadastrar por enquanto", texto: "A obra fica na sua lista; o projeto vem quando você quiser." },
];

export function destinoDe(obraId: string, comeco: Comeco) {
  const id = encodeURIComponent(obraId);
  if (comeco === "cadastrar") return "/inicio";
  return `/?obra=${id}&tela=${comeco === "planilha" ? "orcamento" : "projeto"}`;
}

export function NovaObra({ usuario }: { usuario: Usuario }) {
  const router = useRouter();
  const [f, setF] = useState<FormObra>(() => formDe());
  // Uma chave por cadastro: clicar duas vezes (ou a rede repetir) não cria duas obras.
  const chave = useRef(uuid7());
  const mudar = (p: Partial<FormObra>) => setF((x) => ({ ...x, ...p }));
  const [comeco, setComeco] = useState<Comeco>("pranchas");

  const { erros, erroApi, ocupado, enviar } = useEnvio(
    () => validarObra(f, "tudo") as Record<string, string | null>,
    async () => {
      const dados = dadosDe(f);
      const o = await api.criarObra({ ...dados, nome: dados.nome!, chave_idempotencia: chave.current });
      router.push(destinoDe(o.id, comeco));
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
    <div className={`form-pagina ${s.pagina}`}>
      <header className={s.cab}>
        <div className={s.cabTexto}>
          <h1 id="nova-obra-titulo">Nova obra</h1>
          <p className="mut">Só o nome é obrigatório. O resto dá para completar depois, em Dados da obra, ou deixar o Plumo tirar das pranchas.</p>
        </div>
        <Link href="/inicio" className="btn">
          Cancelar
        </Link>
      </header>
      <div className={s.duas}>
        <form id="form-nova-obra" className={s.campos} onSubmit={enviar} noValidate aria-labelledby="nova-obra-titulo">
          <CamposNovaObra f={f} mudar={mudar} erros={erros} />
          <ErroApi texto={erroApi} />
        </form>
        <aside className={s.lado} aria-labelledby="comeco-titulo">
          <fieldset className={`card ${s.comeco}`}>
            <legend id="comeco-titulo">Por onde começar</legend>
            <p className="mut sm">Depois de criar a obra, a tela abre aqui.</p>
            {COMECOS.map((c) => (
              <label key={c.k} className={s.opcao}>
                <input type="radio" name="comeco" value={c.k} checked={comeco === c.k} onChange={() => setComeco(c.k)} />
                <span>
                  <b>{c.titulo}</b>
                  <small>{c.texto}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <button type="submit" form="form-nova-obra" className={`btn amb ${s.criar}`} disabled={ocupado} aria-busy={ocupado}>
            {ocupado ? <Icone nome="loader" className="spin" tam={14} /> : null}
            Criar obra
          </button>
        </aside>
      </div>
    </div>
  );
}
