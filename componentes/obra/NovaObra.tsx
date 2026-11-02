"use client";
/**
 * Cadastro de obra em passos curtos: onde, o que é, o contrato e como começar o orçamento. A obra é gravada já no
 * primeiro passo (só o nome é obrigatório): quem sai no meio não perde o que digitou, e os passos seguintes só
 * completam os dados. Ela nasce "em orçamento", que é o que vem depois de criar uma obra.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Obra, Usuario } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { uuid7 } from "@/lib/ids";
import { useCasca } from "../contexto";
import { ErroApi, useEnvio } from "../formularios/Campos";
import { Icone } from "../Icone";
import { Moldura } from "../inicio/Moldura";
import { CamposContrato, CamposOQue, CamposOnde, dadosDe, formDe, validarObra, type FormObra } from "./CamposObra";
import { ImportarOrcamento } from "./ImportarOrcamento";

export function NovaObraPagina({ demo }: { demo: boolean }) {
  return (
    <Moldura demo={demo} rota="inicio">
      {(u) => <NovaObra usuario={u} />}
    </Moldura>
  );
}

const PASSOS = [
  { k: "onde", titulo: "Onde é a obra", sub: "O nome e o endereço. O resto pode ficar para depois." },
  { k: "oque", titulo: "O que vai ser construído", sub: "Área e padrão dão a régua de preço por m² para conferir o orçamento." },
  { k: "contrato", titulo: "O contrato com o dono", sub: "O valor do contrato é o número contra o qual o orçamento vai ser comparado." },
  { k: "orcamento", titulo: "Agora, o orçamento", sub: "É o próximo passo de toda obra. Comece pela planilha que você já tem." },
] as const;

export function NovaObra({ usuario }: { usuario: Usuario }) {
  const router = useRouter();
  const { avisar } = useCasca();
  const [passo, setPasso] = useState(0);
  const [f, setF] = useState<FormObra>(() => formDe());
  const [obra, setObra] = useState<Obra | null>(null);
  const [importando, setImportando] = useState(false);
  // Uma chave por cadastro: clicar duas vezes (ou a rede repetir) não cria duas obras.
  const chave = useRef(uuid7());
  const nome = useRef<HTMLInputElement>(null);
  const mudar = (p: Partial<FormObra>) => setF((x) => ({ ...x, ...p }));
  const atual = PASSOS[passo]!;
  const irParaObra = (o: Obra) => router.push(`/?obra=${encodeURIComponent(o.id)}&tela=orcamento`);

  const { erros, erroApi, ocupado, enviar } = useEnvio(
    () => (atual.k === "orcamento" ? {} : (validarObra(f, atual.k) as Record<string, string | null>)),
    async () => {
      if (!obra) {
        const o = await api.criarObra({ ...dadosDe(f), nome: dadosDe(f).nome!, chave_idempotencia: chave.current });
        setObra(o);
        avisar(`Obra ${o.nome} criada.`);
      } else {
        const dados = dadosDe(f, obra);
        if (Object.keys(dados).length) setObra(await api.editarObra(obra.id, dados));
      }
      setPasso((p) => p + 1);
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
        ← Início
      </Link>
      <ol className="passos" aria-label="Passos do cadastro">
        {PASSOS.map((p, i) => (
          <li key={p.k} className={i === passo ? "on" : i < passo ? "feito" : ""} aria-current={i === passo ? "step" : undefined}>
            <span className="passo-n" aria-hidden="true">
              {i < passo ? <Icone nome="check" tam={13} /> : i + 1}
            </span>
            <span className="passo-t">{["Onde", "O que é", "Contrato", "Orçamento"][i]}</span>
          </li>
        ))}
      </ol>
      <section className="card form-card" aria-labelledby="passo-titulo">
        <h1 id="passo-titulo">{atual.titulo}</h1>
        <p className="mut">{atual.sub}</p>
        {atual.k === "orcamento" && obra ? (
          <div className="portas">
            <button type="button" className="porta" onClick={() => setImportando(true)}>
              <Icone nome="planilha" tam={22} />
              <span>
                <b>Importar a planilha do orçamento</b>
                <small>Excel ou CSV, do jeito que está: títulos e subtotais são pulados, e você confere a prévia antes de gravar.</small>
              </span>
              <Icone nome="chevRight" tam={16} />
            </button>
            <button type="button" className="porta porta-sec" onClick={() => irParaObra(obra)}>
              <Icone nome="predio" tam={22} />
              <span>
                <b>Fazer depois</b>
                <small>A obra fica em orçamento. A planilha se importa a qualquer hora pela aba Orçamento.</small>
              </span>
              <Icone nome="chevRight" tam={16} />
            </button>
          </div>
        ) : (
          <form id="form-nova-obra" onSubmit={enviar} noValidate>
            {atual.k === "onde" ? <CamposOnde f={f} mudar={mudar} erros={erros} nomeRef={nome} /> : null}
            {atual.k === "oque" ? <CamposOQue f={f} mudar={mudar} erros={erros} /> : null}
            {atual.k === "contrato" ? <CamposContrato f={f} mudar={mudar} erros={erros} /> : null}
            <ErroApi texto={erroApi} />
            <div className="form-acoes">
              {passo > 0 ? (
                <button type="button" className="btn" onClick={() => setPasso((p) => p - 1)}>
                  Voltar
                </button>
              ) : null}
              <button type="submit" className="btn amb" disabled={ocupado} aria-busy={ocupado}>
                {passo === 0 && !obra ? "Criar obra e continuar" : "Continuar"}
              </button>
            </div>
          </form>
        )}
      </section>
      {importando && obra ? <ImportarOrcamento obra={obra} fechar={() => setImportando(false)} feito={() => irParaObra(obra)} /> : null}
    </div>
  );
}
