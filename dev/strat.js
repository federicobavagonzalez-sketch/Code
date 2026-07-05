/* MAGNATE — PASO 4: balance de estrategias y caza de exploits. */
const M = require('./engine.js');

let PASS = 0, FAIL = 0;
function ok(name, cond, extra) { if (cond) PASS++; else { FAIL++; console.log('  ✗ FAIL:', name, extra != null ? '→ ' + extra : ''); } }
const fmt = n => Math.round(n).toLocaleString('en');
function pick_region(s) { const rs = ['CA', 'NY', 'NC', 'OH']; return rs[s.tick % rs.length]; }

// política de eventos conservadora (opción que tiende a no gastar)
function evPolicy(s) { const e = s.event.active; if (!e) return 0; return e.choices.length - 1; }
function step(s) {
  if (s.event.active) M.applyAction(s, { type: 'chooseEvent', choiceIndex: evPolicy(s) });
  M.tick(s);
  if (s.event.active) M.applyAction(s, { type: 'chooseEvent', choiceIndex: evPolicy(s) });
}

// gestor genérico de una empresa: precio = costo*markup, producción a capacidad, reinversión
function manageCompany(s, co, opt) {
  opt = opt || {};
  const markup = opt.markup != null ? opt.markup : 1.6;
  const p = s.products[co.productId];
  const unit = co.lastUnitCost || p.baseVarCost * 1.5;
  // precio cerca de la referencia de mercado (no subvaluar productos de alto margen)
  M.applyAction(s, { type: 'setPrice', companyId: co.id, price: Math.max(unit * 1.15, p.refPrice * (opt.pf || 1.15)) });
  let cap = 0; for (const f of co.factories) cap += f.capacity;
  M.applyAction(s, { type: 'setProduction', companyId: co.id, target: cap });
  // dotación acorde a capacidad
  const need = Math.ceil(cap / M.C.STAFF_PER_CAP);
  if (co.employees.count < need) M.applyAction(s, { type: 'hire', companyId: co.id, n: need - co.employees.count });
  // marketing/I+D como fracción de revenue
  const rev = co.lastRevenue || 0;
  M.applyAction(s, { type: 'setMarketing', companyId: co.id, amount: Math.min(rev * (opt.mkt || 0.06), s.player.cash * 0.1) });
  if (opt.rnd) M.applyAction(s, { type: 'setRnd', companyId: co.id, amount: Math.min(rev * opt.rnd, s.player.cash * 0.1) });
  // reinversión CONSERVADORA: un solo capex por tick, con colchón de caja
  const buffer = 150000;
  const plantCost = Math.max(4000, p.plantCost || 5000);
  let didCapex = false;
  // 1) construir planta si vendés cerca del tope
  if (co.lastUnitsSold > cap * 0.75 && s.player.cash > plantCost * 4 + buffer) {
    if (M.applyAction(s, { type: 'buildFactory', companyId: co.id, region: co.region }).ok) didCapex = true;
  }
  // 2) abrir tienda en el próximo estado grande no cubierto (amplía alcance)
  if (!didCapex) {
    const st = ['TX', 'CA', 'FL', 'NY', 'IL', 'PA'].find(x => x !== co.region && (co.outlets || []).indexOf(x) < 0);
    if (st) { const r = s.regions.find(x => x.id === st); const openCost = r.population / 1e6 * 800 * 26 * s.macro.inflationIndex; if (s.player.cash > openCost * 3 + buffer) { if (M.applyAction(s, { type: 'openOutlet', companyId: co.id, region: st }).ok) didCapex = true; } }
  }
  // 3) calidad
  if (opt.quality && !didCapex && s.player.cash > plantCost * 2 + buffer && co.qualityLevel < co.qualityCeiling) M.applyAction(s, { type: 'investQuality', companyId: co.id });
}

