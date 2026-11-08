"use client";
/**
 * A vista 2D da tela Projeto 3D: o CADCraft (editor CAD open source, compilado do código para o navegador e servido
 * em /cadcraft) embutido no modo hospedeiro. O Prumo entrega o espelho do modelo (`cadcraft:open`); o "Salvar" do CAD
 * devolve o DXF para cá (`cadcraft:save`) em vez de baixar, e a edição entra no pacote como qualquer prancha. Os
 * comandos do Prumo (zoom e seleção no elemento escolhido no 3D) vão por `cadcraft:execute`, que o nosso build expõe.
 *
 * Só se ouve o próprio iframe, na mesma origem: o CAD não recebe nem manda nada para outra página.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Icone } from "../Icone";
import s from "./projeto.module.css";

export interface Foco {
  /** Retângulo em planta (cm) do elemento escolhido no 3D. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  id: string;
}

type Estado =
  | { k: "carregando" }
  | { k: "abrindo" }
  | { k: "editando"; sujo: boolean }
  | { k: "salvando" }
  | { k: "salvo"; resumo: string }
  | { k: "erro"; msg: string };

interface Props {
  /** Baixa o espelho atual do pacote (já com as edições anteriores). */
  espelho: () => Promise<{ arquivo: Blob; nome: string }>;
  /** Recebe o DXF salvo no CAD; devolve o resumo do que mudou. */
  aoSalvar: (arquivo: File) => Promise<string>;
  foco: Foco | null;
  visivel: boolean;
}

