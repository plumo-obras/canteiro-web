"use client";
/**
 * Nova obra numa tela só: os dados em blocos (só o nome é obrigatório, o contrato vem recolhido) e, ao lado, por onde
 * começar. A obra nasce "em orçamento"; o começo escolhido decide aonde a tela vai em seguida, pelos caminhos que já
 * existem: a tela Projeto (com as pranchas arrastadas aqui já enviadas), a tela Orçamento (importar a planilha) ou de
 * volta às obras.
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
import { ACEITA_PRANCHAS, enviarPranchas, grandesDemais } from "./pranchas";
import s from "./obra.module.css";

export function NovaObraPagina({ demo }: { demo: boolean }) {
  return (
    <Moldura demo={demo} rota="inicio">
      {(u) => <NovaObra usuario={u} />}
    </Moldura>
  );
}

type Comeco = "pranchas" | "planilha" | "cadastrar";

export function destinoDe(obraId: string, comeco: Comeco) {
  const id = encodeURIComponent(obraId);
  if (comeco === "cadastrar") return "/inicio";
  return `/?obra=${id}&tela=${comeco === "planilha" ? "orcamento" : "projeto"}`;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function NovaObra({ usuario }: { usuario: Usuario }) {
  const router = useRouter();
  const [f, setF] = useState<FormObra>(() => formDe());
  // Uma chave por cadastro: clicar duas vezes (ou a rede repetir) não cria duas obras.
  const chave = useRef(uuid7());
  const mudar = (p: Partial<FormObra>) => setF((x) => ({ ...x, ...p }));
  const [comeco, setComeco] = useState<Comeco>("pranchas");
  // As pranchas ficam aqui até a obra existir; sobem para o tradutor logo depois do cadastro.
  const [pranchas, setPranchas] = useState<File[]>([]);
  const [erroPrancha, setErroPrancha] = useState<string | null>(null);
  const [sobre, setSobre] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [naoSubiram, setNaoSubiram] = useState<{ obraId: string; nomes: string[] } | null>(null);

  const escolher = (lista: FileList | null) => {
    const novos = [...(lista ?? [])];
    if (!novos.length) return;
    const grandes = grandesDemais(novos);
    setErroPrancha(
      grandes.length
        ? `${grandes.map((a) => a.name).join(", ")}: passa de 4 MB. Exporte a prancha em PDF pelo CAD (fica bem menor) ou reduza a imagem.`
        : null,
    );
    const ok = novos.filter((a) => !grandes.includes(a));
    // a mesma prancha escolhida de novo (mesmo nome) substitui a anterior
    setPranchas((x) => [...x.filter((a) => !ok.some((n) => n.name === a.name)), ...ok]);
    if (ok.length) setComeco("pranchas");
  };

  const { erros, erroApi, ocupado, enviar } = useEnvio(
    () => validarObra(f, "tudo") as Record<string, string | null>,
    async () => {
      const dados = dadosDe(f);
      const o = await api.criarObra({ ...dados, nome: dados.nome!, chave_idempotencia: chave.current });
      if (comeco === "pranchas" && pranchas.length) {
        setEnviando(true);
        try {
          // Falha aqui não desfaz a obra. O que subiu sai da lista (repetir não manda de novo); o que não subiu fica à
          // vista com o caminho para o Projeto, em vez de a tela seguir como se tudo tivesse ido.
          const falhas = await enviarPranchas(o.id, pranchas);
          setPranchas((x) => x.filter((a) => falhas.includes(a.name)));
          if (falhas.length) {
            setNaoSubiram({ obraId: o.id, nomes: falhas });
            return;
          }
        } finally {
          setEnviando(false);
        }
      }
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
          <p className="mut">Nome e endereço bastam para começar. O resto dá para completar depois, ou deixar o Plumo tirar das pranchas.</p>
        </div>
        <Link href="/inicio" className={`btn ${s.cancelar}`}>
          Cancelar
        </Link>
      </header>
      <div className={s.duas}>
        <form id="form-nova-obra" className={s.campos} onSubmit={enviar} noValidate aria-labelledby="nova-obra-titulo">
          <CamposNovaObra f={f} mudar={mudar} erros={erros} />
          <ErroApi texto={erroApi} />
          {naoSubiram ? (
            <div className="aviso-erro" role="alert">
              <Icone nome="alert" tam={15} />
              <span>
                A obra foi criada, mas {naoSubiram.nomes.length === 1 ? "esta prancha não subiu" : `${naoSubiram.nomes.length} pranchas não subiram`}:{" "}
                {naoSubiram.nomes.join(", ")}.{" "}
                <a className="link" href={`/?obra=${naoSubiram.obraId}&tela=projeto`}>
                  Mandar de novo no Projeto
                </a>
              </span>
            </div>
          ) : null}
        </form>
        <aside className={s.lado} aria-labelledby="comeco-titulo">
          <section className={`card ${s.comeco}`}>
            <h2 id="comeco-titulo" className={s.blocoT}>
              Por onde começar
            </h2>
            {/* A área de arrastar é o caminho principal: escolher arquivo já marca "pranchas". */}
            <label
              className={s.soltar}
              data-on={comeco === "pranchas" || undefined}
              data-sobre={sobre || undefined}
              onDragOver={(e) => {
                e.preventDefault();
                setSobre(true);
              }}
              onDragLeave={() => setSobre(false)}
              onDrop={(e) => {
                e.preventDefault();
                setSobre(false);
                escolher(e.dataTransfer.files);
              }}
            >
              <Icone nome="arrowUp" tam={20} className={s.soltarIc} />
              <b>{pranchas.length ? plural(pranchas.length, "prancha escolhida", "pranchas escolhidas") : "Arraste as pranchas"}</b>
              <span className="mut sm">
                {pranchas.length
                  ? `${pranchas.map((a) => a.name).join(", ")}. Sobem assim que a obra for criada.`
                  : "PDF, imagem ou DXF. O Plumo monta o 3D, o orçamento e as compras."}
              </span>
              <input
                type="file"
                multiple
                accept={ACEITA_PRANCHAS}
                className={s.arquivo}
                aria-label="Escolher pranchas"
                onChange={(e) => {
                  escolher(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            {erroPrancha ? (
              <div className="campo-erro" role="alert">
                {erroPrancha}
              </div>
            ) : null}
            {pranchas.length ? (
              <button type="button" className={`link ${s.limpar}`} onClick={() => setPranchas([])}>
                Tirar as pranchas escolhidas
              </button>
            ) : null}
            <button type="button" className={`btn ${s.caminho}`} aria-pressed={comeco === "planilha"} onClick={() => setComeco("planilha")}>
              Já tenho a planilha do orçamento
            </button>
            <button type="button" className={`btn ${s.caminho}`} aria-pressed={comeco === "cadastrar"} onClick={() => setComeco("cadastrar")}>
              Só cadastrar por enquanto
            </button>
          </section>
          <button type="submit" form="form-nova-obra" className={`btn amb ${s.criar}`} disabled={ocupado} aria-busy={ocupado}>
            {ocupado ? <Icone nome="loader" className="spin" tam={14} /> : null}
            {enviando ? "Enviando as pranchas…" : "Criar obra"}
          </button>
        </aside>
      </div>
    </div>
  );
}