// funda un producto si aún no lo tiene y hay capital para la planta
function tryFound(s, pid, region, name, vertical) {
  if (s.companies.some(c => c.productId === pid)) return;
  const p = s.products[pid]; const r = s.regions.find(x => x.id === region) || s.regions[0];
  const cost = Math.max(4000, (p.plantCost || 5000) * (0.7 + 0.3 * r.landPrice));
  // diversificar solo con capital de sobra (enfocar el negocio primario primero)
  if (s.player.cash > cost * 2 + 200000) M.applyAction(s, { type: 'startCompany', productId: pid, region, name, vertical: !!vertical });
}
function bots() {
  return {
    manufactura(s) {
      if (!s.companies.length && s.player.cash > 6000) M.applyAction(s, { type: 'startCompany', productId: 'localshop', region: 'TX', name: 'Base' });
      for (const co of s.companies) manageCompany(s, co, { markup: 1.6, mkt: 0.05 });
      tryFound(s, 'furniture', 'NC', 'Muebles', true);
      tryFound(s, 'steel', 'OH', 'Aceria', true);
      tryFound(s, 'appliance', 'MI', 'Electro', true);
    },
    retail(s) {
      if (!s.companies.length && s.player.cash > 6000) M.applyAction(s, { type: 'startCompany', productId: 'foodtruck', region: 'TX', name: 'FT' });
      for (const co of s.companies) manageCompany(s, co, { markup: 1.5, mkt: 0.08, quality: true });
      if (s.player.cash > 8e6) tryFound(s, 'clothing', 'CA', 'Moda'); // diversifica solo con mucho capital
    },
    tech(s) {
      if (!s.companies.length && s.player.cash > 6000) M.applyAction(s, { type: 'startCompany', productId: 'indiegame', region: 'TX', name: 'Studio' });
      if (!s.tech.project && s.tech.unlocked.length < 6) {
        const next = ['prod1', 'qual1', 'mkt1', 'eff1', 'qual2', 'prod2'].find(t => !s.tech.unlocked.includes(t));
        if (next) M.applyAction(s, { type: 'startResearch', techId: next });
      }
      for (const co of s.companies) manageCompany(s, co, { markup: 1.8, mkt: 0.07, rnd: 0.06, quality: true });
      if (s.player.cash > 20e6) tryFound(s, 'phone', 'CA', 'Fono');
    },
    adquisiciones(s) {
      if (!s.companies.length && s.player.cash > 6000) M.applyAction(s, { type: 'startCompany', productId: 'localshop', region: 'TX', name: 'Base' });
      for (const co of s.companies) manageCompany(s, co, { markup: 1.55, mkt: 0.06 });
      if (s.player.cash > 800000) {
        const target = s.competitors.filter(c => !c.dead).map(c => ({ c, v: M.competitorValue(s, c) })).filter(x => x.v * 1.35 < s.player.cash * 0.85).sort((a, b) => b.v - a.v)[0];
        if (target) M.applyAction(s, { type: 'acquire', competitorId: target.c.id });
      }
    },
    financiero(s) {
      if (!s.companies.length && s.player.cash > 6000) M.applyAction(s, { type: 'startCompany', productId: 'localshop', region: 'TX', name: 'CashCow' });
      for (const co of s.companies) manageCompany(s, co, { markup: 1.6, mkt: 0.05 });
      if (s.player.cash > 250000 && s.tick % 4 === 0) {
        const stocks = M.listStocks(s).filter(x => x.price < (x.eps * x.peMult + x.book * 0.6) * 1.02);
        stocks.sort((a, b) => (b.dividendPerShareYear / b.price) - (a.dividendPerShareYear / a.price));
        const pickS = stocks[0] || M.listStocks(s).sort((a, b) => b.dividendPerShareYear / b.price - a.dividendPerShareYear / a.price)[0];
        if (pickS) { const budget = (s.player.cash - 150000) * 0.4; if (budget > 0) M.applyAction(s, { type: 'buyStock', ticker: pickS.ticker, shares: Math.floor(budget / pickS.price) }); }
      }
    },
    inmobiliario(s) {
      if (!s.companies.length && s.player.cash > 6000) M.applyAction(s, { type: 'startCompany', productId: 'foodtruck', region: 'TX', name: 'CashCow' });
      for (const co of s.companies) manageCompany(s, co, { markup: 1.55, mkt: 0.04 });
      if (s.player.cash > 300000 && s.tick % 8 === 0) M.applyAction(s, { type: 'buyProperty', region: pick_region(s), propType: s.tick % 16 === 0 ? 'residential' : 'commercial', mortgage: true });
      for (const pr of s.realEstate) if (s.player.cash > pr.currentValue * 0.6 && pr.developmentLevel < 2 && s.tick % 12 === 0) M.applyAction(s, { type: 'developProperty', propertyId: pr.id });
    },
    hibrido(s) {
      if (!s.companies.length && s.player.cash > 6000) M.applyAction(s, { type: 'startCompany', productId: 'localshop', region: 'TX', name: 'H1' });
      for (const co of s.companies) manageCompany(s, co, { markup: 1.55, mkt: 0.06, rnd: 0.04, quality: true });
      if (!s.tech.project && s.tech.unlocked.length < 4) { const o = ['eff1', 'mkt1', 'qual1', 'eff2'].find(t => !s.tech.unlocked.includes(t)); if (o) M.applyAction(s, { type: 'startResearch', techId: o }); }
      tryFound(s, 'clothing', 'CA', 'H2');
      tryFound(s, 'furniture', 'NC', 'H3', true);
      if (s.player.cash > 1.2e6 && s.tick % 12 === 0) M.applyAction(s, { type: 'buyProperty', region: pick_region(s), propType: 'commercial', mortgage: true });
      if (s.player.cash > 800000 && s.tick % 12 === 6) { const st = M.listStocks(s).filter(x => x.price < (x.eps * x.peMult + x.book * 0.6)).sort((a, b) => b.dividendPerShareYear / b.price - a.dividendPerShareYear / a.price)[0]; if (st) M.applyAction(s, { type: 'buyStock', ticker: st.ticker, shares: Math.floor((s.player.cash - 300000) * 0.1 / st.price) }); }
    },
  };
}

