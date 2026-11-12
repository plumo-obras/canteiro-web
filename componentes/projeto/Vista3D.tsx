"use client";
/**
 * O esqueleto da obra em 3D a partir do modelo do tradutor (contrato 1.0: só caixas e prismas, em cm, z para cima).
 * O three.js só é baixado quando esta tela abre: o resto do app não paga pelo peso dele.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { Elemento3D, Modelo3D, TipoElemento } from "@/lib/tradutor";
import { Icone } from "../Icone";
import { useCelular } from "../midia";
import s from "./projeto.module.css";

type Camada = TipoElemento | "morre" | "solo";
const CORES: Record<Camada, number> = { sapata: 0x8d928f, pilar: 0xc2c7c3, morre: 0xe8b04a, viga: 0x7fa9dc, laje: 0xd9dfe6, solo: 0x6e7a66 };
const ROTULO: Record<Camada, string> = {
  sapata: "Sapatas",
  pilar: "Pilares",
  morre: "Pilares que morrem",
  viga: "Vigas",
  laje: "Lajes",
  solo: "Solo (nível 0)",
};
const camadaDe = (e: Elemento3D): Camada => (e.tipo === "pilar" && e.propriedades.morre ? "morre" : e.tipo);

/** O que a ficha mostra de cada elemento: só o que veio do tradutor, com o nome que a obra usa. */
function ficha(e: Elemento3D): [string, string][] {
  const g = e.geometria;
  const p = e.propriedades;
  const linhas: [string, string][] = [];
  if (p.secao_cm) linhas.push(["Seção", `${p.secao_cm} cm`]);
  if (g.forma === "caixa") linhas.push(["Centro", `${g.centro.map((v) => v.toLocaleString("pt-BR")).join(" ; ")} cm`]);
  linhas.push(["Do nível", `${g.z0} a ${g.z1} cm`]);
  if (e.tipo === "pilar") linhas.push(["Situação", p.morre ? `morre no nível ${g.z1}` : "passa"]);
  if (e.tipo === "viga") linhas.push(["Comprimento", `${Number(p.comprimento_cm).toLocaleString("pt-BR")} cm`]);
  if (e.tipo === "laje") linhas.push(["Área", `${Number(p.area_m2).toLocaleString("pt-BR")} m²`], ["Espessura", `${p.espessura_cm} cm`]);
  if (e.tipo === "sapata" && g.forma === "caixa") {
    linhas.push(["Planta", p.dimensao_em_planta_estimada ? "tamanho estimado" : `${g.dimensoes.join(" × ")} cm (${p.origem_medida ?? "detalhamento"})`]);
  }
  if (p.novo_no_cad) linhas.push(["Origem", "desenhado no CAD"]);
  if (p.armacao_desatualizada) linhas.push(["Armação", "seção mudada no CAD: detalhar de novo"]);
  // a armação que veio do detalhamento: "4 N2 ø10 C=179"
  const arm = (p.armaduras as { quant: number; n: number; diam_mm: number; comprimento_cm: number; espacamento_cm: number | null }[] | undefined) ?? [];
  arm.forEach((a, i) =>
    linhas.push([i ? "" : "Armação", `${a.quant} N${a.n} ø${a.diam_mm.toLocaleString("pt-BR")} C=${a.comprimento_cm}${a.espacamento_cm ? ` c/${a.espacamento_cm}` : ""}`]),
  );
  return linhas;
}

/** Uma disciplina fora da estrutura nas camadas: a prévia liga e desliga; a que ainda não veio aparece apagada. */
export interface OutraCamada {
  rotulo: string;
  ligada: boolean;
  falta?: boolean;
  alternar?: () => void;
}

