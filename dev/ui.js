/* MAGNATE — Capa de UI. Solo LEE state del engine y LLAMA applyAction.
   No contiene lógica económica. window.MAGNATE es el engine inline. */
(function () {
  'use strict';
  var E = window.MAGNATE;
  var S = null, speed = 0, timer = null, active = 'dash', coView = null, toastT = null, victoryShown = false;
  var SAVE_KEY = 'magnate_save_v1';

  // ----------------------------------------------------------------- utilidades
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function fmtUSD(n) {
    if (!isFinite(n)) n = 0;
    var neg = n < 0; n = Math.abs(n); var s;
    if (n >= 1e12) s = (n / 1e12).toFixed(2) + ' B';
    else if (n >= 1e9) s = (n / 1e9).toFixed(2) + ' mil M';
    else if (n >= 1e6) s = (n / 1e6).toFixed(2) + ' M';
    else if (n >= 1e3) s = (n / 1e3).toFixed(1) + ' K';
    else s = n.toFixed(0);
    return (neg ? '−' : '') + '$' + s;
  }
  function fmtFull(n) { return '$' + Math.round(n).toLocaleString('en'); }
  function fmtNum(n) { return Math.round(n).toLocaleString('en'); }
  function pct(x) { return (x * 100).toFixed(1) + '%'; }
  function gameDate() { var t = S.tick; return 'Año ' + (1 + Math.floor(t / 52)) + ' · Sem ' + (1 + (t % 52)); }
  function toast(msg) {
    var t = el('toast'); t.textContent = msg; t.className = 'toast show';
    clearTimeout(toastT); toastT = setTimeout(function () { t.className = 'toast'; }, 2600);
  }
  function scoreColor(s) { return s >= 720 ? 'good' : s >= 620 ? 'warn' : 'bad'; }
  function num(id, def) { var v = parseFloat((el(id) || {}).value); return isFinite(v) ? v : (def || 0); }

  // --------------------------------------------------------------- ciclo de vida
  function newGame(seed, startCash) {
    S = E.createInitialState({ seed: seed >>> 0, startCash: startCash });
    active = 'dash'; coView = null; speed = 0; victoryShown = false;
    save(); show('game'); render();
  }
  function save() { try { localStorage.setItem(SAVE_KEY, E.serialize(S)); } catch (e) {} }
  function load() { try { var d = localStorage.getItem(SAVE_KEY); if (d) { S = E.deserialize(d); return true; } } catch (e) {} return false; }
  function resetGame() { if (confirm('¿Reiniciar la partida? Se borra el progreso guardado.')) { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} location.reload(); } }

  function show(screen) {
    el('onboard').style.display = screen === 'onboard' ? 'flex' : 'none';
    el('game').style.display = screen === 'game' ? 'block' : 'none';
  }

  // ----------------------------------------------------------------------- tiempo
  function setSpeed(sp) {
    speed = sp;
    if (timer) { clearInterval(timer); timer = null; }
    if (sp > 0 && S && !S.gameOver && !S.event.active) timer = setInterval(stepTick, sp === 10 ? 200 : 1500);
    renderHeader();
  }
  function stepTick() {
    if (!S || S.gameOver || S.event.active) { setSpeed(0); return; }
    E.tick(S);
    if (S.tick % 8 === 0) save();
    if (S.event.active) { setSpeed(0); render(); openEvent(); return; }
    if (S.gameOver) { setSpeed(0); render(); openGameOver(); return; }
    if (S.won && !victoryShown) { victoryShown = true; setSpeed(0); render(); openVictory(); return; }
    render();
  }

  function act(a) {
    var r = E.applyAction(S, a);
    if (!r || !r.ok) { toast((r && r.reason) || 'Acción inválida'); }
    else { save(); render(); }
    return r;
  }

  // ----------------------------------------------------------------------- render
  function render() { if (!S) return; renderHeader(); renderView(); renderNav(); }

  function renderHeader() {
    if (!S) return;
    var m = S.macro;
    var phase = m.cyclePhase > 0.25 ? 'AUGE' : m.cyclePhase < -0.25 ? 'RECESIÓN' : 'NEUTRAL';
    var pc = m.cyclePhase > 0.25 ? 'good' : m.cyclePhase < -0.25 ? 'bad' : 'warn';
    var stg = E.STAGES[S.stage];
    el('hDate').textContent = gameDate();
    el('hStage').textContent = stg.name.toUpperCase();
    el('hPhase').textContent = phase; el('hPhase').className = 'chip ' + pc;
    el('hInfl').textContent = (m.annualInflation * 100).toFixed(1) + '%';
    el('hRate').textContent = (m.interestRate * 100).toFixed(1) + '%';
    el('hIdx').textContent = fmtNum(m.stockIndex);
    var btns = document.querySelectorAll('#speed .sbtn');
    for (var i = 0; i < btns.length; i++) {
      var sp = parseInt(btns[i].getAttribute('data-sp'), 10);
      btns[i].className = 'sbtn' + (sp === speed ? ' on' : '');
    }
  }

  function renderNav() {
    var tabs = el('nav').children;
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i].getAttribute('data-tab');
      tabs[i].className = 'navit' + (t === active ? ' on' : '');
    }
  }

  function go(tab) { active = tab; coView = null; window.scrollTo(0, 0); render(); }

  function renderView() {
    var v = el('view'); var html = '';
    if (active === 'dash') html = viewDash();
    else if (active === 'empresas') html = coView ? viewCompany(coView) : viewEmpresas();
    else if (active === 'mercado') html = viewMercado();
    else if (active === 'finanzas') html = viewFinanzas();
    else if (active === 'inversiones') html = viewInversiones();
    else if (active === 'id') html = viewID();
    v.innerHTML = html;
    if (active === 'dash') drawChart();
  }

  // ------------------------------------------------------------------- DASHBOARD
  function viewDash() {
    var p = S.player, m = S.macro;
    var stg = E.STAGES[S.stage], next = E.STAGES[S.stage + 1];
    var prog = '';
    if (next) {
      var lo = stg.min === -Infinity ? 0 : stg.min, hi = next.min;
      var fr = lo === 0 ? Math.max(0, p.netWorth) / hi : (p.netWorth - lo) / (hi - lo);
      fr = Math.max(0, Math.min(1, fr));
      prog = '<div class="bar"><div style="width:' + (fr * 100).toFixed(1) + '%"></div></div>' +
        '<div class="row sm muted"><span>' + esc(stg.name) + '</span><span>→ ' + esc(next.name) + ' (' + fmtUSD(hi) + ')</span></div>';
    } else prog = '<div class="good ctr">★ TRILLONARIO — objetivo alcanzado ★</div>';

    var alerts = '';
    if (p.insolventStreak > 0) alerts += alert('bad', '⚠ INSOLVENCIA (' + p.insolventStreak + '/6 semanas). Vendé activos, refinanciá o recortá costos o caés en bancarrota.');
    var unpaid = p.loans.filter(function (l) { return l.missed > 0; });
    if (unpaid.length) alerts += alert('warn', '● ' + unpaid.length + ' préstamo(s) con cuota impaga. El interés se capitaliza y tu score baja.');
    if (S.event.active) alerts += alert('warn', '● Hay un evento pendiente de decisión. <b>Tocá para resolver.</b>', 'MG.openEvent()');
    if (S.won) alerts += alert('good', '🏆 ¡Ganaste! Modo libre activo.');

    var sc = scoreColor(p.creditScore);
    var html = '';
    html += '<div class="card hero">' +
      '<div class="muted sm">PATRIMONIO NETO</div>' +
      '<div class="big ' + (p.netWorth >= 0 ? '' : 'bad') + '">' + fmtUSD(p.netWorth) + '</div>' +
      '<div class="row">' +
        '<div><div class="muted sm">Efectivo</div><div class="' + (p.cash >= 0 ? 'amber' : 'bad') + '">' + fmtUSD(p.cash) + '</div></div>' +
        '<div><div class="muted sm">Score</div><div class="' + sc + '">' + p.creditScore + '</div></div>' +
        '<div><div class="muted sm">Empresas</div><div>' + S.companies.length + '</div></div>' +
      '</div>' + prog + '</div>';

    html += alerts;

    html += '<div class="card"><div class="ttl">Indicadores macro</div><div class="grid2">' +
      kv('Ciclo', m.cyclePhase > 0.25 ? 'Auge' : m.cyclePhase < -0.25 ? 'Recesión' : 'Neutral') +
      kv('Inflación anual', (m.annualInflation * 100).toFixed(1) + '%') +
      kv('Tasa de interés', (m.interestRate * 100).toFixed(1) + '%') +
      kv('Índice bursátil', fmtNum(m.stockIndex)) +
      kv('Índice inmob.', m.reIndex.toFixed(2)) +
      kv('Combustible', m.fuelIndex.toFixed(2)) +
    '</div></div>';

    html += '<div class="card"><div class="ttl">Evolución del patrimonio</div><canvas id="chart" width="480" height="140"></canvas><div class="row sm muted"><span class="amber">— patrimonio</span><span class="good">— efectivo</span></div></div>';

    html += '<div class="card"><div class="ttl">Actividad reciente</div>' + logHtml(10) + '</div>';
    return html;
  }
  function alert(kind, msg, onclick) { return '<div class="alert ' + kind + '"' + (onclick ? ' onclick="' + onclick + '" style="cursor:pointer"' : '') + '>' + msg + '</div>'; }
  function kv(k, v) { return '<div class="kv"><span class="muted">' + k + '</span><span>' + v + '</span></div>'; }
  function logHtml(n) {
    var L = S.log.slice(0, n);
    if (!L.length) return '<div class="muted sm">Sin actividad.</div>';
    return L.map(function (e) {
      var c = e.kind === 'good' ? 'good' : e.kind === 'warn' ? 'warn' : e.kind === 'danger' ? 'bad' : 'muted';
      return '<div class="logl"><span class="' + c + '">●</span> <span class="sm">' + esc(e.msg) + '</span></div>';
    }).join('');
  }
  function drawChart() {
    var c = el('chart'); if (!c || !c.getContext) return;
    var ctx = c.getContext('2d'); var W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    var hist = S.history; if (hist.length < 2) return;
    var data = hist.slice(-160);
    var nws = data.map(function (d) { return d.netWorth; });
    var csh = data.map(function (d) { return d.cash; });
    var all = nws.concat(csh);
    var mn = Math.min.apply(null, all), mx = Math.max.apply(null, all);
    if (mx === mn) mx = mn + 1;
    function plot(arr, color) {
      ctx.beginPath(); ctx.lineWidth = 1.6; ctx.strokeStyle = color;
      for (var i = 0; i < arr.length; i++) {
        var x = i / (arr.length - 1) * (W - 4) + 2;
        var y = H - 4 - (arr[i] - mn) / (mx - mn) * (H - 8);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    if (mn < 0 && mx > 0) { var zy = H - 4 - (0 - mn) / (mx - mn) * (H - 8); ctx.strokeStyle = '#3a2f22'; ctx.beginPath(); ctx.moveTo(0, zy); ctx.lineTo(W, zy); ctx.stroke(); }
    plot(csh, '#22c55e'); plot(nws, '#f59e0b');
  }

  // -------------------------------------------------------------------- EMPRESAS
  function viewEmpresas() {
    var html = '<div class="card"><button class="btn pri" onclick="MG.openCreate()">+ Crear nueva empresa</button></div>';
    if (!S.companies.length) { html += '<div class="card muted ctr">Todavía no tenés empresas. Crear la primera es el inicio del camino. El producto más barato para arrancar es el pan.</div>'; return html; }
    html += S.companies.map(function (co) {
      var p = S.products[co.productId];
      var cc = co.cashContribution >= 0 ? 'good' : 'bad';
      return '<div class="card co" onclick="MG.openCo(\'' + co.id + '\')">' +
        '<div class="row"><b>' + esc(co.name) + '</b><span class="chip">' + esc(p.name) + (co.public ? ' · 📈' : '') + '</span></div>' +
        '<div class="grid3 sm">' +
          mini('Resultado/sem', '<span class="' + cc + '">' + fmtUSD(co.cashContribution) + '</span>') +
          mini('Cuota mercado', pct(co.marketShare)) +
          mini('Valor', fmtUSD(E.companyValue(S, co))) +
        '</div></div>';
    }).join('');
    return html;
  }
  function mini(k, v) { return '<div class="mini"><div class="muted">' + k + '</div><div>' + v + '</div></div>'; }

  function viewCompany(id) {
    var co = S.companies.find(function (c) { return c.id === id; });
    if (!co) { coView = null; return viewEmpresas(); }
    var p = S.products[co.productId];
    var unit = co.lastUnitCost || p.baseVarCost * 1.5;
    var margin = co.price > 0 ? (co.price - unit) / co.price : 0;
    var cap = co.factories.reduce(function (s, f) { return s + f.capacity; }, 0);
    var e = co.employees;
    var belowCost = co.price < unit;
    var h = '';
    h += '<div class="card"><button class="btn ghost" onclick="MG.backCo()">‹ Empresas</button>' +
      '<div class="ttl">' + esc(co.name) + ' <span class="chip">' + esc(p.name) + '</span></div>' +
      '<div class="grid3 sm">' + mini('Resultado/sem', '<span class="' + (co.cashContribution >= 0 ? 'good' : 'bad') + '">' + fmtUSD(co.cashContribution) + '</span>') +
        mini('Share', pct(co.marketShare)) + mini('Vendido/sem', fmtNum(co.lastUnitsSold)) + '</div>' +
      '<div class="grid3 sm">' + mini('Inventario', fmtNum(co.inventory)) + mini('Costo unit.', fmtFull(unit)) + mini('Valor', fmtUSD(E.companyValue(S, co))) + '</div></div>';

    // precio (con previsualización en vivo del efecto esperado)
    h += '<div class="card"><div class="ttl">Precio</div>' +
      '<div class="row"><input type="number" id="i_price" value="' + co.price.toFixed(2) + '" step="0.01" oninput="MG.pricePrev(\'' + co.id + '\')"><button class="btn" onclick="MG.setPrice(\'' + co.id + '\')">Fijar</button></div>' +
      '<div class="sm ' + (belowCost ? 'bad' : 'muted') + '">Costo unitario ' + fmtFull(unit) + ' · margen ' + pct(margin) + (belowCost ? ' · ⚠ VENDÉS A PÉRDIDA' : '') + ' · ref. mercado ' + fmtFull(S.markets[co.productId].referencePrice) + '</div>' +
      '<div class="sm amber" id="pricePrev">' + pricePrevHtml(E.previewPrice(S, co.id, co.price)) + '</div></div>';

    // producción
    h += '<div class="card"><div class="ttl">Producción</div>' +
      '<div class="row"><input type="number" id="i_prod" value="' + Math.round(co.productionTarget) + '"><button class="btn" onclick="MG.setProd(\'' + co.id + '\')">Fijar objetivo</button></div>' +
      '<div class="sm muted">Capacidad instalada ' + fmtNum(cap) + ' u/sem (limitada por dotación, skill y moral).</div>' +
      '<button class="btn ghost" onclick="MG.build(\'' + co.id + '\')">+ Construir fábrica (' + fmtUSD(facCost(p, co.region)) + ')</button></div>';

    // calidad
    h += '<div class="card"><div class="ttl">Calidad</div>' +
      '<div class="bar"><div style="width:' + (co.qualityLevel / co.qualityCeiling * 100).toFixed(0) + '%"></div></div>' +
      '<div class="row sm"><span class="muted">Nivel ' + co.qualityLevel.toFixed(1) + ' / techo ' + co.qualityCeiling + '</span>' +
      '<button class="btn ghost" onclick="MG.qual(\'' + co.id + '\')">Mejorar calidad</button></div></div>';

    // marketing & I+D
    h += '<div class="card"><div class="ttl">Marketing & I+D (presupuesto semanal)</div>' +
      '<div class="row"><span class="lbl">Marketing</span><input type="number" id="i_mkt" value="' + Math.round(co.marketingBudget) + '"><button class="btn" onclick="MG.mkt(\'' + co.id + '\')">OK</button></div>' +
      '<div class="row"><span class="lbl">I+D</span><input type="number" id="i_rnd" value="' + Math.round(co.rndBudget) + '"><button class="btn" onclick="MG.rnd(\'' + co.id + '\')">OK</button></div>' +
      '<div class="sm muted">Marca: ' + pct(co.brandStrength) + ' · rendimientos decrecientes (duplicar gasto no duplica efecto).</div></div>';

    // RRHH
    var moraleC = e.morale >= 0.6 ? 'good' : e.morale >= 0.4 ? 'warn' : 'bad';
    h += '<div class="card"><div class="ttl">Recursos humanos</div>' +
      '<div class="grid3 sm">' + mini('Empleados', fmtNum(e.count)) + mini('Skill', pct(e.avgSkill)) + mini('Moral', '<span class="' + moraleC + '">' + pct(e.morale) + '</span>') + '</div>' +
      '<div class="row"><span class="lbl">Salario/sem</span><input type="number" id="i_wage" value="' + Math.round(e.avgWage) + '"><button class="btn" onclick="MG.wage(\'' + co.id + '\')">OK</button></div>' +
      '<div class="row3">' +
        '<button class="btn ghost" onclick="MG.hire(\'' + co.id + '\',5)">+5 contratar</button>' +
        '<button class="btn ghost" onclick="MG.fire(\'' + co.id + '\',5)">−5 despedir</button>' +
        '<button class="btn ghost" onclick="MG.train(\'' + co.id + '\')">Capacitar</button>' +
      '</div></div>';

    // integración + corporativo
    h += '<div class="card"><div class="ttl">Estrategia corporativa</div>' +
      '<label class="chk"><input type="checkbox" ' + (co.vertical ? 'checked' : '') + ' onclick="MG.vert(\'' + co.id + '\',this.checked)"> Integración vertical (produce insumos −30% costo)</label>' +
      (co.public ? '<div class="sm good">Cotiza en bolsa (' + co.ticker + '), float ' + pct(co.floatPct) + '</div>'
        : '<button class="btn ghost" onclick="MG.ipo(\'' + co.id + '\')">Salir a bolsa (IPO)</button>') +
      '<button class="btn danger ghost" onclick="MG.sellco(\'' + co.id + '\')">Vender empresa</button></div>';
    return h;
  }
  function regLand(rid) { var r = S.regions.find(function (x) { return x.id === rid; }); return r ? r.landPrice : 1; }
  function pricePrevHtml(pv) {
    if (!pv) return '';
    return '↳ estimado: ~' + fmtNum(pv.sellable) + ' u/sem · share ~' + pct(pv.share) + ' · resultado bruto ~<span class="' + (pv.profitEst >= 0 ? 'good' : 'bad') + '">' + fmtUSD(pv.profitEst) + '/sem</span>';
  }
  function facCap(p) { return Math.max(10, p.baseDemand * 0.1); }
  function facCost(p, rid) { var r = S.regions.find(function (x) { return x.id === rid; }); return Math.max(4000, facCap(p) * p.refPrice * 0.2 * (r ? r.landPrice : 1)); }

  // --------------------------------------------------------------------- MERCADO
  function viewMercado() {
    var h = '<div class="card"><div class="ttl">Mercados por producto</div><div class="sm muted">Tu cuota vs competidores. El éxito atrae nuevos entrantes.</div></div>';
    var prods = {};
    S.companies.forEach(function (co) { prods[co.productId] = true; });
    S.competitors.forEach(function (c) { if (!c.dead) prods[c.productId] = prods[c.productId] || false; });
    // mostrar primero donde compite el jugador
    var ids = Object.keys(prods).sort(function (a, b) { return (prods[b] ? 1 : 0) - (prods[a] ? 1 : 0); });
    ids.forEach(function (pid) {
      var p = S.products[pid], mk = S.markets[pid];
      var sellers = [];
      S.companies.forEach(function (co) { if (co.productId === pid) sellers.push({ name: co.name + ' (vos)', price: co.price, share: co.marketShare, you: true }); });
      S.competitors.forEach(function (c) { if (c.productId === pid && !c.dead) sellers.push({ name: c.name, price: c.price, share: c.marketShare, you: false }); });
      sellers.sort(function (a, b) { return b.share - a.share; });
      h += '<div class="card"><div class="row"><b>' + esc(p.name) + '</b><span class="chip">ref ' + fmtFull(mk.referencePrice) + '</span></div>' +
        sellers.slice(0, 6).map(function (s) {
          return '<div class="srow"><span class="' + (s.you ? 'amber' : '') + '">' + esc(s.name) + '</span>' +
            '<span class="sm muted">' + fmtFull(s.price) + '</span><span class="bar mini-bar"><div style="width:' + (s.share * 100).toFixed(0) + '%"></div></span><span class="sm">' + pct(s.share) + '</span></div>';
        }).join('') + '</div>';
    });
    // M&A
    h += '<div class="card"><div class="ttl">Adquisiciones (M&A)</div><div class="sm muted">Comprá competidores: valor + prima de control ' + pct(E.C.CONTROL_PREMIUM) + '.</div></div>';
    var comps = S.competitors.filter(function (c) { return !c.dead; }).map(function (c) { return { c: c, v: E.competitorValue(S, c) }; }).sort(function (a, b) { return a.v - b.v; });
    h += comps.slice(0, 14).map(function (x) {
      var cost = x.v * (1 + E.C.CONTROL_PREMIUM);
      var can = S.player.cash >= cost;
      return '<div class="card co"><div class="row"><b>' + esc(x.c.name) + '</b><span class="chip">' + esc(S.products[x.c.productId].name) + '</span></div>' +
        '<div class="grid3 sm">' + mini('Valor', fmtUSD(x.v)) + mini('Perfil', x.c.profile) + mini('Share', pct(x.c.marketShare)) + '</div>' +
        '<button class="btn ' + (can ? 'pri' : 'ghost') + '" onclick="MG.acquire(\'' + x.c.id + '\')">Adquirir por ' + fmtUSD(cost) + '</button></div>';
    }).join('');
    return h;
  }

  // -------------------------------------------------------------------- FINANZAS
  function viewFinanzas() {
    var p = S.player;
    var lim = E.creditLimit(S), used = E.totalDebt(S);
    var h = '';
    h += '<div class="card"><div class="ttl">Crédito</div>' +
      '<div class="grid2 sm">' + kv('Score', '<span class="' + scoreColor(p.creditScore) + '">' + p.creditScore + ' / 850</span>') +
      kv('Límite', fmtUSD(lim)) + kv('Usado', fmtUSD(used)) + kv('Disponible', fmtUSD(Math.max(0, lim - used))) + '</div>' +
      '<div class="ttl sm" style="margin-top:8px">Factores del score</div>' +
      factorBar('Historial de pagos (35%)', p.scoreFactors.payment) +
      factorBar('Utilización (30%)', p.scoreFactors.util) +
      factorBar('Antigüedad (15%)', p.scoreFactors.age) +
      factorBar('Mix de crédito (10%)', p.scoreFactors.mix) +
      factorBar('Consultas recientes (10%)', p.scoreFactors.inquiries) + '</div>';

    h += '<div class="card"><div class="ttl">Seguro corporativo</div>' +
      '<div class="sm muted">Prima semanal que reduce un 60% el golpe de averías, desastres, juicios y ciberataques. Pagás siempre, te proteja o no.</div>' +
      '<div class="row"><span class="' + (p.insured ? 'good' : 'muted') + '">' + (p.insured ? '● Contratado — ' + fmtUSD(E.insuranceCostFor(S)) + '/sem' : '○ Sin seguro') + '</span>' +
      '<button class="btn ' + (p.insured ? 'ghost' : 'pri') + '" style="width:auto" onclick="MG.insurance(' + (!p.insured) + ')">' + (p.insured ? 'Cancelar' : 'Contratar (' + fmtUSD(E.insuranceCostFor(S)) + '/sem)') + '</button></div></div>';

    h += '<div class="card"><div class="ttl">Tomar préstamo</div>' +
      '<div class="row"><span class="lbl">Monto</span><input type="number" id="i_loan" value="50000"></div>' +
      '<div class="row"><span class="lbl">Tipo</span><select id="i_ltype">' +
        '<option value="business">Empresarial</option><option value="personal">Personal</option><option value="lineOfCredit">Línea de crédito</option>' +
      '</select></div>' +
      '<div class="row"><span class="lbl">Plazo</span><select id="i_lterm"><option value="52">1 año</option><option value="104" selected>2 años</option><option value="260">5 años</option></select></div>' +
      '<div class="sm muted">Tasa estimada según tu score: ' + (E.loanRateFor(S, 'business') * 100).toFixed(1) + '% anual (empresarial).</div>' +
      '<button class="btn pri" onclick="MG.takeLoan()">Solicitar</button></div>';

    h += '<div class="card"><div class="ttl">Préstamos activos</div>';
    if (!p.loans.length) h += '<div class="muted sm">Sin deudas. ¡Bien!</div>';
    else h += p.loans.map(function (l) {
      var name = ({ student: 'Deuda estudiantil', business: 'Empresarial', personal: 'Personal', mortgage: 'Hipoteca', lineOfCredit: 'Línea de crédito' })[l.type] || l.type;
      return '<div class="lrow"><div class="row"><b>' + name + '</b><span class="' + (l.missed ? 'bad' : 'muted') + ' sm">' + (l.missed ? l.missed + ' atrasos' : 'al día') + '</span></div>' +
        '<div class="grid3 sm">' + mini('Saldo', fmtUSD(l.balance)) + mini('Tasa', (l.annualRate * 100).toFixed(1) + '%') + mini('Cuota/sem', fmtFull(l.paymentPerTick)) + '</div>' +
        '<div class="row3"><button class="btn ghost" onclick="MG.payLoan(\'' + l.id + '\',5000)">Pagar +$5K</button>' +
        '<button class="btn ghost" onclick="MG.payLoan(\'' + l.id + '\',' + Math.ceil(l.balance) + ')">Saldar</button>' +
        '<button class="btn ghost" onclick="MG.refi(\'' + l.id + '\')">Refinanciar</button></div></div>';
    }).join('');
    h += '</div>';
    return h;
  }
  function factorBar(lbl, v) { return '<div class="fb"><div class="row sm"><span class="muted">' + lbl + '</span><span>' + pct(v) + '</span></div><div class="bar"><div style="width:' + (v * 100).toFixed(0) + '%"></div></div></div>'; }

  // ----------------------------------------------------------------- INVERSIONES
  function viewInversiones() {
    var p = S.player;
    var h = '<div class="card"><div class="ttl">Bolsa de valores</div><div class="sm muted">El precio sigue a los fundamentales. Comprar/vender grande mueve el precio (slippage).</div></div>';
    var stocks = E.listStocks(S).sort(function (a, b) { return (p.stocks[b.ticker] || 0) - (p.stocks[a.ticker] || 0) || b.price - a.price; });
    h += stocks.slice(0, 16).map(function (s) {
      var owned = p.stocks[s.ticker] || 0;
      var yld = s.dividendPerShareYear / Math.max(s.price, 0.01);
      var fund = s.eps * s.peMult + s.book * 0.6;
      var val = s.price < fund * 0.97 ? 'good' : s.price > fund * 1.03 ? 'bad' : 'muted';
      return '<div class="card co"><div class="row"><b>' + esc(s.ticker) + '</b><span class="chip">' + esc(S.products[s.productId].name) + '</span></div>' +
        '<div class="grid3 sm">' + mini('Precio', fmtFull(s.price)) + mini('Yield div.', pct(yld)) + mini('Tenés', fmtNum(owned)) + '</div>' +
        '<div class="sm ' + val + '">Valor fundamental ≈ ' + fmtFull(fund) + (s.price < fund * 0.97 ? ' · barata' : s.price > fund * 1.03 ? ' · cara' : ' · en precio') + '</div>' +
        '<div class="row"><input type="number" id="sh_' + s.ticker + '" placeholder="acciones" value="100">' +
        '<button class="btn pri" onclick="MG.buyStock(\'' + s.ticker + '\')">Comprar</button>' +
        '<button class="btn ghost" onclick="MG.sellStock(\'' + s.ticker + '\')">Vender</button></div></div>';
    }).join('');

    h += '<div class="card"><div class="ttl">Bienes raíces</div>' +
      '<div class="row"><span class="lbl">Región</span><select id="i_rereg">' + S.regions.map(function (r) { return '<option value="' + r.id + '">' + esc(r.name) + ' (tierra ' + r.landPrice.toFixed(2) + ')</option>'; }).join('') + '</select></div>' +
      '<div class="row"><span class="lbl">Tipo</span><select id="i_retype"><option value="residential">Residencial</option><option value="commercial">Comercial</option><option value="industrial">Industrial</option><option value="land">Terreno</option></select></div>' +
      '<label class="chk"><input type="checkbox" id="i_remort" checked> Financiar con hipoteca (25% de anticipo)</label>' +
      '<button class="btn pri" onclick="MG.buyProp()">Comprar propiedad</button></div>';

    if (S.realEstate.length) h += '<div class="card"><div class="ttl">Tus propiedades</div>' + S.realEstate.map(function (pr) {
      var r = S.regions.find(function (x) { return x.id === pr.region; });
      return '<div class="lrow"><div class="row"><b>' + esc(({ residential: 'Residencial', commercial: 'Comercial', industrial: 'Industrial', land: 'Terreno' })[pr.type]) + '</b><span class="chip">' + esc(r.name) + '</span></div>' +
        '<div class="grid3 sm">' + mini('Valor', fmtUSD(pr.currentValue)) + mini('Renta/sem', fmtFull(pr.rentPerTick * pr.occupancy)) + mini('Ocupación', pct(pr.occupancy)) + '</div>' +
        '<div class="row3"><button class="btn ghost" onclick="MG.devProp(\'' + pr.id + '\')">Desarrollar (' + pr.developmentLevel + '/3)</button>' +
        '<button class="btn ghost" onclick="MG.sellProp(\'' + pr.id + '\')">Vender</button></div></div>';
    }).join('') + '</div>';
    return h;
  }

  // --------------------------------------------------------------------------- I+D
  function viewID() {
    var t = S.tech;
    var h = '<div class="card"><div class="ttl">Investigación y Desarrollo</div>';
    if (t.project) {
      var node = S.techTree.find(function (n) { return n.id === t.project; });
      var fr = Math.min(1, t.points / node.cost);
      h += '<div class="sm">Proyecto en curso: <b>' + esc(node.name) + '</b></div><div class="bar"><div style="width:' + (fr * 100).toFixed(0) + '%"></div></div>' +
        '<div class="sm muted">' + fmtNum(t.points) + ' / ' + fmtNum(node.cost) + ' puntos. Asigná presupuesto de I+D en tus empresas para avanzar.</div>';
    } else h += '<div class="sm muted">Sin proyecto activo. Elegí un nodo disponible abajo.</div>';
    var totalRnd = S.companies.reduce(function (s, c) { return s + c.rndBudget; }, 0);
    h += '<div class="sm ' + (totalRnd > 0 ? 'good' : 'warn') + '">Presupuesto I+D total: ' + fmtUSD(totalRnd) + '/sem</div></div>';

    var branches = {};
    S.techTree.forEach(function (n) { (branches[n.branch] = branches[n.branch] || []).push(n); });
    Object.keys(branches).forEach(function (br) {
      h += '<div class="card"><div class="ttl">' + esc(br) + '</div>' + branches[br].map(function (n) {
        var done = t.unlocked.indexOf(n.id) >= 0;
        var avail = !done && n.prereq.every(function (p) { return t.unlocked.indexOf(p) >= 0; });
        var cls = done ? 'tnode done' : avail ? 'tnode' : 'tnode lock';
        var status = done ? '<span class="good sm">✓ desbloqueado</span>'
          : avail ? '<button class="btn ' + (t.project === n.id ? 'ghost' : 'pri') + '" onclick="MG.research(\'' + n.id + '\')">' + (t.project === n.id ? 'En curso' : 'Investigar (' + fmtNum(n.cost) + ' pts)') + '</button>'
          : '<span class="muted sm">requiere: ' + n.prereq.join(', ') + '</span>';
        return '<div class="' + cls + '"><div class="row"><b>' + esc(n.name) + '</b></div><div class="sm muted">' + techDesc(n) + '</div>' + status + '</div>';
      }).join('') + '</div>';
    });
    return h;
  }
  function techDesc(n) {
    var e = n.eff, d = [];
    if (e.effBonus) d.push('−' + (e.effBonus * 100).toFixed(0) + '% costo variable');
    if (e.ceiling) d.push('+' + e.ceiling + ' techo de calidad');
    if (e.labor) d.push('−' + (e.labor * 100).toFixed(0) + '% mano de obra');
    if (e.fixed) d.push('+' + (e.fixed * 100).toFixed(0) + '% costo fijo');
    if (e.mktBonus) d.push('+' + (e.mktBonus * 100).toFixed(0) + '% eficacia de marketing');
    if (e.logi) d.push('−' + (e.logi * 100).toFixed(0) + '% costo logístico');
    if (e.lead) d.push('menor lead time');
    if (e.fresh) d.push('renueva productos (anti-obsolescencia)');
    if (e.patent) d.push('patentes (frena copias)');
    if (e.riskCut) d.push('−' + (e.riskCut * 100).toFixed(0) + '% prima de riesgo crediticio');
    return d.join(' · ');
  }

  // ------------------------------------------------------------------- CREAR EMPRESA
  function openCreate() {
    var opts = E.PLAYABLE.map(function (pid) {
      var p = S.products[pid];
      var cat = ({ staple: 'staple', retail: 'retail', tech: 'tech', luxury: 'lujo', material: 'insumo' })[p.cat] || p.cat;
      return '<option value="' + pid + '">' + esc(p.name) + ' — ' + cat + ' (ref ' + fmtFull(p.refPrice) + ')</option>';
    }).join('');
    var regs = S.regions.map(function (r) { return '<option value="' + r.id + '">' + esc(r.name) + ' — salario ' + r.wageLevel.toFixed(2) + ', tierra ' + r.landPrice.toFixed(2) + '</option>'; }).join('');
    modal('Crear empresa',
      '<div class="row"><span class="lbl">Producto</span><select id="c_prod" onchange="MG.createCost()">' + opts + '</select></div>' +
      '<div class="row"><span class="lbl">Región</span><select id="c_reg" onchange="MG.createCost()">' + regs + '</select></div>' +
      '<div class="row"><span class="lbl">Nombre</span><input type="text" id="c_name" value="Mi Empresa"></div>' +
      '<label class="chk"><input type="checkbox" id="c_vert"> Integración vertical (−30% costo de insumos)</label>' +
      '<div class="sm muted" id="c_cost"></div>',
      'Fundar', 'MG.doCreate()');
    createCost();
  }
  function createCost() {
    var pid = el('c_prod').value, rid = el('c_reg').value;
    var p = S.products[pid], r = S.regions.find(function (x) { return x.id === rid; });
    var setup = facCost(p, rid);
    el('c_cost').innerHTML = 'Costo de arranque: <b class="' + (S.player.cash >= setup ? 'good' : 'bad') + '">' + fmtUSD(setup) + '</b> · tu efectivo: ' + fmtUSD(S.player.cash) +
      '<br>Elasticidad ' + p.elasticity + (p.obs > 0 ? ' · obsolescencia ' + pct(p.obs) + '/año (requiere I+D)' : '') +
      (p.inputs.length ? '<br>Insumos: ' + p.inputs.map(function (i) { return S.products[i[0]].name; }).join(', ') : '');
  }
  function doCreate() {
    var r = act({ type: 'startCompany', productId: el('c_prod').value, region: el('c_reg').value, name: el('c_name').value || 'Empresa', vertical: el('c_vert').checked });
    if (r.ok) { closeModal(); active = 'empresas'; coView = r.id; render(); }
  }

  // ----------------------------------------------------------------------- MODALES
  function modal(title, body, okLabel, okFn) {
    el('modalBox').innerHTML = '<div class="mhead">' + esc(title) + '</div><div class="mbody">' + body + '</div>' +
      '<div class="mfoot">' + (okFn ? '<button class="btn pri" onclick="' + okFn + '">' + esc(okLabel) + '</button>' : '') +
      '<button class="btn ghost" onclick="MG.closeModal()">Cerrar</button></div>';
    el('modal').style.display = 'flex';
  }
  function closeModal() { el('modal').style.display = 'none'; }

  function openEvent() {
    var ev = S.event.active; if (!ev) return;
    var body = '<div class="mdesc">' + esc(ev.desc) + '</div>' +
      ev.choices.map(function (c, i) {
        return '<button class="btn evb" onclick="MG.chooseEvent(' + i + ')"><b>' + esc(c.label) + '</b>' + (c.hint ? '<span class="sm muted"> — ' + esc(c.hint) + '</span>' : '') + '</button>';
      }).join('');
    el('modalBox').innerHTML = '<div class="mhead warn">⚡ ' + esc(ev.title) + '</div><div class="mbody">' + body + '</div>';
    el('modal').style.display = 'flex';
  }
  function chooseEvent(i) { var r = E.applyAction(S, { type: 'chooseEvent', choiceIndex: i }); if (r.ok) { closeModal(); save(); render(); } }

  function openVictory() {
    var p = S.player;
    var coVal = S.companies.reduce(function (a, c) { return a + E.companyValue(S, c) * (1 - (c.floatPct || 0)); }, 0);
    var stkVal = 0; for (var t in p.stocks) { var st = S.stocks[t]; if (st) stkVal += p.stocks[t] * st.price; }
    var reVal = S.realEstate.reduce(function (a, pr) { return a + pr.currentValue; }, 0);
    var dom = (coVal >= stkVal && coVal >= reVal) ? 'Operación / Empresas' : (stkVal >= reVal ? 'Financiera / Bolsa' : 'Inmobiliaria');
    var peak = Math.max.apply(null, S.history.map(function (h) { return h.netWorth; }));
    el('modalBox').innerHTML = '<div class="mhead" style="color:#f59e0b">🏆 ¡TRILLONARIO!</div><div class="mbody">' +
      '<div class="mdesc">Llegaste a la cima. Construiste un imperio de un billón de dólares desde la deuda estudiantil.</div>' +
      '<div class="grid2 sm">' +
        kv('Patrimonio final', fmtUSD(p.netWorth)) + kv('Tiempo jugado', (Math.floor(S.tick / 52)) + ' años') +
        kv('Pico de patrimonio', fmtUSD(peak)) + kv('Estrategia dominante', dom) +
        kv('Empresas', S.companies.length) + kv('Propiedades', S.realEstate.length) +
        kv('Score crediticio', p.creditScore) + kv('Crisis superadas', 'sí') +
      '</div></div>' +
      '<div class="mfoot"><button class="btn pri" onclick="MG.closeModal()">Seguir en modo libre</button></div>';
    el('modal').style.display = 'flex';
  }

  function openGameOver() {
    el('modalBox').innerHTML = '<div class="mhead bad">💀 BANCARROTA</div><div class="mbody"><div class="mdesc">Tu patrimonio quedó insolvente demasiadas semanas. Fin de la partida.</div>' +
      '<div class="sm muted">Sobreviviste ' + gameDate() + '. Patrimonio final ' + fmtUSD(S.player.netWorth) + '.</div></div>' +
      '<div class="mfoot"><button class="btn pri" onclick="MG.reset()">Nueva partida</button></div>';
    el('modal').style.display = 'flex';
  }

  // ------------------------------------------------------------------ EXPORT/IMPORT
  function exportSave() {
    try {
      var code = btoa(unescape(encodeURIComponent(E.serialize(S))));
      modal('Exportar partida', '<div class="sm muted">Copiá este código para respaldar o mover tu partida:</div><textarea id="i_export" rows="6">' + code + '</textarea>', 'Copiar', 'MG.copyExport()');
    } catch (e) { toast('No se pudo exportar.'); }
  }
  function copyExport() { var t = el('i_export'); t.select(); try { document.execCommand('copy'); toast('Copiado.'); } catch (e) {} }
  function importSave() {
    modal('Importar partida', '<div class="sm muted">Pegá el código de una partida exportada:</div><textarea id="i_import" rows="6"></textarea>', 'Cargar', 'MG.doImport()');
  }
  function doImport() {
    try {
      var code = el('i_import').value.trim();
      var json = decodeURIComponent(escape(atob(code)));
      var st = E.deserialize(json);
      if (!st || !st.player) throw 0;
      S = st; save(); closeModal(); show('game'); active = 'dash'; coView = null; render(); toast('Partida cargada.');
    } catch (e) { toast('Código inválido.'); }
  }

  // --------------------------------------------------------------------- HANDLERS
  window.MG = {
    setSpeed: setSpeed, go: go, openEvent: openEvent, reset: resetGame,
    closeModal: closeModal, chooseEvent: chooseEvent,
    openCreate: openCreate, createCost: createCost, doCreate: doCreate,
    openCo: function (id) { coView = id; active = 'empresas'; window.scrollTo(0, 0); render(); },
    backCo: function () { coView = null; render(); },
    setPrice: function (id) { act({ type: 'setPrice', companyId: id, price: num('i_price') }); },
    setProd: function (id) { act({ type: 'setProduction', companyId: id, target: num('i_prod') }); },
    build: function (id) { act({ type: 'buildFactory', companyId: id }); },
    qual: function (id) { act({ type: 'investQuality', companyId: id }); },
    mkt: function (id) { act({ type: 'setMarketing', companyId: id, amount: num('i_mkt') }); },
    rnd: function (id) { act({ type: 'setRnd', companyId: id, amount: num('i_rnd') }); },
    wage: function (id) { act({ type: 'setWage', companyId: id, wage: num('i_wage') }); },
    hire: function (id, n) { act({ type: 'hire', companyId: id, n: n }); },
    fire: function (id, n) { act({ type: 'fire', companyId: id, n: n }); },
    train: function (id) { act({ type: 'train', companyId: id }); },
    vert: function (id, on) { act({ type: 'setVertical', companyId: id, on: on }); },
    ipo: function (id) { var r = act({ type: 'ipo', companyId: id, floatPct: 0.3 }); if (r.ok) toast('IPO: recaudaste ' + fmtUSD(r.raised)); },
    sellco: function (id) { if (confirm('¿Vender esta empresa?')) { act({ type: 'sellCompany', companyId: id }); coView = null; render(); } },
    acquire: function (id) { act({ type: 'acquire', competitorId: id }); },
    takeLoan: function () { act({ type: 'takeLoan', amount: num('i_loan'), loanType: el('i_ltype').value, termTicks: parseInt(el('i_lterm').value, 10) }); },
    payLoan: function (id, amt) { act({ type: 'payLoanExtra', loanId: id, amount: amt }); },
    refi: function (id) { act({ type: 'refinance', loanId: id }); },
    buyStock: function (tk) { act({ type: 'buyStock', ticker: tk, shares: num('sh_' + tk) }); },
    sellStock: function (tk) { act({ type: 'sellStock', ticker: tk, shares: num('sh_' + tk) }); },
    buyProp: function () { act({ type: 'buyProperty', region: el('i_rereg').value, propType: el('i_retype').value, mortgage: el('i_remort').checked }); },
    devProp: function (id) { act({ type: 'developProperty', propertyId: id }); },
    sellProp: function (id) { act({ type: 'sellProperty', propertyId: id }); },
    research: function (id) { act({ type: 'startResearch', techId: id }); },
    insurance: function (on) { act({ type: 'setInsurance', on: on }); },
    pricePrev: function (id) { var v = num('i_price'); var d = el('pricePrev'); if (d) d.innerHTML = pricePrevHtml(E.previewPrice(S, id, v)); },
    exportSave: exportSave, copyExport: copyExport, importSave: importSave, doImport: doImport,
    startNew: function () {
      var seed = (parseInt((el('ob_seed') || {}).value, 10) || Math.floor(Math.random() * 1e9));
      var diff = (el('ob_diff') || {}).value || 'normal';
      var cash = diff === 'facil' ? 15000 : diff === 'dificil' ? 4000 : 8000;
      newGame(seed, cash);
    },
  };

  // ------------------------------------------------------------------------- BOOT
  function boot() {
    if (load()) { victoryShown = !!(S && S.won); show('game'); active = 'dash'; render(); if (S.event.active) openEvent(); }
    else show('onboard');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