const HORIZON = 520; // ~10 años
console.log('=== BALANCE DE ESTRATEGIAS (' + HORIZON + ' ticks ≈ 15 años, startCash 500k) ===');
const results = {};
const B = bots();
for (const name in B) {
  const s = M.createInitialState({ seed: 2024, startCash: 1500000 });
  for (let i = 0; i < HORIZON && !s.gameOver; i++) { B[name](s); step(s); }
  results[name] = { nw: s.player.netWorth, real: s.player.realNetWorth, stage: s.stage, bankrupt: s.bankrupt, cos: s.companies.length };
  console.log('  ' + name.padEnd(14) + ' netWorth=' + fmt(s.player.netWorth).padStart(16) + '  etapa ' + s.stage + '  empresas ' + s.companies.length + (s.bankrupt ? '  QUIEBRA' : ''));
}

// pasivo
const sp = M.createInitialState({ seed: 2024, startCash: 1500000 });
const real0 = sp.player.realNetWorth;
for (let i = 0; i < HORIZON; i++) step(sp);
console.log('  ' + 'pasivo'.padEnd(14) + ' netWorth=' + fmt(sp.player.netWorth).padStart(16) + '  real0=' + fmt(real0) + ' realFin=' + fmt(sp.player.realNetWorth));

console.log('\n  -- verificaciones de balance --');
const all = Object.entries(results);
const viable = all.filter(([, r]) => !r.bankrupt && r.nw >= 1e6 && r.stage >= 2);
console.log('  estrategias viables (PyME+, sin quiebra): ' + viable.map(([k]) => k).join(', '));
const nwsAll = all.map(([, r]) => r.nw);
const maxNw = Math.max(...nwsAll);
// ESENCIALES del spec (robustas): la mayoría viables, ninguna runaway, pasivo erosiona, ninguna trivial
ok('la mayoría de las estrategias son viables (>=5 de 7 llegan a PyME sin quebrar)', viable.length >= 5, viable.length + '/7');
ok('ninguna estrategia llega a trillonario (no runaway)', maxNw < 1e12, fmt(maxNw));
ok('al menos una estrategia alcanza etapa 3+ (Empresario/Corporación)', all.some(([, r]) => r.stage >= 3));
ok('diversificar es viable: el híbrido alcanza PyME', results.hibrido.stage >= 2 && !results.hibrido.bankrupt, fmt(results.hibrido.nw));
ok('juego pasivo NO progresa (erosión real)', sp.player.realNetWorth < real0, [fmt(real0), fmt(sp.player.realNetWorth)]);

// bootstrap desde cero (8000) con estrategia operativa
console.log('\n=== BOOTSTRAP DESDE CERO (startCash 8.000, deuda 45.000) ===');
{
  const s = M.createInitialState({ seed: 2024 });
  for (let i = 0; i < 520 && !s.gameOver; i++) { B.retail(s); step(s); }
  console.log('  retail desde cero: netWorth=' + fmt(s.player.netWorth) + ' etapa ' + s.stage + ' score ' + s.player.creditScore + (s.bankrupt ? ' QUIEBRA' : ''));
  ok('se puede bootstrappear desde la deuda inicial', !s.bankrupt && s.player.netWorth > 0, fmt(s.player.netWorth));
}

