/* Aprumo · landing. Sem framework: o mapa-colcha, as demos e o formulário da lista de espera. */
(() => {
  // ?estatico desliga o movimento: é como a página é capturada nas revisões de design
  const movimento = !matchMedia('(prefers-reduced-motion: reduce)').matches && !new URLSearchParams(location.search).has('estatico');
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const espera = ms => new Promise(r => setTimeout(r, ms));

  // A API dorme no plano gratuito (~50 s para acordar). Acordamos ao abrir a página, para que o e-mail digitado
  // não espere a partida a frio.
  const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:8000' : 'https://canteiro-api.onrender.com';
  fetch(API + '/saude', { mode: 'no-cors' }).catch(() => {});

  /* ---------------- a colcha: a cidade com as obras dormindo ---------------- */
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, pai) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (pai) pai.appendChild(n);
    return n;
  };
  // aleatório com semente: a cidade é sempre a mesma, a cada visita
  let semente = 7;
  const rnd = () => ((semente = (semente * 16807) % 2147483647) - 1) / 2147483646;

  function colcha() {
    const svg = $('#colcha');
    if (!svg) return;
    const W = 1440, H = 900, C = 9, L = 6;
    const defs = el('defs', {}, svg);
    const clima = { falta: '#d0654c', caminho: '#5b8fc4', emdia: '#4fa37a' };
    for (const [nome, cor] of Object.entries(clima)) {
      const g = el('radialGradient', { id: 'cl-' + nome }, defs);
      el('stop', { offset: '0', 'stop-color': cor, 'stop-opacity': '.5' }, g);
      el('stop', { offset: '1', 'stop-color': cor, 'stop-opacity': '0' }, g);
    }
    const dob = el('linearGradient', { id: 'dobra', x1: '0', y1: '0', x2: '1', y2: '1' }, defs);
    [['0', '#000', '.0'], ['.32', '#000', '.28'], ['.4', '#fff', '.05'], ['.62', '#000', '.0'], ['.78', '#000', '.3'], ['.86', '#fff', '.05'], ['1', '#000', '0']]
      .forEach(([o, c, a]) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a }, dob));
    // cada retalho tem o seu caimento: claro de um lado da dobra, sombra do outro, alternando como pano dobrado
    for (const [id, x1, x2] of [['caiA', '0', '1'], ['caiB', '1', '0']]) {
      const g = el('linearGradient', { id, x1, y1: '0', x2, y2: '1' }, defs);
      [['0', '#fff', '.07'], ['.5', '#fff', '0'], ['.52', '#000', '.12'], ['1', '#000', '.32']].forEach(([o, c, a]) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a }, g));
    }

    // malha com os nós deslocados: quarteirões tortos como retalhos
    const pts = [];
    for (let j = 0; j <= L; j++) {
      pts[j] = [];
      for (let i = 0; i <= C; i++) {
        const borda = i === 0 || j === 0 || i === C || j === L;
        const dx = borda ? 0 : (rnd() - .5) * 70, dy = borda ? 0 : (rnd() - .5) * 60;
        pts[j][i] = [(i / C) * (W + 120) - 60 + dx, (j / L) * (H + 80) - 40 + dy];
      }
    }
    const recuo = (p, c, d) => [p[0] + (c[0] - p[0]) * d, p[1] + (c[1] - p[1]) * d];
    const obras = { '6,1': ['RESIDENCIAL AROEIRA', 'falta'], '5,5': ['GALPÃO IPÊ', 'caminho'], '7,5': ['CASA JATOBÁ', 'emdia'] };
    const centros = {};
    const gRet = el('g', {}, svg), gClima = el('g', {}, svg), gJan = el('g', {}, svg), gRot = el('g', {}, svg);
    for (let j = 0; j < L; j++) for (let i = 0; i < C; i++) {
      const q = [pts[j][i], pts[j][i + 1], pts[j + 1][i + 1], pts[j + 1][i]];
      const c = [q.reduce((s, p) => s + p[0], 0) / 4, q.reduce((s, p) => s + p[1], 0) / 4];
      const r = q.map(p => recuo(p, c, .045));
      const obra = obras[i + ',' + j];
      const d = 'M' + r.map(p => p.map(Math.round).join(' ')).join('L') + 'Z';
      el('path', { class: 'retalho ' + (obra ? obra[1] : ['', 'b', 'c'][Math.floor(rnd() * 3)]), d, 'stroke-linejoin': 'round' }, gRet);
      el('path', { d, fill: `url(#${(i + j) % 2 ? 'caiA' : 'caiB'})` }, gRet);
      if (obra) {
        centros[obra[0]] = c;
        el('circle', { cx: c[0], cy: c[1], r: 120, fill: `url(#cl-${obra[1]})` }, gClima);
        // o nome é bordado rente à costura de cima do retalho
        const id = 'cost-' + i + '-' + j, a0 = recuo(r[0], r[3], .14), a1 = recuo(r[1], r[2], .14);
        el('path', { id, d: `M${a0[0] + 14} ${a0[1]} L${a1[0] - 8} ${a1[1]}`, fill: 'none' }, defs);
        const t = el('text', { class: 'rotulo' }, gRot);
        const tp = el('textPath', { href: '#' + id }, t);
        tp.textContent = obra[0].replace('RESIDENCIAL ', '');
      }
      // janelas acesas: mais na direita, onde o texto não disputa
      const n = Math.round((i / C) * 9 + rnd() * 5);
      for (let k = 0; k < n; k++) {
        const u = .18 + rnd() * .64, v = .22 + rnd() * .6;
        const a = recuo(r[0], r[1], u), b = recuo(r[3], r[2], u), p = recuo(a, b, v);
        const o = (.35 + rnd() * .6).toFixed(2);
        // janela em ponto-cruz: dois traços cruzados, não um ponto de luz
        const x = p[0], y = p[1];
        const jan = el('path', { class: 'janela' + (rnd() < .22 ? ' pisca' : ''), d: `M${(x - 2.2).toFixed(1)} ${(y - 2.2).toFixed(1)}l4.4 4.4m0 -4.4l-4.4 4.4`, opacity: o }, gJan);
        jan.style.setProperty('--o', o);
        jan.style.setProperty('--t', (5 + rnd() * 7).toFixed(1) + 's');
        jan.style.setProperty('--d', (-rnd() * 8).toFixed(1) + 's');
      }
    }
    // o fio do agente, passando pelas três obras
    const [a, b, c] = ['RESIDENCIAL AROEIRA', 'GALPÃO IPÊ', 'CASA JATOBÁ'].map(k => centros[k]);
    const fio = el('path', { d: `M${a[0]} ${a[1]} C ${a[0] + 160} ${a[1] + 60}, ${b[0] + 40} ${b[1] - 120}, ${b[0]} ${b[1]} S ${c[0] + 120} ${c[1] + 40}, ${c[0]} ${c[1]}`,
      fill: 'none', stroke: '#e8b04a', 'stroke-width': 2, 'stroke-dasharray': '4 6', 'stroke-linecap': 'round', opacity: .8 }, svg);
    [a, b, c].forEach(p => el('circle', { cx: p[0], cy: p[1], r: 5, fill: '#e8b04a' }, svg));
    el('rect', { class: 'dobra', x: 0, y: 0, width: W, height: H, fill: 'url(#dobra)' }, svg);
    if (movimento) {
      const mascara = el('mask', { id: 'm-fio' }, defs);
      const m = el('path', { d: fio.getAttribute('d'), fill: 'none', stroke: '#fff', 'stroke-width': 8, pathLength: 100, 'stroke-dasharray': 100, 'stroke-dashoffset': 100 }, mascara);
      fio.setAttribute('mask', 'url(#m-fio)');
      m.animate([{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 2600, delay: 600, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' });
      // a dobra respira de leve com a rolagem: a colcha não é chapada
      addEventListener('scroll', () => { svg.style.transform = `translateY(${Math.min(scrollY, 900) * .18}px)`; }, { passive: true });
    }
  }

  /* ---------------- a palavra do título muda de estado no lugar ---------------- */
  function troca() {
    const t = $('#troca');
    if (!t || !movimento) return;
    const palavras = ['confere', 'prevê', 'cota', 'propõe', 'avisa'];
    let i = 0;
    setInterval(async () => {
      i = (i + 1) % palavras.length;
      t.classList.remove('entra'); t.classList.add('sai');
      await espera(260);
      t.textContent = palavras[i];
      t.classList.remove('sai'); t.classList.add('entra');
    }, 2600);
  }

  /* ---------------- o bilhete escrito linha a linha ---------------- */
  async function bilhete() {
    const linhas = $$('#linhas-hero li');
    if (!movimento) return;
    linhas.forEach(l => l.classList.add('ainda'));
    await espera(900);
    for (const l of linhas) { l.classList.remove('ainda'); await espera(l.classList.contains('conta') ? 900 : 620); }
  }

  /* ---------------- quando uma seção entra na tela ---------------- */
  function aoVer(alvo, fn, limiar = .35) {
    if (!alvo) return;
    if (!('IntersectionObserver' in window)) return fn();
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); fn(); } }, { threshold: limiar });
    io.observe(alvo);
  }

  // a mesma colcha, sem obras e com poucas janelas, como chão das seções da noite
  function colchaFundo() {
    for (const sec of $$('.sec.noite, .sec.manha')) {
      const svg = el('svg', { class: 'colcha-fundo', viewBox: '0 0 1440 900', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' });
      sec.prepend(svg);
      const C = 8, L = 5, pts = [];
      for (let j = 0; j <= L; j++) { pts[j] = []; for (let i = 0; i <= C; i++) pts[j][i] = [(i / C) * 1560 - 60 + (rnd() - .5) * 80, (j / L) * 980 - 40 + (rnd() - .5) * 70]; }
      for (let j = 0; j < L; j++) for (let i = 0; i < C; i++) {
        const q = [pts[j][i], pts[j][i + 1], pts[j + 1][i + 1], pts[j + 1][i]];
        el('path', { class: 'retalho', d: 'M' + q.map(p => p.map(Math.round).join(' ')).join('L') + 'Z' }, svg);
        if (rnd() < .5) { const p = q[0], x = p[0] + 30 + rnd() * 90, y = p[1] + 30 + rnd() * 80; el('path', { class: 'janela', d: `M${x - 2} ${y - 2}l4 4m0 -4l-4 4`, 'stroke-width': 1.3, opacity: .55 }, svg); }
      }
    }
  }

  function revelar() {
    if (!movimento) return;
    const alvos = $$('.sec h2, .sec .sec-lead, .briefing, .fone, .costura, .ficha, .promessas');
    alvos.forEach(a => a.classList.add('revela'));
    if (!('IntersectionObserver' in window)) return alvos.forEach(a => a.classList.add('visto'));
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visto'); io.unobserve(e.target); }
    }), { threshold: .15, rootMargin: '0px 0px -8% 0px' });
    alvos.forEach(a => io.observe(a));
  }

  // madrugada: as quatro horas acendem em sequência ao longo do fio
  function eixo() {
    const itens = $$('#eixo li');
    const acender = async () => { for (const li of itens) { li.classList.add('aceso'); if (movimento) await espera(420); } };
    if (!movimento) return acender();
    aoVer($('#eixo'), acender, .5);
  }

  // entre obras: costurar
  function costura() {
    const b = $('#costurar'), fig = $('.costura'), prop = $('#proposta-costura');
    if (!b) return;
    b.addEventListener('click', () => {
      const ligado = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(ligado));
      fig.classList.toggle('costurado', ligado);
      prop.hidden = !ligado;
      b.textContent = ligado ? 'Descosturar' : 'Costurar as duas obras';
    });
  }

  // o canteiro: as mensagens chegam como chegam no WhatsApp
  function conversa() {
    const msgs = $$('#msgs .msg');
    if (!movimento) return;
    msgs.forEach(m => m.classList.add('ainda'));
    aoVer($('#msgs'), async () => {
      for (const [i, m] of msgs.entries()) { await espera(i === 2 ? 1100 : 600); m.classList.remove('ainda'); }
    }, .4);
  }

  // o briefing: aprovar e desfazer no lugar, sem a lista pular
  function briefing() {
    const hora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    $('#decisoes')?.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const li = b.closest('.decisao');
      if (b.dataset.acao === 'aprovar') {
        li._botao = b;
        const f = document.createElement('div');
        f.className = 'feito-linha';
        f.innerHTML = `<span>Aprovado ${hora()} por você</span><button class="desfazer" type="button" data-acao="desfazer">Desfazer</button>`;
        b.replaceWith(f);
        li.classList.add('feita');
        f.querySelector('button').focus();
      } else if (b.dataset.acao === 'desfazer') {
        const f = b.closest('.feito-linha');
        f.replaceWith(li._botao);
        li.classList.remove('feita');
        li._botao.focus();
      }
    });
  }

  // o ciclo: o fio ocre corre da falta até a sobra
  function ciclo() {
    const ol = $('#ciclo');
    if (!ol) return;
    const itens = $$('li', ol);
    const correr = async () => {
      for (const [i, li] of itens.entries()) {
        ol.style.setProperty('--fio-p', (i / (itens.length - 1)).toFixed(3));
        li.classList.add('aceso');
        if (movimento) await espera(260);
      }
    };
    if (!movimento) return correr();
    aoVer(ol, correr, .4);
  }

  // a navbar encolhe e se solta um pouco depois do topo
  function nav() {
    const n = $('.nav');
    const manhas = $$('.manha, .aurora');
    const f = () => {
      n.classList.toggle('solta', scrollY > 40);
      // de dia sobre a manhã; a aurora conta a partir do terço de baixo, onde o céu já clareou
      const y = n.getBoundingClientRect().bottom;
      n.classList.toggle('dia', manhas.some(s => { const r = s.getBoundingClientRect(); const ini = s.classList.contains('aurora') ? r.top + r.height * .86 : r.top; return ini <= y && r.bottom >= y; }));
    };
    addEventListener('scroll', f, { passive: true }); f();
  }

  /* ---------------- lista de espera ---------------- */
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function formularios() {
    const origem = new URLSearchParams(location.search).get('utm_source')?.slice(0, 80) || undefined;
    $$('form[data-form]').forEach(form => form.addEventListener('submit', async e => {
      e.preventDefault();
      const msg = $('.form-msg', form), btn = $('button[type=submit]', form), email = form.email;
      const dados = Object.fromEntries(new FormData(form));
      const corpo = { email: (dados.email || '').trim(), origem };
      if (dados.site) corpo.site = dados.site;
      for (const k of ['nome', 'empresa', 'papel']) if (dados[k]?.trim()) corpo[k] = dados[k].trim();
      if (dados.obras_ativas !== undefined && dados.obras_ativas !== '') corpo.obras_ativas = Number(dados.obras_ativas);
      msg.className = 'form-msg';
      if (!EMAIL.test(corpo.email)) {
        email.setAttribute('aria-invalid', 'true');
        msg.classList.add('erro'); msg.textContent = 'Confira o e-mail: falta o @ ou o domínio.';
        email.focus();
        return;
      }
      email.removeAttribute('aria-invalid');
      btn.setAttribute('aria-busy', 'true');
      const lenta = setTimeout(() => { msg.textContent = 'Acordando o servidor, só um instante…'; }, 2500);
      try {
        const ctl = new AbortController();
        const limite = setTimeout(() => ctl.abort(), 70000);
        const r = await fetch(API + '/lista-espera', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: ctl.signal });
        clearTimeout(limite);
        const j = await r.json().catch(() => ({}));
        if (r.ok) {
          msg.classList.add('ok');
          msg.textContent = j.ja_estava ? 'Você já estava na lista. A gente avisa quando chegar a sua vez.' : 'Pronto, você está na lista. A gente avisa por e-mail.';
          form.classList.add('feito');
          if (form.dataset.form === 'rapida') {
            // leva o e-mail para a ficha completa, para quem quiser contar mais
            const f = $('#f-email'); if (f && !f.value) f.value = corpo.email;
          }
        } else if (r.status === 429) {
          msg.classList.add('erro'); msg.textContent = 'Muitas tentativas desta rede. Espere alguns minutos e tente de novo.';
        } else if (r.status === 422) {
          msg.classList.add('erro'); msg.textContent = 'Algum campo não passou. Confira o e-mail e o número de obras.';
        } else throw new Error(String(r.status));
      } catch {
        msg.classList.add('erro'); msg.textContent = 'Não conseguimos falar com o servidor. Tente de novo em instantes.';
      } finally {
        clearTimeout(lenta);
        btn.removeAttribute('aria-busy');
      }
    }));
  }

  colcha(); colchaFundo(); troca(); bilhete(); revelar(); eixo(); costura(); conversa(); briefing(); ciclo(); nav(); formularios();
})();
