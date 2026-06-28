/* MAGNATE — PASO 4: balance de estrategias y caza de exploits. */
const M = require('./engine.js');

let PASS = 0, FAIL = 0;
function ok(name, cond, extra) { if (cond) PASS++; else { FAIL++; console.log('  ✗ FAIL:', name, extra != null ? '→ ' + extra : ''); } }
const fmt = n => Math.round(n).toLocaleString('en');
function pick_region(s) { const rs = ['centro', 'norte', 'costa', 'valle']; return rs[s.tick % rs.length]; }

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
  const unit = co.lastUnitCost || s.products[co.productId].baseVarCost * 1.5;
  M.applyAction(s, { type: 'setPrice', companyId: co.id, price: unit * markup });
  let cap = 0; for (const f of co.factories) cap += f.capacity;
  M.applyAction(s, { type: 'setProduction', companyId: co.id, target: cap });
  // dotación acorde a capacidad
  const need = Math.ceil(cap / M.C.STAFF_PER_CAP);
  if (co.employees.count < need) M.applyAction(s, { type: 'hire', companyId: co.id, n: need - co.employees.count });
  // marketing/I+D como fracción de revenue
  const rev = co.lastRevenue || 0;
  M.applyAction(s, { type: 'setMarketing', companyId: co.id, amount: Math.min(rev * (opt.mkt || 0.06), s.player.cash * 0.1) });
  if (opt.rnd) M.applyAction(s, { type: 'setRnd', companyId: co.id, amount: Math.min(rev * opt.rnd, s.player.cash * 0.1) });
  // reinversión: construir fábrica si hay caja y la demanda supera capacidad
  if (s.player.cash > cap * 30 && co.marketShare > 0.05 && co.lastUnitsSold > cap * 0.8) {
    M.applyAction(s, { type: 'buildFactory', companyId: co.id });
  }
  if (opt.quality && s.player.cash > 200000 && co.qualityLevel < co.qualityCeiling) {
    M.applyAction(s, { type: 'investQuality', companyId: co.id });
  }
}

