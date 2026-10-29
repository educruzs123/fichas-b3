/* Fichas B3 — páginas: início (lista) e ficha. Dados lidos direto do banco fichas-b3 (Supabase). */
(function () {
  'use strict';
  const app = document.getElementById('app');
  const $ = (sel, r) => (r || document).querySelector(sel);

  // ---------- utilidades ----------
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach(c => { if (c == null || c === false) return; e.appendChild(c instanceof Node ? c : document.createTextNode(String(c))); });
    return e;
  }
  const nf = (d) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const N0 = nf(0), N1 = nf(1), N2 = nf(2);
  const ok = v => v != null && isFinite(v);
  const pct = (v, d = 1) => ok(v) ? nf(d).format(v * 100) + '%' : '—';
  const pctS = (v, d = 1) => ok(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + nf(d).format(Math.abs(v) * 100) + '%' : '—';
  const xv = v => ok(v) ? N1.format(v) + 'x' : '—';
  const rs = (v, d = 2) => ok(v) ? 'R$ ' + nf(d).format(v) : '—';
  const mi = v => { if (!ok(v)) return '—'; const a = Math.abs(v); if (a >= 1e6) return 'R$ ' + N2.format(v / 1e6) + ' tri'; if (a >= 1000) return 'R$ ' + N1.format(v / 1000) + ' bi'; return 'R$ ' + N0.format(v) + ' mi'; };
  const miN = v => ok(v) ? N0.format(v) : '—';
  const cls = v => ok(v) ? (v >= 0 ? 'up' : 'down') : '';
  const dataBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } }
  };
  function card(...kids) { return h('section', { class: 'card secao' }, ...kids); }
  function aviso(tipo, ...kids) { return h('div', { class: 'aviso ' + tipo }, ...kids); }

  // ---------- busca no topo ----------
  let empresasCache = null;
  async function empresas() { if (!empresasCache) empresasCache = (await Fichas.lista()).map(e => Object.assign({ ticker: e.tickers[0] }, e)); return empresasCache; }
  // ---------- busca no topo, com autocompletar ----------
  const inBusca = $('#busca-topo-in');
  const sug = h('ul', { class: 'sugestoes', id: 'busca-sug', role: 'listbox', hidden: true });
  $('#busca-topo').appendChild(sug);
  inBusca.setAttribute('role', 'combobox');
  inBusca.setAttribute('aria-autocomplete', 'list');
  inBusca.setAttribute('aria-controls', 'busca-sug');
  inBusca.setAttribute('aria-expanded', 'false');
  const semAcento = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let itens = [], ativo = -1;
  // pontua cada empresa: ticker exato > ticker que começa com o texto > palavra do nome que começa com o texto > texto no meio
  function procurar(q, es) {
    const Q = q.toUpperCase(), n = semAcento(q);
    const out = [];
    for (const e of es) {
      let p = 0, tk = e.tickers[0];
      for (const t of e.tickers) {
        if (t === Q) { p = Math.max(p, 100); tk = t; }
        else if (t.startsWith(Q)) { if (90 > p) tk = t; p = Math.max(p, 90); }
      }
      if (!p) {
        const nome = semAcento(e.nome_curto + ' ' + e.nome);
        if (nome.split(/[^a-z0-9]+/).some(w => w.startsWith(n))) p = 60;
        else if (nome.includes(n)) p = 40;
        else if (semAcento(e.setor).includes(n)) p = 10;
      }
      if (p) out.push({ e, tk, p: p + (e.ativa ? 5 : 0) });
    }
    return out.sort((a, b) => b.p - a.p || a.tk.localeCompare(b.tk)).slice(0, 8);
  }
  function marcar(texto, q) {
    const i = semAcento(texto).indexOf(semAcento(q));
    if (!q || i < 0) return [texto];
    return [texto.slice(0, i), h('mark', null, texto.slice(i, i + q.length)), texto.slice(i + q.length)];
  }
  function fechar() { sug.hidden = true; sug.textContent = ''; itens = []; ativo = -1; inBusca.setAttribute('aria-expanded', 'false'); inBusca.removeAttribute('aria-activedescendant'); }
  function destacar(i) {
    ativo = i;
    [...sug.children].forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
    if (i >= 0) inBusca.setAttribute('aria-activedescendant', 'sug-' + i); else inBusca.removeAttribute('aria-activedescendant');
  }
  const abrirFicha = t => { location.href = '?t=' + encodeURIComponent(t); };
  async function sugerir() {
    const q = inBusca.value.trim();
    if (q.length < 1) { fechar(); return; }
    let es; try { es = await empresas(); } catch (e) { fechar(); return; }
    if (inBusca.value.trim() !== q) return; // o texto mudou enquanto carregava
    itens = procurar(q, es);
    sug.textContent = '';
    if (!itens.length) { sug.appendChild(h('li', { class: 'vazio' }, 'Nenhuma empresa encontrada')); }
    itens.forEach((it, i) => sug.appendChild(h('li', { id: 'sug-' + i, role: 'option', 'aria-selected': 'false',
      onmousedown: ev => { ev.preventDefault(); abrirFicha(it.tk); }, onmousemove: () => { if (ativo !== i) destacar(i); } },
      h('b', null, marcar(it.tk, q)), h('span', { class: 'n' }, marcar(it.e.nome_curto || it.e.nome, q)),
      h('span', { class: 's' }, [it.e.tickers.length > 1 ? it.e.tickers.join(' ') : null, it.e.setor, it.e.ativa ? null : 'cancelada'].filter(Boolean).join(' · ')))));
    sug.hidden = false;
    inBusca.setAttribute('aria-expanded', 'true');
    destacar(itens.length ? 0 : -1);
  }
  let espera = null;
  inBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(sugerir, 80); });
  inBusca.addEventListener('focus', () => { empresas().catch(() => {}); if (inBusca.value.trim()) sugerir(); });
  inBusca.addEventListener('blur', () => setTimeout(fechar, 120));
  inBusca.addEventListener('keydown', ev => {
    if (sug.hidden || !itens.length) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); destacar((ativo + 1) % itens.length); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); destacar((ativo - 1 + itens.length) % itens.length); }
    else if (ev.key === 'Escape') { fechar(); }
  });
  $('#busca-topo').addEventListener('submit', async ev => {
    ev.preventDefault();
    const q = inBusca.value.trim();
    if (!q) return;
    if (!sug.hidden && ativo >= 0 && itens[ativo]) { abrirFicha(itens[ativo].tk); return; }
    try {
      const es = await empresas(), Q = q.toUpperCase();
      const e = es.find(x => x.tickers.includes(Q));
      if (e) { abrirFicha(Q); return; }
      const r = procurar(q, es);
      if (r.length === 1) { abrirFicha(r[0].tk); return; }
    } catch (e) { /* banco indisponível */ }
    location.href = '?q=' + encodeURIComponent(q);
  });

  // ---------- roteador ----------
  const qs = new URLSearchParams(location.search);
  if (qs.get('t') && (qs.get('itr') || qs.get('dfp'))) paginaDemo(qs.get('t'), qs.get('itr') ? 'itr' : 'dfp', qs.get('itr') || qs.get('dfp'));
  else if (qs.get('t')) paginaFicha(qs.get('t'));
  else { document.querySelectorAll('[data-nav=inicio]').forEach(a => a.classList.add('ativo')); paginaInicio(qs.get('q') || ''); }

  // ---------- início ----------
  async function paginaInicio(q0) {
    document.title = 'Fichas B3 — empresas';
    let sm;
    try { sm = await Fichas.meta(); } catch (e) { app.textContent = 'Erro: ' + e.message; return; }
    app.textContent = '';
    app.appendChild(h('p', { class: 'kicker' }, 'Dados da CVM'));
    app.appendChild(h('h1', null, 'Fichas de ações da B3'));
    if (sm) app.appendChild(h('p', { class: 'sub' }, `${sm.n_empresas_com_ticker} empresas com ticker · demonstrações anuais ${sm.ano_min}–${sm.ano_max} · trimestres até ${sm.ult_tri} · banco atualizado em ${new Date(sm.importado_em).toLocaleString('pt-BR')}`));
    const rec = store.get('recentes', []);
    if (rec.length) app.appendChild(h('p', { class: 'acoes', style: 'margin:0 0 14px' }, h('span', { class: 'status', style: 'align-self:center' }, 'Recentes:'), rec.slice(0, 10).map(t => h('a', { class: 'chip', href: '?t=' + encodeURIComponent(t) }, t))));
    const inp = h('input', { type: 'search', placeholder: 'Filtrar por ticker, nome ou setor', value: q0, style: 'width:100%;font:inherit;padding:9px 12px;border-radius:10px;border:1px solid var(--ln);background:var(--card);color:var(--tx);margin-bottom:12px' });
    app.appendChild(inp);
    const so = h('label', { class: 'status', style: 'display:inline-flex;gap:6px;align-items:center;margin:0 0 10px' }, h('input', { type: 'checkbox', checked: true }), 'Só companhias ativas na CVM');
    app.appendChild(so);
    const corpo = h('tbody');
    const cont = h('p', { class: 'status' });
    app.appendChild(h('div', { class: 'tabela-wrap', style: 'max-height:none' }, h('table', { class: 't lista' }, h('thead', null, h('tr', null, h('th', null, 'Ticker'), h('th', null, 'Empresa'), h('th', null, 'Setor'), h('th', null, 'Tipo'), h('th', { class: 'n' }, 'Último DFP'), h('th', { class: 'n' }, 'Último tri'))), corpo)));
    app.appendChild(cont);
    let es = [];
    try { es = await empresas(); } catch (e) { cont.textContent = e.message; return; }
    const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    function desenhar() {
      const q = norm(inp.value.trim()), soAt = so.querySelector('input').checked;
      const lista = es.filter(e => (!soAt || e.ativa) && (!q || norm(e.tickers.join(' ') + ' ' + e.nome + ' ' + e.setor).includes(q)));
      corpo.textContent = '';
      lista.slice(0, 600).forEach(e => {
        const tr = h('tr', { onclick: () => { location.href = '?t=' + encodeURIComponent(e.ticker); } },
          h('td', null, h('a', { href: '?t=' + encodeURIComponent(e.ticker) }, e.ticker), e.tickers.length > 1 ? h('span', { class: 'status' }, ' ' + e.tickers.slice(1).join(' ')) : null),
          h('td', null, e.nome), h('td', null, e.setor || '—'), h('td', null, e.tipo || '—'), h('td', { class: 'n' }, e.ult_dfp || '—'), h('td', { class: 'n' }, e.ult_tri || '—'));
        corpo.appendChild(tr);
      });
      cont.textContent = lista.length + ' empresas' + (lista.length > 600 ? ' (mostrando 600; refine a busca)' : '');
    }
    inp.addEventListener('input', desenhar);
    so.querySelector('input').addEventListener('change', desenhar);
    desenhar();
    inp.focus();
  }

  // ---------- ficha ----------
  async function paginaFicha(t, atualizar) {
    t = t.toUpperCase();
    document.title = t + ' — Fichas B3';
    if (!atualizar) app.textContent = '';
    if (!atualizar) app.appendChild(h('p', { class: 'carregando' }, 'Montando a ficha de ' + t + '…'));
    let f;
    try { f = await Fichas.ficha(t); }
    catch (e) {
      app.textContent = '';
      app.appendChild(h('h1', null, t));
      app.appendChild(aviso('erro', e.message, ' ', h('a', { href: './' }, 'Voltar à lista')));
      return;
    }
    const rec = store.get('recentes', []).filter(x => x !== f.ticker); rec.unshift(f.ticker); store.set('recentes', rec.slice(0, 12));
    document.title = f.ticker + ' — ' + (f.nome_curto || f.empresa);
    app.textContent = '';
    const A = f.anual || [], fech = A.filter(r => !r.parcial), ult = fech[fech.length - 1] || {}, ant = fech[fech.length - 2] || {};
    const at = f.atual || {}, m12 = at.doze_meses || {};
    const cats = A.map(r => r.rotulo), parc = A.map(r => r.parcial);
    const fin = f.financeira;
    const C1 = 'var(--a)', C2 = 'var(--b)', C3 = 'var(--c)', C4 = 'var(--a2)';

    // cabeçalho
    app.appendChild(h('p', { class: 'kicker' }, [f.setor, f.tipo, f.ativa ? null : 'cancelada na CVM'].filter(Boolean).join(' · ')));
    app.appendChild(h('h1', null, (f.nome_curto || f.empresa) + ' · ' + f.ticker));
    app.appendChild(h('p', { class: 'sub' }, h('span', { class: 'chips' }, f.tickers.map(x => h('a', { class: x === f.ticker ? 'chip' : 'chip cinza', href: '?t=' + x }, x))), '  ',
      `${f.empresa} · CNPJ ${f.cnpj} · DFP até ${f.ult_dfp} · trimestres até ${f.ult_tri || '—'}` + (at.cotacao_data ? ` · cotação de ${dataBR(at.cotacao_data)}` : '')));
    const barra = h('div', { class: 'acoes noprint', style: 'margin:-6px 0 18px' },
      h('button', { class: 'btn', onclick: () => paginaFicha(f.ticker, true) }, 'Recarregar'),
      h('button', { class: 'btn', onclick: () => baixarCSV(f) }, 'Baixar tabela (CSV)'),
      h('button', { class: 'btn', onclick: () => window.print() }, 'Imprimir / PDF'),
      h('a', { class: 'btn', href: '#demonstracoes' }, 'Demonstrações completas'));
    app.appendChild(barra);
    if (f.aviso_cotacao) app.appendChild(aviso('alerta', f.aviso_cotacao));

    // frase de abertura
    const lede = h('p', { class: 'lede' });
    const b = t => h('b', null, t);
    const add = (...xs) => xs.flat(3).forEach(x => { if (x != null && x !== '') lede.append(x); });
    if (ult.receita != null) {
      add(`Em ${ult.ano}, a companhia teve ${fin ? 'receitas de intermediação de' : 'receita líquida de'} `, b(mi(ult.receita)), ult.cresc_receita != null ? ` (${pctS(ult.cresc_receita)} sobre ${ult.ano - 1})` : '', ' e lucro de ', b(mi(ult.lucro_ctrl)), '.');
      if (m12.lucro_ctrl != null && f.ult_tri) add(` Nos ${f.periodo_12m.replace('12 meses', '12 meses')}, lucrou `, b(mi(m12.lucro_ctrl)), m12.roe != null ? [', com ROE de ', b(pct(m12.roe))] : '', '.');
      if (at.p_l != null) add(' A ação negocia a ', b(xv(at.p_l).replace('x', ' vezes')), ' o lucro', f.pl_media != null ? [' (média histórica: ', b(xv(f.pl_media)), ')'] : '', at.dy_12m != null ? [', com dividend yield de ', b(pct(at.dy_12m)), ' em 12 meses'] : '', '.');
      app.appendChild(lede);
    }

    // indicadores de mercado
    const tile = (k, v, d, c) => h('div', { class: 'tile' }, h('div', { class: 'k' }, k), h('div', { class: 'v ' + (c || '') }, v), h('div', { class: 'd' }, d || ''));
    const t1 = h('div', { class: 'tiles' });
    t1.append(
      tile('Cotação', rs(at.cotacao), at.var_12m != null ? h('span', null, h('b', { class: cls(at.var_12m) }, pctS(at.var_12m)), ' em 12 meses') : (at.cotacao_data ? dataBR(at.cotacao_data) : 'sem cotação')),
      tile('P/L (12 meses)', xv(at.p_l), f.pl_media != null ? h('span', null, 'média ', h('b', null, xv(f.pl_media))) : ''),
      tile('P/VP', xv(at.p_vp), 'sobre o PL do ' + (f.ult_tri || 'último balanço')),
      tile('Dividend yield 12m', pct(at.dy_12m), at.proventos_12m_acao != null ? h('span', null, h('b', null, rs(at.proventos_12m_acao)), ' por ação') : ''),
      tile('Valor de mercado', at.valor_mercado_bi != null ? 'R$ ' + N1.format(at.valor_mercado_bi) + ' bi' : '—', at.acoes_mi != null ? N0.format(at.acoes_mi) + ' mi de ações' + (f.contas.acoes === 'capital' ? '' : ' (estimado)') : ''),
      tile('ROE 12m', pct(m12.roe), h('span', null, ult.ano + ': ', h('b', null, pct(ult.roe)), ' · ' + ant.ano + ': ', h('b', null, pct(ant.roe)))));
    app.appendChild(t1);
    const t2 = h('div', { class: 'tiles' });
    const hist = (k) => h('span', null, (ult.ano || '') + ': ', h('b', null, pct(ult[k])), ' · ' + (ant.ano || '') + ': ', h('b', null, pct(ant[k])));
    t2.append(tile(fin ? 'Margem bruta da intermediação' : 'Margem bruta', pct(m12.margem_bruta ?? ult.margem_bruta), m12.margem_bruta == null && ult.ano ? h('span', null, 'em ' + ult.ano + ' · ' + (ant.ano || '') + ': ', h('b', null, pct(ant.margem_bruta))) : hist('margem_bruta')));
    if (!fin) t2.append(tile('Margem EBIT', pct(m12.margem_ebit), hist('margem_ebit')));
    t2.append(tile('Margem líquida', pct(m12.margem_liq), hist('margem_liq')));
    if (!fin) t2.append(tile('Dív. líquida / EBITDA', xv(m12.div_ebitda), m12.div_liq != null ? h('span', null, 'dívida líquida ', h('b', null, mi(m12.div_liq))) : ''));
    else t2.append(tile('Patrimônio líquido', mi(m12.pl), 'no ' + (f.ult_tri || '')));
    app.appendChild(t2);
    app.appendChild(h('p', { class: 'desc' }, `Valores grandes: ${f.periodo_12m || 'últimos 12 meses'} (indicadores trimestrais da CVM). Abaixo de cada um, os anos fechados (DFP). ROE = lucro dos controladores ÷ patrimônio líquido médio.` + (f.contas.acoes === 'capital' ? ' Ações em circulação pela composição do capital informada à CVM (sem tesouraria).' : ' Ações estimadas pelo lucro ÷ lucro por ação.')));

    // escala dos gráficos em R$ bi ou mi
    const maxRec = Math.max(...A.map(r => Math.abs(r.receita || 0)), 1);
    const emBi = maxRec >= 3000, div = emBi ? 1000 : 1, un = emBi ? 'R$ bilhões' : 'R$ milhões';
    const fv = v => ok(v) ? (emBi ? N1 : N0).format(v) : '';
    const fa = v => (emBi ? (Math.abs(v) < 10 ? N1 : N0) : N0).format(v);

    // cotação diária (antes da receita)
    secaoCotacaoDiaria(f);

    // receita
    const gR = h('div', { class: 'graf' });
    app.appendChild(card(h('h2', null, `${f.rotulo_receita}, ${cats[0] || ''}–${cats[cats.length - 1] || ''}`),
      h('p', { class: 'desc' }, `${un} por ano, DFP consolidada da CVM. ${A.some(r => r.parcial) ? cats[cats.length - 1] + ' é parcial (barra clara): ' + f.periodo_12m + '.' : ''} Abaixo do valor, o crescimento sobre o ano anterior.`), gR));
    G.categorias(gR, { cats, parcial: parc, series: [{ nome: f.rotulo_receita, cor: C1, vals: A.map(r => ok(r.receita) ? r.receita / div : null) }], fmtEsq: fa, legenda: false,
      rotulos: { fmt: fv, amostra: emBi ? '000,0' : '00.000', sub: i => A[i].cresc_receita != null ? { t: pctS(A[i].cresc_receita), cor: A[i].cresc_receita >= 0 ? 'var(--ok)' : 'var(--bad)' } : null },
      titulo: i => A[i].parcial ? cats[i] + ' · ' + f.periodo_12m : cats[i], tooltip: i => [[f.rotulo_receita, mi(A[i].receita), C1], ['Crescimento', pctS(A[i].cresc_receita)]] });

    // lucro e margem líquida
    const gL = h('div', { class: 'graf' });
    app.appendChild(card(h('h2', null, 'Lucro líquido e margem líquida'), h('p', { class: 'desc' }, `Barras: lucro atribuído aos controladores (${un}); linha: lucro líquido ÷ receita (eixo à direita).`), gL));
    G.categorias(gL, { cats, parcial: parc, series: [{ nome: 'Lucro dos controladores', cor: C1, corNeg: 'var(--bad)', vals: A.map(r => ok(r.lucro_ctrl) ? r.lucro_ctrl / div : null) }, { nome: 'Margem líquida', tipo: 'linha', eixo: 'dir', cor: C2, vals: A.map(r => r.margem_liq) }],
      fmtEsq: fa, fmtDir: v => N0.format(v * 100) + '%', zero: true,
      tooltip: i => [['Lucro dos controladores', mi(A[i].lucro_ctrl), C1], ['Lucro líquido total', mi(A[i].lucro)], ['Margem líquida', pct(A[i].margem_liq), C2], ['Variação do lucro', pctS(A[i].cresc_lucro)]] });

    // margens e ROE
    const gM = h('div', { class: 'graf' }), gRoe = h('div', { class: 'graf' });
    const sM = [{ nome: fin ? 'Margem bruta da intermediação' : 'Margem bruta', tipo: 'linha', cor: C1, vals: A.map(r => r.margem_bruta) }];
    if (!fin) sM.push({ nome: 'Margem EBIT', tipo: 'linha', cor: C3, vals: A.map(r => r.margem_ebit) });
    sM.push({ nome: 'Margem líquida', tipo: 'linha', cor: C2, vals: A.map(r => r.margem_liq) });
    app.appendChild(h('div', { class: 'grade2 secao' },
      h('section', { class: 'card' }, h('h2', null, 'Margens'), h('p', { class: 'desc' }, fin ? 'Resultado bruto da intermediação e lucro líquido sobre as receitas de intermediação.' : 'Lucro bruto, EBIT (resultado antes do resultado financeiro e dos impostos) e lucro líquido sobre a receita líquida.'), gM),
      h('section', { class: 'card' }, h('h2', null, 'Retorno sobre o patrimônio (ROE)'), h('p', { class: 'desc' }, 'Lucro dos controladores ÷ patrimônio líquido médio do ano.'), gRoe)));
    G.categorias(gM, { cats, parcial: parc, series: sM, fmtEsq: v => N0.format(v * 100) + '%', zero: false, tooltip: i => sM.map(x => [x.nome, pct(x.vals[i]), x.cor]) });
    G.categorias(gRoe, { cats, parcial: parc, series: [{ nome: 'ROE', cor: C3, corNeg: 'var(--bad)', vals: A.map(r => r.roe) }], fmtEsq: v => N0.format(v * 100) + '%', legenda: false, rotulos: { fmt: v => N0.format(v * 100) + '%', amostra: '00%' }, tooltip: i => [['ROE', pct(A[i].roe), C3], ['Lucro dos controladores', mi(A[i].lucro_ctrl)], ['PL dos controladores', mi(A[i].pl_ctrl)]] });

    // P/L
    const temPreco = (f.cotacoes || []).length > 0;
    const gP = h('div', { class: 'graf' });
    const Apl = A.filter(r => r.p_l != null || r.preco != null);
    const tetoPL = f.pl_media != null ? Math.max(40, f.pl_media * 4) : 100;
    const foraPL = Apl.filter(r => r.p_l != null && (r.p_l <= 0 || r.p_l > tetoPL)).map(r => r.rotulo + (r.p_l <= 0 ? ' (prejuízo)' : ' (' + xv(r.p_l) + ')'));
    app.appendChild(card(h('h2', null, 'Preço / lucro (P/L)'), h('p', { class: 'desc' }, 'Preço de fechamento do último pregão de cada ano ÷ lucro por ação do ano (ajustados por desdobramentos). ', A.some(r => r.parcial) ? `${cats[cats.length - 1]}: cotação atual sobre o lucro dos ${f.periodo_12m}. ` : '', f.pl_media != null ? ['Linha tracejada: média dos anos com lucro, ', h('b', null, xv(f.pl_media)), '. '] : '', foraPL.length ? 'Fora do gráfico (lucro muito baixo ou prejuízo): ' + foraPL.join(', ') + '.' : ''), gP));
    G.categorias(gP, { cats: Apl.map(r => r.rotulo), parcial: Apl.map(r => r.parcial), series: [{ nome: 'P/L', tipo: 'linha', cor: C1, vals: Apl.map(r => (r.p_l != null && r.p_l > 0 && r.p_l <= tetoPL) ? r.p_l : null) }], fmtEsq: v => N0.format(v) + 'x', legenda: false,
      refs: f.pl_media != null ? [{ valor: f.pl_media, rotulo: 'média ' + xv(f.pl_media) }] : [], rotulos: { fmt: v => N1.format(v) + 'x', amostra: '00,0x' }, vazio: temPreco ? 'Sem lucro por ação para calcular o P/L.' : 'Sem cotações deste ticker para calcular o P/L.',
      tooltip: i => { const r = Apl[i]; return [['P/L', r.p_l != null && r.p_l < 0 ? 'prejuízo' : xv(r.p_l), C1], [r.parcial ? 'Cotação atual' : 'Preço no fim do ano', rs(r.preco)], ['Lucro por ação', rs(r.lpa)], ['P/VP', xv(r.p_vp)], ['Valor de mercado', r.valor_mercado_bi != null ? 'R$ ' + N1.format(r.valor_mercado_bi) + ' bi' : null]]; } });

    // cotação mensal
    if (temPreco) secaoCotacao(f);

    // proventos
    const gV = h('div', { class: 'graf' });
    const Ap = A.filter(r => !r.parcial || r.dy_data_com != null);
    app.appendChild(card(h('h2', null, 'Proventos e dividend yield'), h('p', { class: 'desc' }, 'Barras: dividendos e JCP pagos em caixa no ano (fluxo de caixa da DFP) por ação, na base atual de ações; linha: dividend yield sobre o valor de mercado no fim do ano. ',
      A.some(r => r.parcial) ? `${cats[cats.length - 1]}: proventos com data-ex nos últimos 12 meses sobre a cotação atual. ` : '', 'No detalhe, o payout (proventos ÷ lucro).'), gV));
    G.categorias(gV, { cats: Ap.map(r => r.rotulo), parcial: Ap.map(r => r.parcial), series: [{ nome: 'Proventos por ação (R$)', cor: C4, vals: Ap.map(r => r.parcial ? r.prov_data_com : r.prov_acao) }, { nome: 'Dividend yield', tipo: 'linha', eixo: 'dir', cor: C2, vals: Ap.map(r => r.parcial ? r.dy_data_com : r.dy) }],
      fmtEsq: v => 'R$ ' + N2.format(v), fmtDir: v => N0.format(v * 100) + '%',
      tooltip: i => { const r = Ap[i]; return [['Pagos no ano', r.parcial ? null : mi(r.proventos)], ['Por ação', rs(r.parcial ? r.prov_data_com : r.prov_acao), C4], ['Dividend yield', pct(r.parcial ? r.dy_data_com : r.dy), C2], ['Payout', pct(r.payout)], ['Recompras', r.recompras ? mi(r.recompras) : null], ['Por ação pela data-ex', r.parcial ? null : rs(r.prov_data_com)]]; } });

    // endividamento
    if (!fin) {
      const gD = h('div', { class: 'graf' });
      app.appendChild(card(h('h2', null, 'Endividamento'), h('p', { class: 'desc' }, `Barras: dívida líquida = empréstimos e financiamentos − caixa e aplicações (${un}); linha: dívida líquida ÷ EBITDA dos 12 meses (eixo à direita). Valor negativo = caixa líquido.`), gD));
      G.categorias(gD, { cats, parcial: parc, series: [{ nome: 'Dívida líquida', cor: C1, corNeg: C3, vals: A.map(r => ok(r.div_liq) ? r.div_liq / div : null) }, { nome: 'Dív. líq. / EBITDA', tipo: 'linha', eixo: 'dir', cor: C2, vals: A.map(r => r.div_ebitda) }],
        fmtEsq: fa, fmtDir: v => N1.format(v) + 'x', tooltip: i => [['Dívida bruta', mi(A[i].div_bruta)], ['Caixa e aplicações', mi(A[i].caixa)], ['Dívida líquida', mi(A[i].div_liq), C1], ['Dív. líq. / EBITDA', xv(A[i].div_ebitda), C2]] });
      // fluxo de caixa
      const gF = h('div', { class: 'graf' });
      app.appendChild(card(h('h2', null, 'Geração de caixa'), h('p', { class: 'desc' }, `Caixa das operações (FCO), investimentos em imobilizado e intangível (capex) e proventos pagos, ${un}.`), gF));
      G.categorias(gF, { cats: fech.map(r => r.rotulo), series: [{ nome: 'FCO', cor: C1, vals: fech.map(r => ok(r.fco) ? r.fco / div : null) }, { nome: 'Capex', cor: C2, vals: fech.map(r => ok(r.capex) ? r.capex / div : null) }, { nome: 'Proventos pagos', cor: C4, vals: fech.map(r => ok(r.proventos) ? r.proventos / div : null) }],
        fmtEsq: fa, tooltip: i => { const r = fech[i]; return [['FCO', mi(r.fco), C1], ['Capex', mi(r.capex), C2], ['FCO − capex', mi(ok(r.fco) && ok(r.capex) ? r.fco - r.capex : null)], ['Proventos pagos', mi(r.proventos), C4], ['Recompras', r.recompras ? mi(r.recompras) : null]]; } });
    }

    // tabela anual
    const colsA = [['Ano', r => r.rotulo, 'txt'], [f.rotulo_receita, r => miN(r.receita)], ['Cresc.', r => pctS(r.cresc_receita)], [f.rotulo_bruto, r => miN(r.lucro_bruto)]];
    if (!fin) colsA.push(['EBIT', r => miN(r.ebit)]); else colsA.push(['Res. antes trib.', r => miN(r.ebit)]);
    colsA.push(['Lucro ctrl.', r => miN(r.lucro_ctrl)], ['Mg. bruta', r => pct(r.margem_bruta)]);
    if (!fin) colsA.push(['Mg. EBIT', r => pct(r.margem_ebit)]);
    colsA.push(['Mg. líq.', r => pct(r.margem_liq)], ['ROE', r => pct(r.roe)], ['LPA', r => rs(r.lpa)], ['Ativo total', r => miN(r.ativo)], ['PL', r => miN(r.pl)]);
    if (!fin) colsA.push(['Caixa', r => miN(r.caixa)], ['Dív. bruta', r => miN(r.div_bruta)], ['Dív. líq.', r => miN(r.div_liq)], ['DL/EBITDA', r => xv(r.div_ebitda)], ['FCO', r => miN(r.fco)], ['Capex', r => miN(r.capex)]);
    colsA.push(['Proventos', r => miN(r.proventos)], ['Payout', r => pct(r.payout)], ['Preço', r => rs(r.preco)], ['P/L', r => xv(r.p_l)], ['P/VP', r => xv(r.p_vp)], ['DY', r => pct(r.parcial ? r.dy_data_com : r.dy)]);
    app.appendChild(card(h('h2', null, 'Histórico anual'), h('p', { class: 'desc' }, 'Valores em R$ milhões, exceto por ação, preços e percentuais. Linha em itálico: período parcial (12 meses).'),
      h('div', { class: 'tabela-wrap' }, h('table', { class: 't' }, h('thead', null, h('tr', null, colsA.map((c, i) => h('th', { class: i ? 'n' : '' }, c[0])))),
        h('tbody', null, A.slice().reverse().map(r => h('tr', { class: r.parcial ? 'parcial' : '' }, colsA.map((c, i) => h('td', { class: i ? 'n' : '' }, c[1](r))))))))));

    // trimestres
    const T = f.trimestres || [];
    if (T.length) {
      const colsT = [['Trimestre', t => t.tri], [f.rotulo_receita, t => miN(t.receita)], ['Var. a/a', t => pctS(t.var_receita)]];
      if (!fin) colsT.push(['EBITDA', t => miN(t.ebitda)]);
      colsT.push(['Lucro ctrl.', t => miN(t.lucro_ctrl)], ['Var. a/a', t => pctS(t.var_lucro)], ['Mg. líq.', t => pct(t.margem_liq)], ['ROE 12m', t => pct(t.roe_12m)], ['PL', t => miN(t.pl)]);
      if (!fin) colsT.push(['Dív. líq.', t => miN(t.div_liq)], ['DL/EBITDA 12m', t => xv(t.div_ebitda_12m)], ['FCO', t => miN(t.fco)]);
      const gT = h('div', { class: 'graf' });
      app.appendChild(card(h('h2', null, 'Últimos trimestres'), h('p', { class: 'desc' }, 'Resultados de cada trimestre (ITR/DFP da CVM), R$ milhões. Barras: ' + f.rotulo_receita.toLowerCase() + '; linha: margem líquida.'), gT,
        h('div', { class: 'tabela-wrap', style: 'margin-top:12px' }, h('table', { class: 't' }, h('thead', null, h('tr', null, colsT.map((c, i) => h('th', { class: i ? 'n' : '' }, c[0])))),
          h('tbody', null, T.slice().reverse().map(t => h('tr', null, colsT.map((c, i) => h('td', { class: i ? 'n' : '' }, c[1](t))))))))));
      G.categorias(gT, { cats: T.map(t => t.tri), series: [{ nome: f.rotulo_receita, cor: C1, vals: T.map(t => ok(t.receita) ? t.receita / div : null) }, { nome: 'Margem líquida', tipo: 'linha', eixo: 'dir', cor: C2, vals: T.map(t => t.margem_liq) }], fmtEsq: fa, fmtDir: v => N0.format(v * 100) + '%', altura: 240,
        tooltip: i => [[f.rotulo_receita, mi(T[i].receita), C1], ['Var. a/a', pctS(T[i].var_receita)], ['Lucro dos controladores', mi(T[i].lucro_ctrl)], ['Margem líquida', pct(T[i].margem_liq), C2]] });
    }

    // links para cada ITR e DFP gravado no banco
    secaoDemonstracoes(f);

    // notas
    const notas = (f.notas || []).slice();
    notas.push('Demonstrações financeiras: banco fichas-b3 no Supabase, carregado dos DFP/ITR da CVM (dados abertos, toda semana, e Empresas.NET, no dia da entrega); valores em R$ milhões.');
    if (f.fonte_cotacao) notas.push('Cotações: ' + f.fonte_cotacao + '. Preço sem ajuste por proventos, ajustado por desdobramentos; “com proventos reinvestidos” usa o fechamento ajustado.');
    notas.push(f.contas.acoes === 'capital' ? 'Ações em circulação: composição do capital (total menos tesouraria) informada nos DFP/ITR da CVM; valor de mercado = ações × cotação do ticker escolhido; P/L = valor de mercado ÷ lucro dos controladores.' : 'Ações em circulação estimadas como lucro dos controladores ÷ lucro por ação da classe ' + (f.classe === 'UNIT' ? 'ON' : f.classe) + ' (sem os zips da CVM); P/L, valor de mercado e yield dependem dessa estimativa.');
    app.appendChild(h('div', { class: 'rodape' }, h('b', null, 'Notas e fontes'), h('ul', null, notas.map(n => h('li', null, n))), h('p', null, 'Ficha gerada em ' + f.gerado_em + ' a partir do banco fichas-b3. Não é recomendação de investimento.')));
  }

  function secaoCotacaoDiaria(f) {
    let per = store.get('cot_diaria_periodo', '1a');
    const opts = [['6m', '6 meses', 182], ['1a', '1 ano', 365], ['2a', '2 anos', 730], ['5a', '5 anos', 1830], ['10a', '10 anos', 3655], ['tudo', 'Tudo', 1e6]];
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Intervalo' });
    const btns = opts.map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(k === per), onclick: () => { per = k; store.set('cot_diaria_periodo', k); desenhar(); } }, l));
    btns.forEach(b => seg.appendChild(b));
    const g = h('div', { class: 'graf' }, h('p', { class: 'carregando' }, 'Carregando cotações diárias…'));
    const info = h('p', { class: 'desc' }, 'Fechamento de cada pregão desde o início da negociação, em R$, e o fechamento ajustado por proventos (quanto valeria a ação com dividendos e JCP reinvestidos, na base do preço atual).');
    app.appendChild(card(h('div', { class: 'cab' }, h('h2', null, 'Cotação diária'), seg), info, g));
    let pts = [];
    function desenhar() {
      btns.forEach((b, i) => b.setAttribute('aria-pressed', String(opts[i][0] === per)));
      if (!pts.length) return;
      const ult = pts[pts.length - 1], dias = opts.find(o => o[0] === per)[2];
      const lim = new Date(ult.d.getTime() - dias * 864e5);
      let s = pts.filter(p => p.d >= lim);
      if (s.length < 2) s = pts;
      const v0 = s[0], vp = ult.v / v0.v - 1, va = ult.a != null && v0.a ? ult.a / v0.a - 1 : null;
      info.textContent = '';
      info.append('Fechamento de cada pregão, em R$. Último: ', h('b', null, rs(ult.v)), ' em ' + dataBR(ult.data) + '. No intervalo: ', h('b', { class: cls(vp) }, pctS(vp)), ' só no preço',
        ...(va != null ? [' e ', h('b', { class: cls(va) }, pctS(va)), ' com proventos reinvestidos (linha ajustada)'] : []), '.');
      G.tempo(g, { pts: s, series: [{ nome: 'Fechamento', key: 'v', cor: 'var(--a)' }, { nome: 'Ajustado por proventos', key: 'a', cor: 'var(--c)' }], zero: false,
        fmt: v => 'R$ ' + (v < 10 ? N2 : N0).format(v), titulo: p => dataBR(p.data),
        tooltip: p => [['Fechamento', rs(p.v), 'var(--a)'], ['Ajustado por proventos', rs(p.a), 'var(--c)']] });
    }
    Fichas.diaria(f.ticker).then(rows => {
      pts = rows.filter(r => isFinite(r.fechamento)).map(r => ({ d: new Date(r.data + 'T12:00:00'), data: r.data, v: r.fechamento, a: r.ajustado }));
      if (!pts.length) { g.textContent = ''; g.appendChild(h('div', { class: 'vazio' }, 'Sem cotações diárias deste ticker no banco.')); return; }
      desenhar();
    }).catch(e => { g.textContent = ''; g.appendChild(h('div', { class: 'vazio' }, 'Não consegui ler as cotações diárias: ' + e.message)); });
  }

  function secaoCotacao(f) {
    const pts = f.cotacoes.map(c => ({ d: new Date(c.data + 'T12:00:00'), mes: c.mes, v: c.fechamento, a: c.ajustado, p: c.provento }));
    const ultimo = pts[pts.length - 1];
    let per = store.get('cot_periodo', '5a');
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Intervalo' });
    const opts = [['1a', '1 ano'], ['3a', '3 anos'], ['5a', '5 anos'], ['10a', '10 anos'], ['tudo', 'Tudo']];
    const btns = opts.map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(k === per), onclick: () => { per = k; store.set('cot_periodo', k); desenhar(); } }, l));
    btns.forEach(b => seg.appendChild(b));
    const g1 = h('div', { class: 'graf' }), g2 = h('div', { class: 'graf' });
    const info = h('p', { class: 'desc' }), info2 = h('p', { class: 'desc' });
    app.appendChild(card(h('div', { class: 'cab' }, h('h2', null, 'Cotação mensal'), seg), info, g1,
      h('h3', null, 'Com proventos reinvestidos'), info2, g2));
    function desenhar() {
      btns.forEach((b, i) => b.setAttribute('aria-pressed', String(opts[i][0] === per)));
      const anos = { '1a': 1, '3a': 3, '5a': 5, '10a': 10 }[per];
      let s = pts;
      if (anos) { const lim = new Date(ultimo.d); lim.setFullYear(lim.getFullYear() - anos); s = pts.filter(p => p.d >= lim); }
      if (s.length < 2) s = pts;
      const v0 = s[0], vp = ultimo.v / v0.v - 1, vt = ultimo.a / v0.a - 1;
      info.textContent = '';
      info.append('Fechamento do último pregão de cada mês, em R$, ajustado por desdobramentos. Último: ', h('b', null, rs(ultimo.v)), ' em ' + dataBR(f.atual.cotacao_data) + '. No intervalo: ', h('b', { class: cls(vp) }, pctS(vp)), '.');
      info2.textContent = '';
      info2.append('Quanto viraria R$ 1.000 aplicados em ' + v0.mes.slice(5) + '/' + v0.mes.slice(0, 4) + ': só pelo preço ', h('b', { class: cls(vp) }, pctS(vp)), '; reinvestindo dividendos e JCP ', h('b', { class: cls(vt) }, pctS(vt)), '.');
      G.tempo(g1, { pts: s, series: [{ nome: 'Fechamento', key: 'v', cor: 'var(--a)' }], area: true, fmt: v => 'R$ ' + (v < 10 ? N2 : N0).format(v),
        tooltip: (p) => { const i = pts.indexOf(p); const r = [['Fechamento', rs(p.v)]]; if (i >= 12) r.push(['Variação em 12 meses', pctS(p.v / pts[i - 12].v - 1)]); if (p.p) r.push(['Provento no mês', rs(p.p, 4)]); return r; } });
      const idx = s.map(p => ({ d: p.d, so: 1000 * p.v / v0.v, com: 1000 * p.a / v0.a }));
      G.tempo(g2, { pts: idx, series: [{ nome: 'Só preço', key: 'so', cor: 'var(--eixo)' }, { nome: 'Com proventos reinvestidos', key: 'com', cor: 'var(--c)', largura: 2.5 }], fmt: v => 'R$ ' + N0.format(v), ref: 1000, zero: false, rotFinal: true, altura: 240,
        tooltip: p => [['Com proventos', 'R$ ' + N0.format(p.com) + ' (' + pctS(p.com / 1000 - 1) + ')', 'var(--c)'], ['Só preço', 'R$ ' + N0.format(p.so) + ' (' + pctS(p.so / 1000 - 1) + ')', 'var(--eixo)']] });
    }
    desenhar();
  }


  // ---------- demonstrações completas ----------
  const linkDemo = (t, tipo, chave) => '?t=' + encodeURIComponent(t) + '&' + tipo + '=' + encodeURIComponent(chave);
  function secaoDemonstracoes(f) {
    const corpo = h('div', null, h('p', { class: 'status' }, 'Procurando os documentos no banco…'));
    app.appendChild(h('section', { class: 'card secao', id: 'demonstracoes' }, h('h2', null, 'Demonstrações completas'),
      h('p', { class: 'desc' }, 'DRE, balanço e fluxo de caixa de cada documento entregue à CVM, conta por conta, como estão no banco.'), corpo));
    Fichas.porTicker(f.ticker).then(e => Fichas.periodos(e)).then(p => {
      corpo.textContent = '';
      const linha = (titulo, itens) => h('div', { class: 'demos' }, h('span', { class: 'status' }, titulo), h('span', { class: 'chips' }, itens));
      if (p.itr.length) {
        const anos = {};
        p.itr.forEach(x => { (anos[x.dt.slice(0, 4)] = anos[x.dt.slice(0, 4)] || []).push(x); });
        Object.keys(anos).sort().reverse().forEach(a => corpo.appendChild(linha('ITR ' + a, anos[a].slice().reverse().map(x => h('a', { class: 'chip', href: linkDemo(f.ticker, 'itr', x.dt) }, x.rot)))));
      } else corpo.appendChild(h('p', { class: 'status' }, 'Nenhum ITR completo gravado para esta empresa (o banco guarda os ITR a partir de 2025).'));
      if (p.dfp.length) corpo.appendChild(linha('DFP (anual)', p.dfp.slice().reverse().map(a => h('a', { class: 'chip cinza', href: linkDemo(f.ticker, 'dfp', a) }, String(a)))));
    }).catch(err => { corpo.textContent = ''; corpo.appendChild(aviso('erro', 'Não foi possível listar os documentos: ' + err.message)); });
  }

  async function paginaDemo(t, tipo, chave) {
    t = t.toUpperCase();
    app.textContent = '';
    app.appendChild(h('p', { class: 'carregando' }, 'Carregando as demonstrações de ' + t + '…'));
    let e, per, d;
    try {
      e = await Fichas.porTicker(t);
      if (!e) throw new Error('ticker não encontrado no banco: ' + t);
      [per, d] = await Promise.all([Fichas.periodos(e), Fichas.demonstracao(e, tipo, chave)]);
    } catch (err) {
      app.textContent = '';
      app.appendChild(h('h1', null, t));
      app.appendChild(aviso('erro', err.message, ' ', h('a', { href: '?t=' + encodeURIComponent(t) }, 'Voltar à ficha')));
      return;
    }
    const nome = e.nome_curto || e.nome;
    const titulo = tipo === 'itr' ? 'ITR ' + d.rot : 'DFP ' + d.chave;
    document.title = t + ' · ' + titulo + ' — Fichas B3';
    app.textContent = '';

    // sequência de documentos, do mais antigo ao mais novo (DFP no fim do ano)
    const seq = per.itr.map(x => ({ tipo: 'itr', chave: x.dt, rot: x.rot, ord: x.dt }))
      .concat(per.dfp.map(a => ({ tipo: 'dfp', chave: String(a), rot: 'DFP ' + a, ord: a + '-12-31~' })))
      .sort((a, b) => a.ord < b.ord ? -1 : 1);
    const i = seq.findIndex(x => x.tipo === tipo && x.chave === String(chave));
    const ant = i > 0 ? seq[i - 1] : null, prox = i >= 0 && i < seq.length - 1 ? seq[i + 1] : null;

    app.appendChild(h('p', { class: 'kicker' }, tipo === 'itr' ? 'Informações trimestrais (ITR)' : 'Demonstrações financeiras padronizadas (DFP)'));
    app.appendChild(h('h1', null, nome + ' · ' + titulo));
    app.appendChild(h('p', { class: 'sub' }, `${e.nome} · CNPJ ${e.cnpj} · ` + (tipo === 'itr' ? 'data de referência ' + dataBR(chave) : 'exercício de ' + chave) + (d.base ? ' · ' + d.base : '') + ' · R$ milhões'));
    app.appendChild(h('div', { class: 'acoes noprint', style: 'margin:-6px 0 18px' },
      h('a', { class: 'btn', href: '?t=' + encodeURIComponent(t) }, '← Ficha de ' + t),
      ant ? h('a', { class: 'btn', href: linkDemo(t, ant.tipo, ant.chave) }, '‹ ' + ant.rot) : null,
      prox ? h('a', { class: 'btn', href: linkDemo(t, prox.tipo, prox.chave) }, prox.rot + ' ›') : null,
      h('button', { class: 'btn', onclick: () => baixarDemo(t, titulo, d) }, 'Baixar (CSV)'),
      h('button', { class: 'btn', onclick: () => window.print() }, 'Imprimir / PDF')));

    if (!d.dre.length && !d.bp.length && !d.dfc.length) {
      app.appendChild(aviso('alerta', 'Este documento não está no banco. ', h('a', { href: '?t=' + encodeURIComponent(t) + '#demonstracoes' }, 'Ver os documentos disponíveis')));
      return;
    }
    const fmt = (cod, v) => ok(v) ? (cod.startsWith('3.99') ? N2 : N1).format(v) : '';
    const nivel = cod => cod.split('.').length - 1;
    const tabela = (linhas, cols) => h('div', { class: 'tabela-wrap' }, h('table', { class: 't demo' },
      h('thead', null, h('tr', null, h('th', null, 'Conta'), h('th', null, 'Descrição'), cols.map(c => h('th', { class: 'n' }, c[0])))),
      h('tbody', null, linhas.map(r => h('tr', { class: 'nv' + Math.min(nivel(r.cod_conta), 3) },
        h('td', null, r.cod_conta),
        h('td', { style: 'padding-left:' + (10 + 16 * Math.max(nivel(r.cod_conta) - 1, 0)) + 'px' }, r.conta || ''),
        cols.map(c => { const v = r[c[1]]; return h('td', { class: 'n' + (ok(v) && v < 0 ? ' down' : '') }, fmt(r.cod_conta, v)); }))))));

    const trim1 = tipo === 'itr' && d.dre.every(r => r.trimestre === r.acumulado);
    const colsDre = tipo === 'dfp' ? [['Exercício ' + chave, 'valor']] : trim1 ? [[d.rot, 'trimestre']] : [['Trimestre (' + d.rot + ')', 'trimestre'], ['Acumulado no exercício', 'acumulado']];
    const blocos = [
      ['dre', 'Demonstração do resultado', d.dre, colsDre, tipo === 'itr' ? 'Todas as contas. "Trimestre" é o valor dos 3 meses como a empresa informou no ITR; "acumulado" vai do início do exercício até a data de referência.' : 'Todas as contas do exercício.'],
      ['bp', 'Balanço patrimonial', d.bp, [['Em ' + (tipo === 'itr' ? dataBR(chave) : 'fim de ' + chave), 'valor']], 'Ativo (1) e passivo mais patrimônio líquido (2), até o 3º nível.'],
      ['dfc', 'Fluxo de caixa', d.dfc, [[tipo === 'itr' ? 'Acumulado no exercício' : 'Exercício ' + chave, 'valor']], tipo === 'itr' ? 'Método indireto, até o 4º nível. O ITR só traz o fluxo acumulado no exercício.' : 'Método indireto, até o 3º nível.']];
    // contas zeradas em todas as colunas ficam ocultas, a não ser que se peça
    let zeros = store.get('demo_zeros', false);
    const zerada = (r, cols) => cols.every(c => !r[c[1]]);
    const cx = h('input', { type: 'checkbox' }); cx.checked = zeros;
    const lugares = blocos.map(() => h('div'));
    const desenhar = () => blocos.forEach((b, k) => {
      const ls = zeros ? b[2] : b[2].filter(r => !zerada(r, b[3]));
      lugares[k].textContent = '';
      lugares[k].appendChild(ls.length ? tabela(ls, b[3]) : h('p', { class: 'status' }, 'Sem dados desta demonstração no banco.'));
    });
    cx.addEventListener('change', () => { zeros = cx.checked; store.set('demo_zeros', zeros); desenhar(); });
    app.appendChild(h('div', { class: 'acoes noprint', style: 'align-items:center' }, blocos.map(b => h('a', { class: 'chip', href: '#' + b[0] }, b[1])),
      h('label', { class: 'status', style: 'margin-left:auto' }, cx, ' Mostrar contas zeradas')));
    blocos.forEach((b, k) => app.appendChild(h('section', { class: 'card secao', id: b[0] }, h('h2', null, b[1]), h('p', { class: 'desc' }, b[4] + (b[0] === 'dre' ? ' Contas 3.99 (lucro por ação) em R$ por ação.' : '')), lugares[k])));
    desenhar();
    app.appendChild(h('div', { class: 'rodape' }, h('p', null, 'Fonte: ' + (tipo === 'itr' ? 'ITR' : 'DFP') + ' entregue à CVM (dados abertos e Empresas.NET), banco fichas-b3. Não é recomendação de investimento.')));
  }

  function baixarDemo(t, titulo, d) {
    const esc = v => { if (v == null) return ''; if (typeof v === 'number') return String(v).replace('.', ','); const s = String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const linhas = ['demonstracao;cod_conta;conta;' + (d.tipo === 'itr' ? 'trimestre;acumulado' : 'valor')];
    d.dre.forEach(r => linhas.push(['DRE', r.cod_conta, r.conta].map(esc).concat(d.tipo === 'itr' ? [esc(r.trimestre), esc(r.acumulado)] : [esc(r.valor)]).join(';')));
    d.bp.forEach(r => linhas.push(['BP', r.cod_conta, r.conta].map(esc).concat(d.tipo === 'itr' ? [esc(r.valor), ''] : [esc(r.valor)]).join(';')));
    d.dfc.forEach(r => linhas.push(['DFC', r.cod_conta, r.conta].map(esc).concat(d.tipo === 'itr' ? ['', esc(r.valor)] : [esc(r.valor)]).join(';')));
    const blob = new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: (t + '_' + titulo.replace(/\s+/g, '_')).toLowerCase() + '.csv' });
    document.body.appendChild(a); a.click(); a.remove();
  }

  function baixarCSV(f) {
    const cols = Object.keys(f.anual[0] || {});
    const esc = v => { if (v == null) return ''; if (typeof v === 'number') return String(v).replace('.', ','); const s = String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const linhas = [cols.join(';')].concat(f.anual.map(r => cols.map(c => esc(r[c])).join(';')));
    const blob = new Blob(['\ufeff' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: f.ticker.toLowerCase() + '_anual.csv' });
    document.body.appendChild(a); a.click(); a.remove();
  }

})();