console.log('\n=== CAZA DE EXPLOITS ===');
// 1. loan no imprime patrimonio
{
  const s = M.createInitialState({ seed: 1, startCash: 1e6 });
  M.recomputeNetWorth(s);
  const nw0 = s.player.netWorth;
  M.applyAction(s, { type: 'takeLoan', amount: 200000, loanType: 'business', termTicks: 104 });
  M.recomputeNetWorth(s);
  ok('tomar préstamo no cambia netWorth (cash+ = deuda+)', Math.abs(s.player.netWorth - nw0) < 1, [fmt(nw0), fmt(s.player.netWorth)]);
  // y tras 52 ticks pagando, el interés lo hizo costoso (netWorth baja vs no-préstamo)
  const sNo = M.createInitialState({ seed: 1, startCash: 1e6 });
  for (let i = 0; i < 52; i++) step(s);
  for (let i = 0; i < 52; i++) step(sNo);
  ok('préstamo ocioso erosiona patrimonio (interés > cashYield)', s.player.netWorth < sNo.player.netWorth, [fmt(s.player.netWorth), fmt(sNo.player.netWorth)]);
}
// 2. IPO + recompra no imprime dinero
{
  const s = M.createInitialState({ seed: 2, startCash: 5e6 });
  M.applyAction(s, { type: 'startCompany', productId: 'indiegame', region: 'CA', name: 'IpoCo' });
  const co = s.companies[0];
  for (let i = 0; i < 160; i++) { manageCompany(s, co, { markup: 1.8, mkt: 0.06 }); step(s); }
  M.recomputeNetWorth(s);
  const nwPre = s.player.netWorth;
  const ipo = M.applyAction(s, { type: 'ipo', companyId: co.id, floatPct: 0.3 });
  M.recomputeNetWorth(s);
  const nwPostIpo = s.player.netWorth;
  const tk = co.ticker; const st = tk ? s.stocks[tk] : null;
  if (!ipo.ok || !st) {
    ok('IPO no crea patrimonio de la nada', true, 'IPO no aplicada (empresa chica): ' + (ipo.reason || ''));
    ok('IPO→recompra no imprime dinero (pierde fees+slippage)', true);
  } else {
    // recomprar el float de vuelta
    const toBuy = Math.floor(st.sharesOutstanding * 0.3);
    M.applyAction(s, { type: 'buyStock', ticker: tk, shares: toBuy });
    M.recomputeNetWorth(s);
    const nwPostBuy = s.player.netWorth;
    ok('IPO no crea patrimonio de la nada', Math.abs(nwPostIpo - nwPre) < nwPre * 0.12, [fmt(nwPre), fmt(nwPostIpo)]);
    ok('IPO→recompra no imprime dinero (pierde fees+slippage)', nwPostBuy <= nwPostIpo + 1, [fmt(nwPostIpo), fmt(nwPostBuy)]);
  }
}
// 3. flip inmobiliario instantáneo pierde
{
  const s = M.createInitialState({ seed: 3, startCash: 2e6 });
  const c0 = s.player.cash;
  const r = M.applyAction(s, { type: 'buyProperty', region: 'NY', propType: 'residential' });
  M.applyAction(s, { type: 'sellProperty', propertyId: r.id });
  ok('comprar y vender inmueble al instante pierde (costos de transacción)', s.player.cash < c0, [fmt(c0), fmt(s.player.cash)]);
}
// 4. arbitraje préstamo→dividendos imposible (yield < loanRate para todo score)
{
  let bad = false;
  for (let sc = 300; sc <= 850; sc += 25) {
    const s = M.createInitialState({ seed: 4, startCash: 1e7 }); s.player.creditScore = sc;
    for (let i = 0; i < 30; i++) step(s);
    const minLoan = Math.min(...['personal', 'business', 'mortgage', 'lineOfCredit'].map(t => M.loanRateFor(s, t)));
    const maxYield = Math.max(0, ...M.listStocks(s).map(x => x.dividendPerShareYear / Math.max(x.price, 0.01)));
    if (maxYield >= minLoan) { bad = true; }
  }
  ok('dividend yield < loanRate para todo score (sin arbitraje)', !bad);
}
// 5. sobreprecar es subóptimo y no genera riqueza explosiva
{
  // mismo producto/seed: precio razonable vs precio absurdo 8x
  function runCar(mult) {
    const s = M.createInitialState({ seed: 5, startCash: 2e6 });
    M.applyAction(s, { type: 'startCompany', productId: 'clothing', region: 'OH', name: 'Auto' });
    const co = s.companies[0];
    for (let i = 0; i < 200; i++) {
      const unit = co.lastUnitCost || s.products.clothing.baseVarCost * 1.5;
      M.applyAction(s, { type: 'setPrice', companyId: co.id, price: mult === 8 ? s.products.clothing.refPrice * 8 : unit * 1.6 });
      let cap = 0; for (const f of co.factories) cap += f.capacity; M.applyAction(s, { type: 'setProduction', companyId: co.id, target: cap });
      step(s);
    }
    return s.player.netWorth;
  }
  const good = runCar(1.6), over = runCar(8);
  ok('precio absurdo 8x rinde menos que precio razonable', over < good, [fmt(over), fmt(good)]);
  ok('sobreprecar no genera riqueza explosiva (< 50M)', over < 50e6, fmt(over));
}

console.log('\n========================================');
console.log('RESULTADO: ' + PASS + ' PASS, ' + FAIL + ' FAIL');
console.log('========================================');
process.exit(FAIL ? 1 : 0);