export function EditorCad({ espelho, aoSalvar, foco, visivel }: Props) {
  const quadro = useRef<HTMLIFrameElement>(null);
  const [estado, setEstado] = useState<Estado>({ k: "carregando" });
  // o CAD compilado (public/cadcraft) não vai para o git: num ambiente sem `scripts/cadcraft.sh` ele não existe, e o
  // iframe mostraria a página de erro. Sem ele, a ida e volta segue pelo DXF baixado e enviado de novo.
  const [instalado, setInstalado] = useState<boolean | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch("/cadcraft/index.html", { method: "HEAD", cache: "no-store" })
      .then((r) => vivo && setInstalado(r.ok))
      .catch(() => vivo && setInstalado(false));
    return () => {
      vivo = false;
    };
  }, []);
  const [baixando, setBaixando] = useState(false);
  async function baixarDxf() {
    setBaixando(true);
    try {
      const { arquivo, nome } = await espelho();
      const url = URL.createObjectURL(arquivo);
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setEstado({ k: "erro", msg: (e as Error).message });
    } finally {
      setBaixando(false);
    }
  }
  const pronto = useRef(false);
  const focoRef = useRef(foco);
  useEffect(() => {
    focoRef.current = foco;
  }, [foco]);
  const comandos = useRef(new Map<string, (r: { ok: boolean; result?: unknown; error?: string }) => void>());

  const enviar = useCallback((msg: Record<string, unknown>, transferir: Transferable[] = []) => {
    quadro.current?.contentWindow?.postMessage(msg, window.location.origin, transferir);
  }, []);

  /** Um comando do CAD (o mesmo catálogo da linha de comando dele); resolve com a resposta. */
  const executar = useCallback(
    (id: string, params: Record<string, unknown>) =>
      new Promise<unknown>((ok, falha) => {
        const pedido = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        comandos.current.set(pedido, (r) => (r.ok ? ok(r.result) : falha(new Error(r.error ?? "comando recusado"))));
        enviar({ type: "cadcraft:execute", pedido, id, params });
        setTimeout(() => {
          if (comandos.current.delete(pedido)) falha(new Error("o CAD não respondeu"));
        }, 10_000);
      }),
    [enviar],
  );

  const abrir = useCallback(async () => {
    setEstado({ k: "abrindo" });
    try {
      const { arquivo, nome } = await espelho();
      const bytes = await arquivo.arrayBuffer();
      enviar({ type: "cadcraft:open", name: nome, bytes }, [bytes]);
      setEstado({ k: "editando", sujo: false });
      // o CAD abre o arquivo nos próximos quadros (planta grande leva mais); aí enquadra a planta inteira, sem foco
      // vindo do 3D. A segunda vez cobre o arquivo que ainda não tinha terminado de abrir na primeira.
      for (const ms of [700, 2000]) {
        setTimeout(() => {
          if (!focoRef.current) executar("zoom.extents", {}).catch(() => {});
        }, ms);
      }
    } catch (e) {
      setEstado({ k: "erro", msg: (e as Error).message });
    }
  }, [espelho, enviar, executar]);

  useEffect(() => {
    const ouvir = async (ev: MessageEvent) => {
      // só o nosso iframe, na mesma origem
      if (ev.origin !== window.location.origin || ev.source !== quadro.current?.contentWindow) return;
      const m = ev.data as { type?: string; [k: string]: unknown };
      if (!m || typeof m.type !== "string" || !m.type.startsWith("cadcraft:")) return;
      if (m.type === "cadcraft:ready") {
        pronto.current = true;
        await abrir();
      } else if (m.type === "cadcraft:dirty") {
        setEstado((e) => (e.k === "editando" ? { k: "editando", sujo: Boolean(m.dirty) } : e));
      } else if (m.type === "cadcraft:failed") {
        setEstado({ k: "erro", msg: String(m.error ?? "o CAD não conseguiu abrir o modelo") });
      } else if (m.type === "cadcraft:executed") {
        const r = comandos.current.get(String(m.pedido));
        comandos.current.delete(String(m.pedido));
        r?.(m as { ok: boolean; result?: unknown; error?: string });
      } else if (m.type === "cadcraft:save") {
        const nome = String(m.name ?? "espelho.dxf");
        if (!nome.toLowerCase().endsWith(".dxf")) {
          // exportação (PNG, PDF...): não é edição do modelo; vai para o computador como faria fora do Prumo
          const url = URL.createObjectURL(new Blob([m.bytes as ArrayBuffer]));
          const a = document.createElement("a");
          a.href = url;
          a.download = nome;
          a.click();
          URL.revokeObjectURL(url);
          return;
        }
        setEstado({ k: "salvando" });
        try {
          const resumo = await aoSalvar(new File([m.bytes as ArrayBuffer], nome, { type: "application/dxf" }));
          setEstado({ k: "salvo", resumo });
        } catch (e) {
          setEstado({ k: "erro", msg: (e as Error).message });
        }
      }
    };
    window.addEventListener("message", ouvir);
    return () => window.removeEventListener("message", ouvir);
  }, [abrir, aoSalvar]);

  // 3D -> 2D: ao abrir a vista 2D com um elemento escolhido no 3D, o CAD vai até ele e o seleciona
  useEffect(() => {
    if (!visivel || !foco || !pronto.current || estado.k === "abrindo") return;
    const m = Math.max(foco.x1 - foco.x0, foco.y1 - foco.y0, 60) * 1.5;
    const cx = (foco.x0 + foco.x1) / 2;
    const cy = (foco.y0 + foco.y1) / 2;
    // o iframe acabou de sair de `hidden`: o canvas do CAD ainda não tem o tamanho novo, e um zoom agora enquadraria
    // uma tela de 0 px. Espera o layout assentar.
    const t = setTimeout(() => {
      // janela justa em volta do elemento: seleciona só o que está inteiro dentro (ele e o id dele), não a laje ou a
      // sapata cuja borda passa pelo mesmo ponto
      executar("zoom", { mode: "window", p1: [cx - m, cy - m], p2: [cx + m, cy + m] })
        .then(() => executar("select", { clear: true }))
        .then(() => executar("select", { window: [[foco.x0 - 1, foco.y0 - 1], [foco.x1 + 1, foco.y1 + 1]], crossing: false }))
        .catch(() => {
          // build do CAD sem `cadcraft:execute`: a vista abre sem o zoom, que é só conveniência
        });
    }, 300);
    return () => clearTimeout(t);
  }, [visivel, foco, executar, estado.k]);

  const aviso =
    estado.k === "carregando"
      ? "Carregando o editor CAD…"
      : estado.k === "abrindo"
        ? "Abrindo o modelo no CAD…"
        : estado.k === "salvando"
          ? "Aplicando a edição no modelo…"
          : estado.k === "salvo"
            ? `Salvo: ${estado.resumo}`
            : estado.k === "erro"
              ? estado.msg
              : estado.sujo
                ? "Há mudanças não salvas: salve no CAD (SAVE ou Ctrl+S) para levá-las ao 3D."
                : "Mova, estique, apague ou desenhe (polilinha fechada na camada do tipo). O id verde fica dentro do elemento.";

  if (instalado === false) {
    return (
      <section className={s.vista} aria-label="Planta do modelo no editor CAD" hidden={!visivel}>
        <div className={s.semCad}>
          <Icone nome="planilha" tam={28} />
          <h3>O editor CAD não está instalado neste ambiente</h3>
          <p>
            Baixe o modelo em DXF, edite no seu CAD (AutoCAD, LibreCAD, CADCraft) e envie o arquivo salvo em “Enviar pranchas”: a edição volta
            para o 3D do mesmo jeito.
          </p>
          <button type="button" className="btn amb" disabled={baixando} aria-busy={baixando} onClick={() => void baixarDxf()}>
            <Icone nome={baixando ? "loader" : "arrowDown"} tam={15} className={baixando ? "spin" : undefined} />
            Baixar o modelo em DXF
          </button>
          {estado.k === "erro" ? (
            <div className="aviso-erro" role="alert">
              <Icone nome="alert" tam={15} />
              <span>{estado.msg}</span>
            </div>
          ) : null}
          <small>Para ter o editor aqui dentro, quem instala o Prumo roda scripts/cadcraft.sh no canteiro-web.</small>
        </div>
      </section>
    );
  }

  return (
    <section className={s.vista} aria-label="Planta do modelo no editor CAD" hidden={!visivel}>
      <div className={s.camadas}>
        <span className={estado.k === "erro" ? s.seloAtencao : estado.k === "salvo" ? s.seloOk : s.selo}>
          {estado.k === "erro" ? "Erro" : estado.k === "salvo" ? "Salvo" : "CAD"}
        </span>
        <span className={s.avisoCad} role="status">
          {aviso}
        </span>
        <span className={s.vistas}>
          <button type="button" className="btn sm" disabled={!pronto.current || estado.k === "abrindo"} onClick={() => void abrir()}>
            <Icone nome="undo" tam={13} />
            Recarregar do Prumo
          </button>
        </span>
      </div>
      {instalado ? (
      <iframe
        ref={quadro}
        className={s.cad}
        // ?host=parent: o CAD entrega o arquivo salvo para esta página em vez de baixar
        src="/cadcraft/index.html?host=parent"
        title="Editor CAD (CADCraft)"
        allow="fullscreen; clipboard-read; clipboard-write"
      />
      ) : (
        <div className={s.semCad} role="status">
          <Icone nome="loader" tam={20} className="spin" />
          Carregando o editor CAD…
        </div>
      )}
    </section>
  );
}