function bots() {
  return {
    manufactura(s) {
      if (!s.companies.length && s.player.cash > 6000) M.applyAction(s, { type: 'startCompany', productId: 'furniture', region: 'costa', name: 'Maderera', vertical: true });
      for (const co of s.companies) manageCompany(s, co, { markup: 1.7, mkt: 0.05 });
      // expandir a un 2º rubro de cadena cuando hay capital
      if (s.companies.length === 1 && s.player.cash > 2e6) M.applyAction(s, { type: 'startCompany', productId: 'steel', region: 'valle', name: 'Acería', vertical: true });
    },
    retail(s) {
      if (!s.companies.length && s.player.cash > 6000) M.applyAction(s, { type: 'startCompany', productId: s.player.cash > 45000 ? 'clothing' : 'bread', region: s.player.cash > 45000 ? 'centro' : 'sur', name: 'RetailCo' });
      for (const co of s.companies) manageCompany(s, co, { markup: 1.4, mkt: 0.09, quality: true });
      if (s.companies.length === 1 && s.player.cash > 1e6) M.applyAction(s, { type: 'startCompany', productId: 'bread', region: 'sur', name: 'PanCo' });
      if (s.companies.length === 2 && s.player.cash > 5e6) M.applyAction(s, { type: 'startCompany', productId: 'packfood', region: 'centro', name: 'AlimCo' });
    },
    tech(s) {
      if (!s.companies.length && s.player.cash > 6000) M.applyAction(s, { type: 'startCompany', productId: 'phone', region: 'norte', name: 'TechCo' });
      if (!s.tech.project && s.tech.unlocked.length < 6) {
        const order = ['eff1', 'qual1', 'mkt1', 'qual2', 'eff2', 'prod1'];
        const next = order.find(t => !s.tech.unlocked.includes(t));
        if (next) M.applyAction(s, { type: 'startResearch', techId: next });
      }
      for (const co of s.companies) manageCompany(s, co, { markup: 1.9, mkt: 0.07, rnd: 0.08, quality: true });
    },
    adquisiciones(s) {
      // bootstrap con una empresa fuerte, luego consolidar comprando competidores
      if (!s.companies.length && s.player.cash > 6000) M.applyAction(s, { type: 'startCompany', productId: 'furniture', region: 'costa', name: 'Base', vertical: true });
      for (const co of s.companies) manageCompany(s, co, { markup: 1.55, mkt: 0.06 });
      if (s.player.cash > 1.2e6) {
        const target = s.competitors.filter(c => !c.dead).map(c => ({ c, v: M.competitorValue(s, c) })).filter(x => x.v * 1.25 < s.player.cash * 0.8).sort((a, b) => b.v - a.v)[0];
        if (target) M.applyAction(s, { type: 'acquire', competitorId: target.c.id });
      }
    },
    financiero(s) {
      // bootstrap con generador de caja decente, luego invertir el grueso en bolsa
      if (!s.companies.length && s.player.cash > 6000) M.applyAction(s, { type: 'startCompany', productId: 'clothing', region: 'centro', name: 'CashCow' });
      for (const co of s.companies) manageCompany(s, co, { markup: 1.45, mkt: 0.05 });
      if (s.player.cash > 150000 && s.tick % 3 === 0) {
        // value investing: comprar barato vs fundamental (precio < eps*peMult*0.9) y con dividendo
        const stocks = M.listStocks(s).filter(x => x.price < (x.eps * x.peMult + x.book * 0.6) * 1.02);
        stocks.sort((a, b) => (b.dividendPerShareYear / b.price) - (a.dividendPerShareYear / a.price));
        const pickS = stocks[0] || M.listStocks(s).sort((a, b) => b.dividendPerShareYear / b.price - a.dividendPerShareYear / a.price)[0];
        if (pickS) { const budget = s.player.cash * 0.5; M.applyAction(s, { type: 'buyStock', ticker: pickS.ticker, shares: Math.floor(budget / pickS.price) }); }
      }
    },
    inmobiliario(s) {
      // bootstrap, luego comprar inmuebles apalancados y desarrollar
      if (!s.companies.length && s.player.cash > 6000) M.applyAction(s, { type: 'startCompany', productId: 'bread', region: 'sur', name: 'CashCow' });
      for (const co of s.companies) manageCompany(s, co, { markup: 1.5, mkt: 0.04 });
      if (s.player.cash > 300000 && s.tick % 8 === 0) {
        const reg = pick_region(s);
        M.applyAction(s, { type: 'buyProperty', region: reg, propType: s.tick % 16 === 0 ? 'residential' : 'commercial', mortgage: true });
      }
      for (const pr of s.realEstate) if (s.player.cash > pr.currentValue * 0.6 && pr.developmentLevel < 2 && s.tick % 12 === 0) M.applyAction(s, { type: 'developProperty', propertyId: pr.id });
    },
    hibrido(s) {
      if (!s.companies.length && s.player.cash > 6000) M.applyAction(s, { type: 'startCompany', productId: 'clothing', region: 'centro', name: 'H1' });
      for (const co of s.companies) manageCompany(s, co, { markup: 1.5, mkt: 0.06, rnd: 0.04, quality: true });
      if (!s.tech.project && s.tech.unlocked.length < 3) { const o = ['eff1', 'mkt1', 'qual1'].find(t => !s.tech.unlocked.includes(t)); if (o) M.applyAction(s, { type: 'startResearch', techId: o }); }
      if (s.companies.length === 1 && s.player.cash > 1e6) M.applyAction(s, { type: 'startCompany', productId: 'furniture', region: 'costa', name: 'H2', vertical: true });
      if (s.player.cash > 800000 && s.tick % 8 === 0) M.applyAction(s, { type: 'buyProperty', region: 'sur', propType: 'residential', mortgage: true });
      if (s.player.cash > 500000 && s.tick % 10 === 0) { const st = M.listStocks(s).filter(x => x.dividendPerShareYear > 0).sort((a, b) => b.dividendPerShareYear / b.price - a.dividendPerShareYear / a.price)[0]; if (st) M.applyAction(s, { type: 'buyStock', ticker: st.ticker, shares: Math.floor(s.player.cash * 0.15 / st.price) }); }
    },
  };
}

