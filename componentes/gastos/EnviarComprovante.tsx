"use client";
/**
 * Enviar comprovante: a foto (ou o PDF) e, se quiser, "do que é?". Enviou, a IA lê na hora; terminou, a revisão abre
 * com o máximo preenchido. A pessoa pode sair enquanto lê: a leitura termina sozinha e o comprovante espera na fila.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { Obra } from "@/lib/contrato";
import { api, lerComprovante } from "@/lib/cliente";
import { mensagemDe, useCasca } from "../contexto";
import { Modal } from "../Dialogo";
import { Icone } from "../Icone";
import { ArquivoRecusado, prepararArquivo, validarArquivo } from "./imagem";
import s from "./gastos.module.css";

type Passo = "escolher" | "enviando" | "lendo";

export function EnviarComprovante({ obra, fechar, revisar }: { obra: Obra; fechar: () => void; revisar: (id: string) => void }) {
  const { mudou, avisar } = useCasca();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [legenda, setLegenda] = useState("");
  const [passo, setPasso] = useState<Passo>("escolher");
  const [erro, setErro] = useState<string | null>(null);
  // o problema do arquivo escolhido (tipo, tamanho, corrompido), conferido na escolha e mostrado junto do seletor
  const [recusa, setRecusa] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const idLegenda = useId();
  const idRecusa = useId();
  const escolhido = useRef<File | null>(null);
  const aberto = useRef(true);

  useEffect(
    () => () => {
      aberto.current = false;
    },
    [],
  );
  useEffect(() => {
    if (!arquivo || !arquivo.type.startsWith("image/")) {
      setPrevia(null);
      return;
    }
    const u = URL.createObjectURL(arquivo);
    setPrevia(u);
    return () => URL.revokeObjectURL(u);
  }, [arquivo]);

  const escolher = async (f: File) => {
    escolhido.current = f;
    setErro(null);
    setRecusa(null);
    setArquivo(f);
    setConferindo(true);
    const motivo = await validarArquivo(f).catch(() => null);
    // trocou de arquivo enquanto este era conferido: o resultado antigo não vale
    if (escolhido.current !== f || !aberto.current) return;
    setRecusa(motivo);
    setConferindo(false);
  };

  const enviar = async () => {
    if (!arquivo || recusa || conferindo) return;
    setErro(null);
    setPasso("enviando");
    try {
      const { blob, nome } = await prepararArquivo(arquivo);
      const c = await api.enviarComprovante(obra.id, blob, nome, legenda);
      mudou();
      if (c.ja_existia) {
        avisar(c.status === "a_revisar" ? "Esse arquivo já tinha sido enviado: abrindo a revisão." : "Esse arquivo já tinha sido enviado e revisado.");
        if (c.status === "a_revisar") revisar(c.id);
        else fechar();
        return;
      }
      setPasso("lendo");
      try {
        const r = await lerComprovante(c.id);
        if (!r.ok && r.mensagem) avisar(r.mensagem, true);
      } catch (e) {
        // sem leitura a revisão abre em branco: ler é ajuda, não condição
        avisar(mensagemDe(e), true);
      }
      mudou();
      if (aberto.current) revisar(c.id);
    } catch (e) {
      if (e instanceof ArquivoRecusado) setRecusa(e.message);
      else setErro(mensagemDe(e));
      setPasso("escolher");
    }
  };

  const rodape =
    passo === "lendo" ? (
      <button type="button" className="btn" onClick={fechar}>
        Revisar depois
      </button>
    ) : (
      <>
        <button type="button" className="btn" onClick={fechar}>
          Cancelar
        </button>
        <button type="button" className="btn amb" disabled={!arquivo || !!recusa || conferindo || passo !== "escolher"} aria-busy={passo === "enviando"} onClick={enviar}>
          {passo === "enviando" ? <Icone nome="loader" className="spin" tam={14} /> : <Icone nome="spark" tam={14} />}
          {passo === "enviando" ? "Enviando…" : "Enviar e ler"}
        </button>
      </>
    );

  return (
    <Modal titulo="Enviar comprovante" fechar={fechar} rodape={rodape}>
      {passo === "lendo" ? (
        <div className={s.lendo} role="status">
          <Icone nome="loader" className="spin" tam={22} />
          <strong>Lendo o comprovante…</strong>
          <span className="mut">Leva até um minuto. Pode sair: ele fica em “A revisar” com o que foi lido.</span>
        </div>
      ) : (
        <>
          <p className="mut sm">Nota fiscal, Pix, boleto pago, recibo ou papel anotado à mão. A IA lê e preenche; você confere e confirma.</p>
          <input
            ref={entrada}
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const f = e.target.files?.[0];
              // limpa para o mesmo arquivo, escolhido de novo depois de um aviso, disparar a troca outra vez
              e.target.value = "";
              if (f) void escolher(f);
            }}
          />
          <button
            type="button"
            className={`${s.soltar}${arquivo ? ` ${s.soltarCom}` : ""}`}
            aria-invalid={!!recusa}
            aria-describedby={recusa ? idRecusa : undefined}
            onClick={() => entrada.current?.click()}
          >
            {previa && !recusa ? (
              <img src={previa} alt="Prévia do comprovante" className={s.previa} />
            ) : (
              <Icone nome={recusa ? "alert" : arquivo ? "planilha" : "recibo"} tam={28} />
            )}
            <span className={s.soltarTexto}>
              <span className={s.soltarNome}>{arquivo ? arquivo.name : "Tirar foto ou escolher arquivo"}</span>
              {arquivo ? <span className="mut sm">{conferindo ? "Conferindo o arquivo…" : "Toque para trocar"}</span> : null}
            </span>
          </button>
          {recusa ? (
            <div id={idRecusa} className={`aviso-erro form-erro ${s.recusa}`} role="alert">
              <Icone nome="alert" tam={15} />
              {recusa}
            </div>
          ) : null}
          <div className="campo">
            <label className="l" htmlFor={idLegenda}>
              Do que é? (opcional, ajuda muito)
            </label>
            <input
              id={idLegenda}
              className="f"
              maxLength={300}
              placeholder="Ex.: empreiteiro e ajudante, alvenaria"
              value={legenda}
              onChange={(e) => setLegenda(e.target.value)}
            />
            <div className="campo-dica">Um Pix sozinho não diz para que foi o pagamento.</div>
          </div>
          {erro ? (
            <div className="aviso-erro form-erro" role="alert">
              {erro}
            </div>
          ) : null}
        </>
      )}
    </Modal>
  );
}