export function Vista3D({
  modelo,
  aoEscolher,
  previa = false,
  outras = [],
}: {
  modelo: Modelo3D;
  aoEscolher?: (e: Elemento3D | null) => void;
  /** Prévia da hidráulica (SIMULADO): tubos tracejados e a caixa d'água sobre a estrutura, até a prancha chegar. */
  previa?: boolean;
  outras?: OutraCamada[];
}) {
  const palco = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<"3d" | "topo" | "frente">("3d");
  const ctl = useRef<{ vista: (v: "3d" | "topo" | "frente") => void; mostrar: (c: Camada, sim: boolean) => void; previa: (sim: boolean) => void } | null>(null);
  const previaRef = useRef(previa);
  previaRef.current = previa;
  useEffect(() => {
    ctl.current?.previa(previa);
  }, [previa]);
  const [visiveis, setVisiveis] = useState<Record<Camada, boolean>>({ sapata: true, pilar: true, morre: true, viga: true, laje: true, solo: true });
  const [sel, setSel] = useState<Elemento3D | null>(null);
  const [falhou, setFalhou] = useState(false);
  // as camadas cobrem um canto do modelo: abertas no computador, recolhidas no celular (onde a tela é o modelo)
  const celular = useCelular();
  const [verCamadas, setVerCamadas] = useState<boolean | null>(null);
  const camadasAbertas = verCamadas ?? !celular;
  const idCamadas = useId();
  // a cena só é montada uma vez por modelo; o callback mais novo fica no ref
  const aoEscolherRef = useRef(aoEscolher);
  useEffect(() => {
    aoEscolherRef.current = aoEscolher;
  }, [aoEscolher]);
  const presentes = (Object.keys(ROTULO) as Camada[]).filter((c) => c === "solo" || modelo.elementos.some((e) => camadaDe(e) === c));

  useEffect(() => {
    const caixa = palco.current;
    if (!caixa) return;
    let vivo = true;
    let limpar = () => {};
    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (!vivo) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true });
      } catch {
        setFalhou(true); // navegador sem WebGL
        return;
      }
      const W = () => caixa.clientWidth;
      const H = () => caixa.clientHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W(), H());
      caixa.prepend(renderer.domElement);
      const cena = new THREE.Scene();
      // a cor do cartão do tema (claro ou escuro); o palco em si é transparente
      const fundo = getComputedStyle(document.documentElement).getPropertyValue("--cardSolido").trim();
      cena.background = new THREE.Color(fundo || "#1b1f27");
      const { x0, y0, x1, y1 } = modelo.limites;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const tam = Math.max(x1 - x0, y1 - y0);
      const cam = new THREE.PerspectiveCamera(40, W() / H(), 10, tam * 20);
      const orb = new OrbitControls(cam, renderer.domElement);
      orb.enableDamping = true;
      cena.add(new THREE.HemisphereLight(0xffffff, 0x666666, 0.9));
      const sol = new THREE.DirectionalLight(0xffffff, 0.7);
      sol.position.set(cx + tam, tam * 1.2, -cy + tam * 0.6);
      cena.add(sol);
      // planta (x, y) e altura z do contrato -> three (x, y = altura, z = -y)
      const P = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);
      const grupos = new Map<Camada, InstanceType<typeof THREE.Object3D>[]>();
      const clicaveis: InstanceType<typeof THREE.Mesh>[] = [];
      const borda = new THREE.LineBasicMaterial({ color: 0x13203a, transparent: true, opacity: 0.3 });

      for (const e of modelo.elementos) {
        const g = e.geometria;
        const camada = camadaDe(e);
        const mat = new THREE.MeshStandardMaterial({
          color: CORES[camada],
          roughness: 0.9,
          transparent: e.tipo === "laje" || e.tipo === "sapata",
          opacity: e.tipo === "laje" ? 0.55 : e.tipo === "sapata" ? 0.9 : 1,
          side: e.tipo === "laje" ? THREE.DoubleSide : THREE.FrontSide,
        });
        let geo: InstanceType<typeof THREE.BoxGeometry> | InstanceType<typeof THREE.ExtrudeGeometry>;
        if (g.forma === "caixa") {
          geo = new THREE.BoxGeometry(g.dimensoes[0], g.z1 - g.z0, g.dimensoes[1]);
          geo.translate(g.centro[0], (g.z0 + g.z1) / 2, -g.centro[1]);
        } else {
          const forma = new THREE.Shape(g.poligono.map(([x, y]) => new THREE.Vector2(x, y)));
          geo = new THREE.ExtrudeGeometry(forma, { depth: g.z1 - g.z0, bevelEnabled: false });
          geo.rotateX(-Math.PI / 2); // a extrusão (z) vira altura; o y da planta vira -z
          geo.translate(0, g.z0, 0);
        }
        const m = new THREE.Mesh(geo, mat);
        m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), borda));
        m.userData = { elemento: e };
        cena.add(m);
        clicaveis.push(m);
        grupos.set(camada, [...(grupos.get(camada) ?? []), m]);
      }
      const solo = new THREE.Mesh(
        new THREE.PlaneGeometry(tam * 1.6, tam * 1.6),
        new THREE.MeshBasicMaterial({ color: CORES.solo, transparent: true, opacity: 0.16, side: THREE.DoubleSide }),
      );
      solo.rotation.x = -Math.PI / 2;
      solo.position.copy(P(cx, cy, -0.5));
      const grade = new THREE.GridHelper(tam * 1.6, 32, 0x888888, 0xaaaaaa);
      grade.position.copy(P(cx, cy, 0));
      (grade.material as InstanceType<typeof THREE.Material>).transparent = true;
      (grade.material as InstanceType<typeof THREE.Material>).opacity = 0.22;
      cena.add(solo, grade);
      grupos.set("solo", [solo, grade]);

      // prévia da hidráulica (SIMULADO): tubo de distribuição rente ao chão e sob a laje, uma prumada num canto e a
      // caixa d'água sobre a cobertura. Tracejado e azul para nunca se confundir com o que veio das pranchas.
      const previaG = new THREE.Group();
      const tubo = new THREE.LineDashedMaterial({ color: 0x9cc4f5, dashSize: 60, gapSize: 30, depthTest: false });
      const zTopo = modelo.limites.z1;
      const zMeio = modelo.niveis[1]?.cota_cm ?? zTopo / 2;
      const m = 60;
      const linha = (pts: [number, number, number][]) => {
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(([x, y, z]) => P(x, y, z))), tubo);
        l.computeLineDistances();
        previaG.add(l);
      };
      linha([[x0 + m, y0 + m, 20], [x1 - m, y0 + m, 20], [x1 - m, y1 - m, 20]]);
      linha([[x0 + m, y0 + m, zMeio - 60], [x1 - m, y0 + m, zMeio - 60], [x1 - m, y1 - m, zMeio - 60]]);
      linha([[x1 - m, y0 + m, 0], [x1 - m, y0 + m, zTopo + 60]]);
      const caixaAgua = new THREE.Mesh(
        new THREE.BoxGeometry(140, 110, 140),
        new THREE.MeshBasicMaterial({ color: 0x7fa9dc, transparent: true, opacity: 0.22 }),
      );
      caixaAgua.position.copy(P(x1 - m - 70, y0 + m + 70, zTopo + 55));
      caixaAgua.add(new THREE.LineSegments(new THREE.EdgesGeometry(caixaAgua.geometry), tubo));
      (caixaAgua.children[0] as InstanceType<typeof THREE.LineSegments>).computeLineDistances();
      previaG.add(caixaAgua);
      previaG.visible = previaRef.current;
      cena.add(previaG);

      const alvo = P(cx, cy, 120);
      const posicoes = {
        // de longe o bastante para a obra caber inteira com as camadas abertas no canto
        "3d": () => {
          // tela em pé (celular): a obra cabe na largura, então a câmera recua mais
          const k = W() < H() ? 1.6 : 1;
          return P(cx + tam * 0.95 * k, cy - tam * 1.15 * k, tam * 0.85 * k);
        },
        topo: () => P(cx, cy - 1, tam * 1.7),
        frente: () => P(cx, cy - tam * 1.8, 150),
      };
      ctl.current = {
        vista: (v) => {
          cam.position.copy(posicoes[v]());
          orb.target.copy(alvo);
          orb.update();
        },
        mostrar: (c, sim) => (grupos.get(c) ?? []).forEach((o) => (o.visible = sim)),
        previa: (sim) => {
          previaG.visible = sim;
        },
      };
      ctl.current.vista("3d");

      // clique (não arraste) escolhe o elemento para a ficha
      const raio = new THREE.Raycaster();
      const ponto = new THREE.Vector2();
      let marcado: InstanceType<typeof THREE.MeshStandardMaterial> | null = null;
      let desceu: [number, number] | null = null;
      const aoDescer = (ev: PointerEvent) => (desceu = [ev.clientX, ev.clientY]);
      const aoSubir = (ev: PointerEvent) => {
        if (!desceu || Math.hypot(ev.clientX - desceu[0], ev.clientY - desceu[1]) > 4) return;
        const r = renderer.domElement.getBoundingClientRect();
        ponto.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
        raio.setFromCamera(ponto, cam);
        const hit = raio.intersectObjects(clicaveis.filter((o) => o.visible), false)[0];
        marcado?.emissive.setHex(0x000000);
        marcado = null;
        if (!hit) {
          setSel(null);
          aoEscolherRef.current?.(null);
          return;
        }
        marcado = (hit.object as InstanceType<typeof THREE.Mesh>).material as InstanceType<typeof THREE.MeshStandardMaterial>;
        marcado.emissive.setHex(0x553800);
        setSel(hit.object.userData.elemento as Elemento3D);
        aoEscolherRef.current?.(hit.object.userData.elemento as Elemento3D);
      };
      renderer.domElement.addEventListener("pointerdown", aoDescer);
      renderer.domElement.addEventListener("pointerup", aoSubir);

      let quadro = 0;
      const desenhar = () => {
        orb.update();
        renderer.render(cena, cam);
        quadro = requestAnimationFrame(desenhar);
      };
      desenhar();
      const ro = new ResizeObserver(() => {
        renderer.setSize(W(), H());
        cam.aspect = W() / H();
        cam.updateProjectionMatrix();
      });
      ro.observe(caixa);
      limpar = () => {
        cancelAnimationFrame(quadro);
        ro.disconnect();
        orb.dispose();
        cena.traverse((o) => {
          const m = o as InstanceType<typeof THREE.Mesh>;
          m.geometry?.dispose();
          const mat = m.material as InstanceType<typeof THREE.Material> | undefined;
          mat?.dispose?.();
        });
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch(() => setFalhou(true));
    return () => {
      vivo = false;
      limpar();
      ctl.current = null;
    };
  }, [modelo]);

  if (falhou) {
    return (
      <div className="aviso-erro" role="alert">
        Este navegador não conseguiu abrir a vista 3D (WebGL desligado). Os dados da prancha continuam abaixo.
      </div>
    );
  }

  return (
    <section className={s.vista} aria-label="Estrutura da obra em 3D">
      <div ref={palco} className={s.palco}>
        <span className={s.dica}>
          {celular ? "Arraste para girar · pinça para aproximar · toque num elemento" : "Arraste para girar · role para aproximar · botão direito para mover · clique num elemento"}
        </span>
      </div>
      <div className={s.camadas3d}>
        <button type="button" className={s.camadasB} aria-expanded={camadasAbertas} aria-controls={idCamadas} onClick={() => setVerCamadas(!camadasAbertas)}>
          Camadas
          <Icone nome="chevDown" tam={14} className={s.setaCamadas} />
        </button>
        {camadasAbertas ? (
          <fieldset id={idCamadas} className={s.listaCamadas}>
            <legend className="sr-only">Camadas visíveis no 3D</legend>
            {presentes.map((c) => (
              <label key={c}>
                <input
                  type="checkbox"
                  checked={visiveis[c]}
                  onChange={(e) => {
                    setVisiveis((v) => ({ ...v, [c]: e.target.checked }));
                    ctl.current?.mostrar(c, e.target.checked);
                  }}
                />
                <span className={s.amostra} style={{ background: `#${CORES[c].toString(16).padStart(6, "0")}` }} />
                {ROTULO[c]}
              </label>
            ))}
            {outras.map((o) => (
              <label key={o.rotulo} className={o.falta ? s.camadaFalta : s.camadaPrevia}>
                <input type="checkbox" checked={o.ligada} disabled={o.falta || !o.alternar} onChange={() => o.alternar?.()} />
                <span className={o.falta ? s.amostraFalta : s.amostraPrevia} />
                {o.rotulo}
              </label>
            ))}
          </fieldset>
        ) : null}
      </div>
      <span className={`seg seg-pq ${s.cameras}`} role="group" aria-label="Câmera">
        {(["3d", "topo", "frente"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={camera === v}
            className={camera === v ? "on" : ""}
            onClick={() => {
              setCamera(v);
              ctl.current?.vista(v);
            }}
          >
            {v === "3d" ? "Perspectiva" : v === "topo" ? "Planta" : "Frente"}
          </button>
        ))}
      </span>
      {sel ? (
        <div className={s.ficha} role="status">
          <h4>
            {sel.tipo === "pilar" ? "Pilar" : sel.tipo === "viga" ? "Viga" : sel.tipo === "laje" ? "Laje" : "Sapata"} {sel.id}
          </h4>
          <dl>
            {ficha(sel).map(([k, v], i) => (
              <div key={`${k}-${i}`} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  );
}