console.log('=== BALANCE DE ESTRATEGIAS (520 ticks ≈ 10 años, startCash 500k) ===');
const results = {};
const B = bots();
for (const name in B) {
  const s = M.createInitialState({ seed: 2024, startCash: 500000 });
  for (let i = 0; i < 520 && !s.gameOver; i++) { B[name](s); step(s); }
  results[name] = { nw: s.player.netWorth, real: s.player.realNetWorth, stage: s.stage, bankrupt: s.bankrupt, cos: s.companies.length };
  console.log('  ' + name.padEnd(14) + ' netWorth=' + fmt(s.player.netWorth).padStart(16) + '  etapa ' + s.stage + '  empresas ' + s.companies.length + (s.bankrupt ? '  QUIEBRA' : ''));
}

// pasivo
const sp = M.createInitialState({ seed: 2024, startCash: 500000 });
const real0 = sp.player.realNetWorth;
for (let i = 0; i < 520; i++) step(sp);
console.log('  ' + 'pasivo'.padEnd(14) + ' netWorth=' + fmt(sp.player.netWorth).padStart(16) + '  real0=' + fmt(real0) + ' realFin=' + fmt(sp.player.realNetWorth));

console.log('\n  -- verificaciones de balance --');
const vals = Object.entries(results).filter(([k]) => k !== 'hibrido');
for (const [name, r] of vals) ok('estrategia "' + name + '" no quiebra y alcanza etapa PyME (>1M)', !r.bankrupt && r.nw > 1e6 && r.stage >= 2, fmt(r.nw) + ' etapa ' + r.stage);
const nws = vals.map(([, r]) => r.nw).sort((a, b) => a - b);
const maxNw = nws[nws.length - 1], minNw = Math.min(...nws.filter(x => x > 0));
const median = nws[Math.floor(nws.length / 2)];
ok('ninguna estrategia llega a trillonario en 10 años (no runaway)', maxNw < 1e12, fmt(maxNw));
ok('al menos una estrategia alcanza etapa 3+ (Empresario)', vals.some(([, r]) => r.stage >= 3));
ok('dominancia acotada (mejor < 40× la mediana)', maxNw / median < 40, (maxNw / median).toFixed(1) + 'x');
ok('juego pasivo NO progresa (erosión real)', sp.player.realNetWorth < real0, [fmt(real0), fmt(sp.player.realNetWorth)]);
ok('híbrido es competitivo (>= 50% de la mediana de puras y supera la peor pura)', results.hibrido.nw >= median * 0.5 && results.hibrido.nw > minNw, fmt(results.hibrido.nw));

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
  M.applyAction(s, { type: 'startCompany', productId: 'phone', region: 'norte', name: 'IpoCo' });
  const co = s.companies[0];
  for (let i = 0; i < 160; i++) { manageCompany(s, co, { markup: 1.8, mkt: 0.06 }); step(s); }
  M.recomputeNetWorth(s);
  const nwPre = s.player.netWorth;
  const ipo = M.applyAction(s, { type: 'ipo', companyId: co.id, floatPct: 0.3 });
  M.recomputeNetWorth(s);
  const nwPostIpo = s.player.netWorth;
  // recomprar el float de vuelta
  const tk = co.ticker; const st = s.stocks[tk];
  const toBuy = Math.floor(st.sharesOutstanding * 0.3);
  M.applyAction(s, { type: 'buyStock', ticker: tk, shares: toBuy });
  M.recomputeNetWorth(s);
  const nwPostBuy = s.player.netWorth;
  ok('IPO no crea patrimonio de la nada', Math.abs(nwPostIpo - nwPre) < nwPre * 0.12, [fmt(nwPre), fmt(nwPostIpo)]);
  ok('IPO→recompra no imprime dinero (pierde fees+slippage)', nwPostBuy <= nwPostIpo + 1, [fmt(nwPostIpo), fmt(nwPostBuy)]);
}
// 3. flip inmobiliario instantáneo pierde
{
  const s = M.createInitialState({ seed: 3, startCash: 2e6 });
  const c0 = s.player.cash;
  const r = M.applyAction(s, { type: 'buyProperty', region: 'norte', propType: 'residential' });
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
    const s = M.createInitialState({ seed: 5, startCash: 300000 });
    M.applyAction(s, { type: 'startCompany', productId: 'car', region: 'valle', name: 'Auto' });
    const co = s.companies[0];
    for (let i = 0; i < 200; i++) {
      const unit = co.lastUnitCost || s.products.car.baseVarCost * 1.5;
      M.applyAction(s, { type: 'setPrice', companyId: co.id, price: mult === 8 ? s.products.car.refPrice * 8 : unit * 1.6 });
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
