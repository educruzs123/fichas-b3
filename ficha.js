/* Fichas B3 — leitura do banco fichas-b3 (Supabase) e montagem da ficha.
   É a mesma conta do app FichaB3Completa (ficha.go), reescrita em JavaScript
   para rodar no navegador. Valores em R$ milhões; por ação em R$. */
(function () {
  'use strict';
  const SUPA_URL = 'https://crdjqnivmxuzxihgeohm.supabase.co';
  const SUPA_CHAVE = 'sb_publishable_ij_YqC0j1gEBTiPNXW5Erg_zF6fjnZi'; // chave publicável: só leitura
  const PAGINA = 1000;

  // ---------- Supabase (PostgREST) ----------
  async function get(caminho, params, offset) {
    const q = new URLSearchParams(params);
    if (offset != null) { q.set('limit', PAGINA); q.set('offset', offset); }
    let r;
    try {
      r = await fetch(SUPA_URL + '/rest/v1/' + caminho + '?' + q.toString(), { headers: { apikey: SUPA_CHAVE, Accept: 'application/json' } });
    } catch (e) { throw new Error('sem conexão com o banco (Supabase): ' + e.message); }
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) { /* não é JSON */ }
    if (!r.ok) throw new Error('o banco respondeu ' + r.status + ': ' + ((j && j.message) || txt.slice(0, 200)));
    return j;
  }
  async function todos(caminho, params) {
    let out = [];
    for (let off = 0; ; off += PAGINA) {
      const pg = await get(caminho, params, off);
      out = out.concat(pg);
      if (pg.length < PAGINA) return out;
    }
  }

  let listaCache = null;
  async function lista() {
    if (listaCache) return listaCache;
    const rows = await todos('empresas', { select: 'id,cnpj,cod_cvm,nome,nome_curto,setor,tipo,ativa,tickers,ult_dfp,ult_tri', tickers: 'neq.{}', ult_dfp: 'not.is.null', order: 'id' });
    const l = rows.map(r => ({ id: r.id, cnpj: r.cnpj, cod_cvm: r.cod_cvm || '', nome: r.nome || '', nome_curto: r.nome_curto || r.nome || '', setor: r.setor || '', tipo: r.tipo || '',
      ativa: !!r.ativa, tickers: r.tickers || [], ult_dfp: r.ult_dfp || 0, ult_tri: r.ult_tri || '' }));
    l.sort((a, b) => a.tickers[0] < b.tickers[0] ? -1 : a.tickers[0] > b.tickers[0] ? 1 : 0);
    listaCache = l;
    return l;
  }
  async function porTicker(t) {
    const l = await lista();
    let e = l.find(x => x.tickers.includes(t));
    if (e) return e;
    const raiz = t.replace(/\d+$/, '');
    return raiz ? l.find(x => x.tickers.some(y => y.replace(/\d+$/, '') === raiz)) || null : null;
  }
  async function meta() {
    const m = await get('meta', { select: '*' });
    return m && m[0];
  }
  async function dados(e) {
    const id = 'eq.' + e.id;
    const contas = tab => todos(tab, { select: 'ano,cod_conta,valor,contas_nome(nome)', empresa_id: id, order: 'ano,cod_conta' });
    const [dre, bp, dfc, bases, tris, caps] = await Promise.all([contas('dre'), contas('bp'), contas('dfc'),
      get('base_ano', { select: 'ano,base', empresa_id: id }),
      todos('trimestres', { select: '*', empresa_id: id, order: 'dt_refer' }),
      get('capital', { select: 'dt_refer,qt_on,qt_pn,qt_total,tes_on,tes_pn,tes_total', empresa_id: id, order: 'dt_refer' })]);
    const d = { DRE: {}, BP: {}, DFC: {}, NomesDR: {}, NomesBP: {}, BaseAno: {}, Tri: [], Capital: {} };
    const encher = (rows, vals, nomes) => rows.forEach(r => {
      if (r.valor == null) return;
      const a = String(r.ano);
      if (!vals[a]) { vals[a] = {}; nomes[a] = {}; }
      vals[a][r.cod_conta] = Number(r.valor);
      if (r.contas_nome) nomes[a][r.cod_conta] = r.contas_nome.nome;
    });
    encher(dre, d.DRE, d.NomesDR);
    encher(bp, d.BP, d.NomesBP);
    dfc.forEach(r => {
      if (r.valor == null) return;
      const a = String(r.ano);
      (d.DFC[a] = d.DFC[a] || []).push({ Cod: r.cod_conta, Nome: r.contas_nome ? r.contas_nome.nome : '', V: Number(r.valor) });
    });
    Object.values(d.DFC).forEach(cs => cs.sort((x, y) => codCmp(x.Cod, y.Cod)));
    bases.forEach(b => { d.BaseAno[String(b.ano)] = b.base; });
    d.Tri = tris.slice().sort((a, b) => triKey(a.ano, a.tri) - triKey(b.ano, b.tri));
    caps.forEach(c => { const tot = Number(c.qt_total) || 0; if (tot > 0) d.Capital[c.dt_refer] = { Total: tot, TesTot: Number(c.tes_total) || 0 }; });
    return d;
  }
  // série mensal do ticker (Yahoo Finance, guardada no banco): fechamento ajustado só por
  // desdobramentos, fechamento ajustado por proventos, proventos e desdobramentos do mês
  async function serie(t) {
    const rows = await todos('cotacoes_mensais', { select: 'mes,data,fechamento,ajustado,dividendos,split', ticker: 'eq.' + t, order: 'mes' });
    if (!rows.length) return null;
    const splits = rows.filter(r => Number(r.split) !== 1).map(r => ({ data: r.data, fator: Number(r.split) }));
    const apos = dt => splits.reduce((x, s) => s.data > dt ? x * s.fator : x, 1);
    // volta ao preço da época (sem ajuste por desdobramentos), como a série da Alpha Vantage do app
    const pontos = rows.map(r => ({ Data: r.data, Close: Number(r.fechamento) * apos(r.data), Adj: Number(r.ajustado), Div: Number(r.dividendos) * apos(r.data) }));
    return { Pontos: pontos, Splits: splits.map(s => ({ data: s.data, fator: Math.round(s.fator * 1e6) / 1e6 })), Fonte: 'Yahoo Finance (' + t + '.SA), série mensal guardada no banco fichas-b3; última cotação de ' + rows[rows.length - 1].data.split('-').reverse().join('/') };
  }

  // ---------- utilidades ----------
  const fp = v => (v == null || !isFinite(v)) ? null : v;
  const dv = (a, b) => (a == null || b == null || b === 0) ? null : fp(a / b);
  const sub = (a, b) => (a == null || b == null) ? null : fp(a - b);
  const cresc = (a, b) => (a == null || b == null || b === 0) ? null : fp(a / Math.abs(b) - b / Math.abs(b));
  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const prof = c => c.split('.').length;
  function codCmp(a, b) {
    const pa = a.split('.'), pb = b.split('.');
    for (let i = 0; i < pa.length && i < pb.length; i++) { const x = parseInt(pa[i], 10) || 0, y = parseInt(pb[i], 10) || 0; if (x !== y) return x - y; }
    return pa.length - pb.length;
  }
  const triKey = (ano, tri) => ano * 10 + (tri ? (parseInt(tri[0], 10) || 0) : 0);
  const codsProf = (m, p) => Object.keys(m || {}).filter(c => prof(c) === p).sort(codCmp);
  const mediana = x => { if (!x.length) return 0; const y = x.slice().sort((a, b) => a - b); return y[Math.floor(y.length / 2)]; };
  const ultimos = (x, n) => x.length <= n ? x : x.slice(x.length - n);
  function classeTicker(t) {
    const n = t.replace(/^[^0-9]*/, '');
    if (['4', '5', '6', '7', '8'].includes(n)) return 'PN';
    if (n === '11') return 'UNIT';
    return 'ON';
  }
  const reEBIT = /antes do resultado financeiro/, rePreTax = /antes dos tributos/, reLucro = /(lucro|prejuizo|resultado).*(periodo|exercicio)/;
  const reCapex = /imobilizado|intangive|ativo fixo|ativos fixos|capex|investimentos? em (bens|ativos)/, reNaoCapex = /aliena|venda|recebimento|recebid|baixa/;
  const reProv = /dividendo|juros sobre (o )?capital|jcp|jscp|juros s\/ ?capital|proventos/, reNaoProv = /recebid|nao controlador|minoritari|de coligad|de controlad/;
  const reRecompra = /acoes em tesouraria|recompra|aquisicao de acoes proprias/;

  function acoesDe(r) {
    if (r.lpa == null || r.lucro_ctrl == null || Math.abs(r.lpa) < 0.005 || r.lucro_ctrl === 0) return null;
    const a = r.lucro_ctrl / r.lpa;
    return a <= 0 ? null : fp(a);
  }
  function lpaClasse(dre, nomes, classe) {
    if (!dre) return null;
    let on = null, pn = null;
    for (const c in dre) {
      if (!c.startsWith('3.99.01.')) continue;
      const n = (nomes[c] || '').trim().toUpperCase(), vv = dre[c];
      if (n.startsWith('ON') || n.includes('ORDIN')) { if (on == null || (on === 0 && vv !== 0)) on = vv; }
      else if (n.startsWith('PN') || n.includes('PREFER')) { if (pn == null || (pn === 0 && vv !== 0)) pn = vv; }
    }
    if (on == null && dre['3.99.01.01'] != null) on = fp(dre['3.99.01.01']);
    if (classe === 'PN' && pn != null && pn !== 0) return pn;
    if (on != null && on !== 0) return on;
    if (pn != null && pn !== 0) return pn;
    for (const c of ['3.99.01', '3.99']) if (dre[c] != null && dre[c] !== 0) return fp(dre[c]);
    return null;
  }
  function listaAnos(a) {
    if (!a.length) return '';
    const out = []; let ini = a[0], ant = a[0];
    const flush = () => out.push(ini === ant ? String(ini) : ini + '–' + ant);
    for (const x of a.slice(1)) { if (x === ant + 1) { ant = x; continue; } flush(); ini = ant = x; }
    flush();
    return out.join(', ');
  }
  const fmtNum = v => String(v).replace('.', ',');
  function hoje() { const d = new Date(); const p = n => String(n).padStart(2, '0'); return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }

  // ---------- a ficha (mesma conta do ficha.go) ----------
  function montarFicha(e, d, ticker, sr) {
    const fin = (e.tipo || '').toLowerCase().startsWith('financ');
    const f = { ticker, tickers: e.tickers, empresa: e.nome, nome_curto: e.nome_curto, cnpj: e.cnpj, cod_cvm: e.cod_cvm, setor: e.setor, tipo: e.tipo,
      financeira: fin, ativa: e.ativa, classe: classeTicker(ticker), ult_dfp: e.ult_dfp, ult_tri: e.ult_tri, atual: {}, contas: {}, notas: [], splits: [], cotacoes: [],
      gerado_em: hoje(), fonte: 'supabase', rotulo_receita: fin ? 'Receitas de intermediação' : 'Receita líquida', rotulo_bruto: fin ? 'Resultado bruto' : 'Lucro bruto',
      rotulo_ebit: fin ? 'Resultado antes dos tributos' : 'EBIT', pl_media: null, periodo_12m: '' };
    const anos = Object.keys(d.DRE).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);

    const pts = sr ? sr.Pontos : [];
    if (sr) { f.splits = sr.Splits; f.fonte_cotacao = sr.Fonte; }
    const fatorApos = data => f.splits.reduce((x, s) => s.data > data ? x * s.fator : x, 1);
    const precoFimAno = ano => {
      let best = null;
      for (const p of pts) if (p.Data.startsWith(ano + '-')) best = p;
      return best ? { p: best.Close / fatorApos(best.Data), dt: best.Data } : null;
    };
    // rendimento de cada provento deduzido do próprio fechamento ajustado
    const yld = new Array(pts.length).fill(0), provA = new Array(pts.length).fill(0);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (a.Close <= 0 || b.Close <= 0 || a.Adj <= 0 || b.Adj <= 0) continue;
      let k = 1;
      for (const sp of f.splits) if (sp.data === b.Data) k = sp.fator;
      let y = 1 - (a.Adj / a.Close) / (b.Adj / b.Close) * k;
      if (b.Div <= 0 && y < 0.001) continue;
      if (y < 0 || y > 0.5) { if (b.Div <= 0) continue; y = b.Div / a.Close; }
      yld[i] = y;
      provA[i] = y * a.Close / fatorApos(a.Data);
    }
    const provDataCom = ano => {
      let s = 0, y = 0, ok = false;
      pts.forEach((p, i) => { if (p.Data.startsWith(ano + '-')) { ok = true; s += provA[i]; y += yld[i]; } });
      return ok ? { s, y } : null;
    };

    let rows = [];
    for (const ano of anos) {
      const k = String(ano), dre = d.DRE[k], bp = d.BP[k];
      const nDR = d.NomesDR[k] || {}, nBP = d.NomesBP[k] || {};
      const r = { ano, rotulo: k, parcial: false, base: d.BaseAno[k] || '' };
      const g = (m, c) => (m && m[c] != null) ? fp(m[c]) : null;
      r.receita = g(dre, '3.01');
      r.lucro_bruto = g(dre, '3.03');
      r.ebit = null;
      for (const c of codsProf(dre, 2)) {
        const n = norm(nDR[c]);
        if ((!fin && reEBIT.test(n)) || (fin && rePreTax.test(n))) { r.ebit = g(dre, c); f.contas.ebit = c + ' ' + (nDR[c] || ''); break; }
      }
      if (r.ebit == null && !fin) r.ebit = g(dre, '3.05');
      let lc = '';
      if (dre && dre['3.11'] != null && reLucro.test(norm(nDR['3.11']))) lc = '3.11';
      else for (const c of codsProf(dre, 2)) { const n = norm(nDR[c]); if (reLucro.test(n) && !n.includes('antes') && !n.includes('continuadas')) lc = c; }
      r.lucro = null; r.lucro_ctrl = null;
      if (lc) {
        r.lucro = g(dre, lc); r.lucro_ctrl = r.lucro;
        for (const c in dre) {
          if (c.startsWith(lc + '.') && prof(c) === prof(lc) + 1) {
            const n = norm(nDR[c]);
            if (n.includes('controlador') && !n.includes('nao controlador')) {
              const v = g(dre, c);
              if (v != null && (v !== 0 || r.lucro == null || r.lucro === 0)) r.lucro_ctrl = v;
            }
          }
        }
        f.contas.lucro = lc + ' ' + (nDR[lc] || '');
      }
      r.lpa = lpaClasse(dre, nDR, f.classe);
      r.ativo = g(bp, '1');
      r.pl = null; r.pl_ctrl = null;
      for (const c of codsProf(bp, 2)) {
        if (c.startsWith('2.') && norm(nBP[c]).startsWith('patrimonio liquido')) {
          r.pl = g(bp, c); r.pl_ctrl = r.pl;
          let nc = null;
          for (const c2 of codsProf(bp, 3)) {
            if (!c2.startsWith(c + '.')) continue;
            const n = norm(nBP[c2]);
            if (n.includes('nao controlador') || n.includes('minoritar')) nc = g(bp, c2);
            else if (n.includes('controlador')) { r.pl_ctrl = g(bp, c2); nc = null; break; }
          }
          if (nc != null) r.pl_ctrl = sub(r.pl, nc);
          break;
        }
      }
      r.caixa = r.div_bruta = r.div_liq = null;
      if (!fin) {
        let cx = 0, db = 0, tc = false, td = false;
        for (const c of codsProf(bp, 3)) {
          const n = norm(nBP[c]);
          if (c.startsWith('1.01.') && (n.startsWith('caixa e equivalentes') || n.startsWith('aplicacoes financeiras'))) { cx += bp[c]; tc = true; }
          if ((c.startsWith('2.01.') || c.startsWith('2.02.')) && n.startsWith('emprestimos e financiamentos')) { db += bp[c]; td = true; }
        }
        if (tc) r.caixa = fp(cx);
        if (td) r.div_bruta = fp(db);
        if (tc && td) r.div_liq = fp(db - cx);
      }
      r.fco = r.capex = r.proventos = r.recompras = null;
      const cs = d.DFC[k];
      if (cs) {
        let capex = 0, prov = 0, rec = 0, tcap = false, tprov = false;
        for (const ct of cs) {
          const n = norm(ct.Nome);
          if (ct.Cod === '6.01') r.fco = fp(ct.V);
          else if (ct.Cod.startsWith('6.02.') && prof(ct.Cod) === 3) { if (reCapex.test(n) && !reNaoCapex.test(n) && ct.V < 0) { capex += -ct.V; tcap = true; } }
          else if (ct.Cod.startsWith('6.03.') && prof(ct.Cod) === 3) {
            if (reProv.test(n) && !reNaoProv.test(n)) { if (ct.V < 0) prov += -ct.V; tprov = true; }
            else if (reRecompra.test(n) && ct.V < 0) rec += -ct.V;
          }
        }
        if (tcap || !fin) r.capex = fp(capex);
        r.proventos = tprov ? fp(prov) : 0;
        r.recompras = fp(rec);
      }
      rows.push(r);
    }

    // LPA informado por lote de mil ações
    const ref = rows.map(acoesDe).filter(a => a != null);
    const med = mediana(ultimos(ref, 3));
    rows.forEach(r => {
      const a = acoesDe(r);
      if (a != null && med > 0) { const q = a / med; if (q > 300) r.lpa *= 1000; else if (q < 1 / 300) r.lpa /= 1000; }
    });
    // ações em circulação (milhões, base atual)
    const capDe = ano => {
      let best = '';
      for (const dt in d.Capital) if (dt.startsWith(ano + '-') && dt > best) best = dt;
      if (!best) return null;
      const c = d.Capital[best];
      return c.Total > 0 ? { c: c.Total - c.TesTot, dt: best } : null;
    };
    const escAno = {};
    const perto = (c, alvo) => { let best = 1, bd = Infinity; for (const e2 of [1, 1e3, 1e6]) { const dd = Math.abs(Math.log(c * e2 / 1e6 / alvo)); if (dd < bd) { best = e2; bd = dd; } } return best; };
    rows.forEach(r => { const cp = capDe(r.ano), a = acoesDe(r); if (cp && a != null) escAno[r.ano] = perto(cp.c, a); });
    for (let pass = 0; pass < 2; pass++) {
      rows.forEach((r, i) => {
        const cp = capDe(r.ano);
        if (!cp || escAno[r.ano] != null) return;
        for (let dlt = 1; dlt < rows.length && escAno[r.ano] == null; dlt++) {
          for (const j of [i - dlt, i + dlt]) {
            if (j < 0 || j >= rows.length) continue;
            const e2 = escAno[rows[j].ano];
            if (e2 != null) { const cj = capDe(rows[j].ano); escAno[r.ano] = perto(cp.c, cj.c * e2 / 1e6); break; }
          }
        }
        if (escAno[r.ano] == null && pass === 1) escAno[r.ano] = cp.c < 1e4 ? 1e6 : cp.c < 5e6 ? 1000 : 1;
      });
    }
    let fonteAcoes = '';
    rows.forEach(r => {
      const cp = capDe(r.ano);
      r.acoes_mi = null;
      if (cp) { r.acoes_mi = fp(cp.c * escAno[r.ano] / 1e6 * fatorApos(cp.dt)); fonteAcoes = 'capital'; }
      else { const a = acoesDe(r); if (a != null) { r.acoes_mi = fp(a * fatorApos((r.ano + 1) + '-03-31')); if (!fonteAcoes) fonteAcoes = 'lpa'; } }
    });
    f.contas.acoes = fonteAcoes;
    rows.forEach((r, i) => {
      if (r.acoes_mi != null) return;
      for (let dlt = 1; dlt < rows.length; dlt++) {
        if (i - dlt >= 0 && rows[i - dlt].acoes_mi != null && !rows[i - dlt].parcial) { r.acoes_mi = rows[i - dlt].acoes_mi; break; }
        if (i + dlt < rows.length && rows[i + dlt].acoes_mi != null) { r.acoes_mi = rows[i + dlt].acoes_mi; break; }
      }
    });
    let acRef = 0;
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i].acoes_mi != null) { acRef = rows[i].acoes_mi; break; }
    const anosInconsist = [];
    rows.forEach((r, i) => {
      r.margem_bruta = dv(r.lucro_bruto, r.receita); r.margem_ebit = dv(r.ebit, r.receita); r.margem_liq = dv(r.lucro, r.receita);
      r.cresc_receita = r.cresc_lucro = r.roe = r.payout = r.prov_acao = r.preco = r.p_l = r.p_vp = r.dy = r.dy_data_com = r.prov_data_com = r.valor_mercado_bi = r.div_ebitda = null;
      if (i > 0 && rows[i - 1].ano === r.ano - 1) {
        const p = rows[i - 1];
        r.cresc_receita = cresc(r.receita, p.receita); r.cresc_lucro = cresc(r.lucro_ctrl, p.lucro_ctrl);
        if (r.lucro_ctrl != null && r.pl_ctrl != null && p.pl_ctrl != null) r.roe = fp(r.lucro_ctrl / ((r.pl_ctrl + p.pl_ctrl) / 2));
      } else if (r.lucro_ctrl != null && r.pl_ctrl != null) r.roe = dv(r.lucro_ctrl, r.pl_ctrl);
      if (r.proventos != null && r.lucro_ctrl != null && r.lucro_ctrl > 0) r.payout = fp(r.proventos / r.lucro_ctrl);
      let ac = r.acoes_mi;
      if (ac != null && acRef > 0 && (ac / acRef > 2.5 || ac / acRef < 0.4)) { ac = null; anosInconsist.push(r.ano); }
      if (r.lpa == null && ac != null && r.lucro_ctrl != null && ac > 0) r.lpa = fp(r.lucro_ctrl / ac);
      if (r.proventos != null && ac != null && ac > 0) r.prov_acao = fp(r.proventos / ac);
      const pf = precoFimAno(r.ano);
      if (pf) {
        r.preco = fp(pf.p); r.preco_data = pf.dt;
        if (ac != null) {
          const vm = ac * pf.p;
          r.valor_mercado_bi = fp(vm / 1000);
          if (r.lucro_ctrl != null && r.lucro_ctrl !== 0) r.p_l = fp(vm / r.lucro_ctrl);
          if (r.pl_ctrl != null && r.pl_ctrl > 0) r.p_vp = fp(vm / r.pl_ctrl);
          if (r.proventos != null && vm > 0) r.dy = fp(r.proventos / vm);
        }
        const pd = provDataCom(r.ano);
        if (pd) { r.prov_data_com = fp(pd.s); r.dy_data_com = fp(pd.y); }
      }
    });
    const triPorAno = {};
    d.Tri.forEach(t => { if ((t.tri || '').startsWith('4T')) triPorAno[t.ano] = t; });
    rows.forEach(r => { const t = triPorAno[r.ano]; if (t && !fin) r.div_ebitda = fp(t.div_ebitda_12m); });

    // trimestres e 12 meses
    const tris = d.Tri, last = tris.length ? tris[tris.length - 1] : null;
    if (last) {
      f.periodo_12m = '12 meses até o ' + last.tri;
      const soma = get => {
        if (tris.length < 4) return null;
        let s = 0;
        for (const t of tris.slice(-4)) { const v = get(t); if (v == null) return null; s += v; }
        return fp(s);
      };
      const rec12 = last.receita_12m != null ? last.receita_12m : soma(t => t.receita);
      let lb12 = soma(t => t.lucro_bruto), eb12 = soma(t => t.ebit);
      const lu12 = last.lucro_12m != null ? last.lucro_12m : soma(t => t.lucro);
      let lc12 = soma(t => t.lucro_ctrl);
      if (lc12 == null) lc12 = lu12;
      if (fin && rows.length) { eb12 = null; lb12 = null; }
      f.atual.doze_meses = { periodo: f.periodo_12m, receita: rec12, lucro_bruto: lb12, ebit: eb12, lucro: lu12, lucro_ctrl: lc12,
        margem_bruta: dv(lb12, rec12), margem_ebit: dv(eb12, rec12), margem_liq: dv(lu12, rec12), roe: last.roe_12m,
        ebitda: last.ebitda_12m, div_liq: last.div_liq, div_ebitda: last.div_ebitda_12m, pl: last.pl, fco: last.fco_12m };
      if (triKey(last.ano, last.tri) > triKey(e.ult_dfp, '4T') && rec12 != null) {
        const r = { ano: last.ano, rotulo: last.ano + '*', parcial: true, base: '', receita: rec12, lucro_bruto: lb12, ebit: eb12, lucro: lu12, lucro_ctrl: lc12,
          pl: last.pl, pl_ctrl: last.pl, ativo: last.ativo, caixa: last.caixa, div_bruta: last.div_bruta, div_liq: last.div_liq, fco: last.fco_12m, roe: last.roe_12m,
          div_ebitda: fin ? null : last.div_ebitda_12m, margem_bruta: dv(lb12, rec12), margem_ebit: dv(eb12, rec12), margem_liq: dv(lu12, rec12),
          cresc_receita: null, cresc_lucro: null, acoes_mi: null, lpa: null, capex: null, proventos: null, recompras: null, payout: null, prov_acao: null,
          preco: null, p_l: null, p_vp: null, dy: null, dy_data_com: null, prov_data_com: null, valor_mercado_bi: null };
        if (rows.length) { const p = rows[rows.length - 1]; r.cresc_receita = cresc(rec12, p.receita); r.cresc_lucro = cresc(lc12, p.lucro_ctrl); r.acoes_mi = p.acoes_mi; }
        rows.push(r);
      }
    }
    // cotação atual, P/L 12m, DY 12m
    if (pts.length) {
      const lp = pts[pts.length - 1];
      f.atual.cotacao = lp.Close; f.atual.cotacao_data = lp.Data;
      const lim = new Date(lp.Data + 'T00:00:00Z'); lim.setUTCFullYear(lim.getUTCFullYear() - 1);
      let s12 = 0, y12 = 0;
      pts.forEach((p, i) => { if (new Date(p.Data + 'T00:00:00Z') > lim) { s12 += provA[i]; y12 += yld[i]; } });
      f.atual.proventos_12m_acao = s12; f.atual.dy_12m = y12;
      if (pts.length > 12) {
        const p0 = pts[pts.length - 13];
        const fe = f.splits.reduce((x, s) => (s.data > p0.Data && s.data <= lp.Data) ? x * s.fator : x, 1);
        f.atual.var_12m = lp.Close / (p0.Close / fe) - 1;
      }
      let acoesHoje = null, lucro12 = f.atual.doze_meses ? f.atual.doze_meses.lucro_ctrl : null;
      let ultCap = '';
      for (const dt in d.Capital) if (dt > ultCap) ultCap = dt;
      if (ultCap) {
        const c = d.Capital[ultCap], v = c.Total - c.TesTot;
        let e2 = 1;
        for (let i = rows.length - 1; i >= 0; i--) if (!rows[i].parcial && rows[i].acoes_mi != null) { e2 = perto(v, rows[i].acoes_mi / fatorApos(ultCap)); break; }
        acoesHoje = fp(v * e2 / 1e6 * fatorApos(ultCap));
        f.atual.acoes_data = ultCap;
      }
      for (let i = rows.length - 1; i >= 0; i--) {
        if (!rows[i].parcial && rows[i].acoes_mi != null) { if (acoesHoje == null) acoesHoje = rows[i].acoes_mi; if (lucro12 == null) lucro12 = rows[i].lucro_ctrl; break; }
      }
      if (acoesHoje != null) {
        const vm = acoesHoje * lp.Close;
        f.atual.acoes_mi = acoesHoje; f.atual.valor_mercado_bi = vm / 1000;
        if (lucro12 != null && lucro12 !== 0) { f.atual.p_l = vm / lucro12; f.atual.lpa_12m = lucro12 / acoesHoje; }
        if (last && last.pl != null && last.pl > 0) f.atual.p_vp = vm / last.pl;
        const n = rows.length;
        if (n && rows[n - 1].parcial) {
          const r = rows[n - 1];
          r.preco = fp(lp.Close); r.preco_data = lp.Data; r.valor_mercado_bi = fp(vm / 1000); r.acoes_mi = acoesHoje;
          if (lucro12 != null && lucro12 !== 0) { r.p_l = fp(vm / lucro12); r.lpa = fp(lucro12 / acoesHoje); }
          if (r.pl != null && r.pl > 0) r.p_vp = fp(vm / r.pl);
          r.dy_data_com = fp(y12); r.prov_data_com = fp(s12);
        }
      }
      f.cotacoes = pts.map((p, i) => ({ mes: p.Data.slice(0, 7), data: p.Data, fechamento: p.Close / fatorApos(p.Data), ajustado: p.Adj, provento: provA[i] }));
    } else {
      f.aviso_cotacao = 'Sem cotações deste ticker no banco: P/L, valor de mercado e dividend yield ficam em branco.';
    }
    // P/L médio dos anos fechados com lucro
    const vals = rows.filter(r => !r.parcial && r.p_l != null && r.p_l > 0 && r.p_l < 100).map(r => r.p_l);
    const md = mediana(vals);
    const ok = vals.filter(v => v <= md * 3 && v >= md / 3);
    if (ok.length) f.pl_media = ok.reduce((a, b) => a + b, 0) / ok.length;
    f.anual = rows;

    // últimos 12 trimestres
    const idx = {};
    tris.forEach(t => { idx[triKey(t.ano, t.tri)] = t; });
    f.trimestres = tris.slice(Math.max(0, tris.length - 12)).map(t => {
      const o = Object.assign({}, t), p = idx[triKey(t.ano - 1, t.tri)];
      o.var_receita = p ? cresc(t.receita, p.receita) : null;
      o.var_lucro = p ? cresc(t.lucro_ctrl, p.lucro_ctrl) : null;
      return o;
    });

    // notas
    const bases = {};
    rows.forEach(r => { if (r.base) bases[r.base] = (bases[r.base] || 0) + 1; });
    if (bases.individual && bases.consolidado) f.notas.push('Alguns anos só têm demonstrações individuais (sem consolidado) e foram usados assim.');
    else if (bases.individual) f.notas.push('A companhia publica só demonstrações individuais; os números são da controladora.');
    f.splits.forEach(sp => {
      const tipo = sp.fator < 1 ? 'grupamento' : sp.fator < 1.9 ? 'bonificação' : 'desdobramento';
      f.notas.push(tipo[0].toUpperCase() + tipo.slice(1) + ' em ' + sp.data.slice(5, 7) + '/' + sp.data.slice(0, 4) + ' (fator ' + fmtNum(sp.fator) + '): preços e valores por ação anteriores foram ajustados para a base atual.');
    });
    if (anosInconsist.length) f.notas.push('Em ' + listaAnos(anosInconsist) + ' o número de ações implícito no lucro por ação é muito diferente do atual (reorganização societária, incorporação ou outra companhia listada); P/L, valor de mercado, P/VP e yield desses anos foram omitidos.');
    if (fin) f.notas.push('Instituição financeira: receita = receitas de intermediação financeira; margem bruta = resultado bruto da intermediação ÷ receita; não há EBITDA nem dívida líquida.');
    return f;
  }

  async function ficha(t) {
    const e = await porTicker(t);
    if (!e) throw new Error('ticker não encontrado no banco: ' + t);
    const [d, sr] = await Promise.all([dados(e), serie(t).catch(() => null)]);
    return montarFicha(e, d, t, sr);
  }

  window.Fichas = { lista, meta, ficha, montarFicha, dados, serie, porTicker };
})();
