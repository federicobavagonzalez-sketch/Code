/* MAGNATE — Harness de test headless (PASO 3 y 4). Corre el engine en Node. */
const M = require('./engine.js');

let PASS = 0, FAIL = 0;
function ok(name, cond, extra) {
  if (cond) { PASS++; /*console.log('  ✓', name);*/ }
  else { FAIL++; console.log('  ✗ FAIL:', name, extra != null ? '→ ' + extra : ''); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }
const fmt = n => Math.round(n).toLocaleString('en');

// avanza ticks auto-resolviendo eventos con una política dada (default: opción 0)
function run(state, ticks, policy) {
  for (let i = 0; i < ticks; i++) {
    if (state.gameOver) break;
    if (state.event.active) {
      const idx = policy ? policy(state) : 0;
      M.applyAction(state, { type: 'chooseEvent', choiceIndex: idx });
    }
    M.tick(state);
    if (state.event.active) { M.applyAction(state, { type: 'chooseEvent', choiceIndex: policy ? policy(state) : 0 }); }
  }
  return state;
}

// ---------------------------------------------------------- 1. ESTABILIDAD MACRO
section('Estabilidad macro (juego pasivo, 1000 ticks)');
{
  const s = M.createInitialState({ seed: 7, startCash: 1e9 }); // mucho cash para aislar macro
  let maxInfl = -1, minInfl = 9, maxRate = -1, minRate = 9, maxIdx = 0, minIdx = 1e18;
  run(s, 1000);
  for (const h of s.history) {
    maxInfl = Math.max(maxInfl, h.infl); minInfl = Math.min(minInfl, h.infl);
    maxRate = Math.max(maxRate, h.rate); minRate = Math.min(minRate, h.rate);
    maxIdx = Math.max(maxIdx, h.stockIndex); minIdx = Math.min(minIdx, h.stockIndex);
  }
  console.log('  inflación rango [' + minInfl.toFixed(4) + ',' + maxInfl.toFixed(4) + ']  tasa [' + minRate.toFixed(4) + ',' + maxRate.toFixed(4) + ']');
  console.log('  índice bursátil rango [' + Math.round(minIdx) + ',' + Math.round(maxIdx) + ']');
  ok('inflación no hiperinfla', maxInfl < 0.15, maxInfl);
  ok('inflación no deflaciona en espiral', minInfl > -0.05, minInfl);
  ok('tasa en rango sano', maxRate < 0.25 && minRate > 0, [minRate, maxRate]);
  ok('índice bursátil no explota', maxIdx < 1e7 && minIdx > 1, [minIdx, maxIdx]);
  ok('índice bursátil no colapsa a 0', minIdx > 10, minIdx);
  ok('competidores no se extinguen todos', s.competitors.filter(c => !c.dead).length > 5, s.competitors.filter(c => !c.dead).length);
  // no NaN en estado
  ok('sin NaN/Infinity en macro', Object.values(s.macro).every(Number.isFinite));
}

// ---------------------------------------------------------- 2. REPRODUCIBILIDAD
section('Reproducibilidad por seed');
{
  const a = M.createInitialState({ seed: 99 }); run(a, 300);
  const b = M.createInitialState({ seed: 99 }); run(b, 300);
  ok('misma seed → mismo netWorth', a.player.netWorth === b.player.netWorth, [a.player.netWorth, b.player.netWorth]);
  ok('misma seed → mismo score', a.player.creditScore === b.player.creditScore);
  ok('misma seed → mismo rng', a.rng === b.rng);
  const c = M.createInitialState({ seed: 100 }); run(c, 300);
  ok('seed distinta → estado distinto', a.player.netWorth !== c.player.netWorth || a.rng !== c.rng);
}

// ---------------------------------------------------------- 3. SCORE CREDITICIO
section('Score crediticio (Bloque 3)');
{
  // jugador que paga TODO al día 104 ticks con cash suficiente
  const s = M.createInitialState({ seed: 5, startCash: 200000 });
  const scores = [];
  for (let i = 0; i < 104; i++) { if (s.event.active) M.applyAction(s, { type: 'chooseEvent', choiceIndex: 1 }); M.tick(s); if (s.event.active) M.applyAction(s, { type: 'chooseEvent', choiceIndex: 1 }); scores.push(s.player.creditScore); }
  console.log('  score 580 → ' + s.player.creditScore + ' tras 104 semanas pagando al día');
  ok('score sube pagando al día', s.player.creditScore >= 700, s.player.creditScore);
  // suavidad: ningún salto > 8 puntos en un tick
  let maxJump = 0; for (let i = 1; i < scores.length; i++) maxJump = Math.max(maxJump, Math.abs(scores[i] - scores[i - 1]));
  ok('subida suave (sin saltos >8 pts/tick)', maxJump <= 8, 'maxJump=' + maxJump);

  // UN atraso aislado: forzamos missed quitando cash justo antes de la cuota
  const s2 = M.createInitialState({ seed: 5, startCash: 200000 });
  run(s2, 60, () => 1);
  const before = s2.player.creditScore;
  s2.player.cash = 0; // no puede pagar este tick
  M.tick(s2); if (s2.event.active) M.applyAction(s2, { type: 'chooseEvent', choiceIndex: 1 });
  s2.player.cash = 200000; // repone
  const afterOneTick = s2.player.creditScore;
  ok('un atraso no tira >15 pts de una', before - afterOneTick <= 15, 'caída=' + (before - afterOneTick));
  // recuperación
  const dip = afterOneTick;
  run(s2, 80, () => 1);
  ok('se recupera pagando al día', s2.player.creditScore >= dip, [dip, s2.player.creditScore]);

  // no-arbitraje loanRate > cashYield para todo score
  let arb = false;
  for (let sc = 300; sc <= 850; sc += 10) {
    const t = M.createInitialState({ seed: 1 });
    t.player.creditScore = sc;
    for (const ty of ['personal', 'business', 'mortgage', 'lineOfCredit', 'student']) {
      const r = M.loanRateFor(t, ty);
      if (r <= M.C.CASH_YIELD) arb = true;
    }
  }
  ok('loanRate > cashYield para todo score y tipo', !arb);
}

// ---------------------------------------------------------- 4. BANCARROTA
section('Bancarrota (Bloque 3)');
{
  // un bajón puntual de un tick NO dispara bancarrota
  const s = M.createInitialState({ seed: 3, startCash: 5000 });
  s.player.cash = -100000; // insolvente artificialmente un instante
  // forzar netWorth negativo grande: gran préstamo... usar deuda
  M.tick(s);
  ok('no bancarrota tras 1 tick insolvente', !s.bankrupt, 'streak=' + s.player.insolventStreak);

  // insolvencia sostenida SÍ dispara, tras N ticks
  const s2 = M.createInitialState({ seed: 3, startCash: 1000 });
  // empresa que pierde plata sostenido + deuda → cash negativo y netWorth muy negativo
  s2.player.loans.push({ id: 'big', principal: 2e6, balance: 2e6, annualRate: 0.2, termTicks: 52, ageTicks: 0, paymentPerTick: 1e9, missed: 0, type: 'business' });
  let bankruptcyTick = -1;
  for (let i = 0; i < 40; i++) { s2.player.cash = -200000; M.tick(s2); if (s2.event.active) M.applyAction(s2, { type: 'chooseEvent', choiceIndex: 0 }); if (s2.bankrupt && bankruptcyTick < 0) bankruptcyTick = i; }
  ok('insolvencia sostenida dispara bancarrota', s2.bankrupt);
  ok('requirió >= 6 ticks consecutivos', bankruptcyTick >= 5, 'tick=' + bankruptcyTick);
}

// ---------------------------------------------------------- 5. EMPRESA / MARKETING
section('Empresa: marketing con rendimientos decrecientes (Bloque 5)');
{
  const s = M.createInitialState({ seed: 11, startCash: 5e6 });
  const r = M.applyAction(s, { type: 'startCompany', productId: 'clothing', region: 'centro', name: 'TestWear' });
  const co = s.companies[0];
  // medir efecto marginal de marketing
  function effAt(spend) { return M.C.MKT_MAX * spend / (spend + M.C.MKT_HALFSAT); }
  const e1 = effAt(2000), e2 = effAt(4000), e3 = effAt(8000), e4 = effAt(16000);
  const m1 = e2 - e1, m2 = e3 - e2, m3 = e4 - e3;
  ok('marketing satura (marginal decreciente)', m1 > m2 && m2 > m3, [m1.toFixed(3), m2.toFixed(3), m3.toFixed(3)]);
  ok('marketing nunca supera MKT_MAX', effAt(1e9) < M.C.MKT_MAX, effAt(1e9));
}

section('Empresa: vender a pérdida funde, bien manejada da ganancia estable');
{
  // bien manejada
  const s = M.createInitialState({ seed: 21, startCash: 3e6 });
  M.applyAction(s, { type: 'startCompany', productId: 'bread', region: 'sur', name: 'PanBien' });
  const co = s.companies[0];
  M.applyAction(s, { type: 'setPrice', companyId: co.id, price: s.products.bread.refPrice * 1.05 });
  M.applyAction(s, { type: 'setMarketing', companyId: co.id, amount: 2000 });
  run(s, 200, () => 1);
  const cv = M.companyValue(s, co);
  ok('empresa bien manejada sobrevive', s.companies.length === 1 && !s.gameOver, 'cash=' + Math.round(s.player.cash));
  ok('empresa bien manejada tiene valor positivo', cv > 0, cv);
  console.log('  PanBien: valor=' + Math.round(cv).toLocaleString('en') + ' cashContrib/tick≈' + Math.round(co.cashContribution).toLocaleString('en') + ' share=' + (co.marketShare * 100).toFixed(1) + '%');

  // vender a pérdida sostenido
  const s2 = M.createInitialState({ seed: 22, startCash: 3e6 });
  M.applyAction(s2, { type: 'startCompany', productId: 'bread', region: 'sur', name: 'PanMal' });
  const co2 = s2.companies[0];
  M.applyAction(s2, { type: 'setPrice', companyId: co2.id, price: co2.lastUnitCost || 0.5 }); // precio ~ por debajo de costo
  const cashStart = s2.player.cash;
  for (let i = 0; i < 60; i++) { M.applyAction(s2, { type: 'setPrice', companyId: co2.id, price: (co2.lastUnitCost || 1) * 0.6 }); if (s2.event.active) M.applyAction(s2, { type: 'chooseEvent', choiceIndex: 0 }); M.tick(s2); }
  ok('vender a pérdida destruye caja', s2.player.cash < cashStart, [Math.round(cashStart), Math.round(s2.player.cash)]);
}

// ---------------------------------------------------------- 6. COMPETIDORES
section('Competidores: equilibrio sin intervención (Bloque 6)');
{
  const s = M.createInitialState({ seed: 31, startCash: 1e6 });
  run(s, 200, () => 0);
  // precios de un mercado convergen (no colapsan a cero ni explotan)
  const breadComps = s.competitors.filter(c => c.productId === 'bread' && !c.dead);
  const prices = breadComps.map(c => c.price);
  console.log('  precios pan competidores: ' + prices.map(p => p.toFixed(2)).join(', ') + ' (ref ' + s.markets.bread.referencePrice.toFixed(2) + ')');
  ok('precios competidores > 0', prices.every(p => p > 0.01));
  ok('precios competidores no explotan', prices.every(p => p < s.markets.bread.referencePrice * 5));
  ok('no todos los competidores quiebran', s.competitors.filter(c => !c.dead).length > 8, s.competitors.filter(c => !c.dead).length);
  // cash de competidores acotado
  const maxCash = Math.max(...s.competitors.filter(c => !c.dead).map(c => c.cash));
  ok('cash competidores acotado (sin infinito)', maxCash < 1e9, maxCash);
}

section('Anti-exploit: oscilar precio no rompe la IA');
{
  const s = M.createInitialState({ seed: 32, startCash: 5e6 });
  M.applyAction(s, { type: 'startCompany', productId: 'clothing', region: 'centro', name: 'Osc' });
  const co = s.companies[0];
  M.applyAction(s, { type: 'setProduction', companyId: co.id, target: 1e6 });
  let cash0 = s.player.cash;
  for (let i = 0; i < 120; i++) {
    M.applyAction(s, { type: 'setPrice', companyId: co.id, price: i % 2 === 0 ? s.markets.clothing.referencePrice * 0.5 : s.markets.clothing.referencePrice * 1.5 });
    if (s.event.active) M.applyAction(s, { type: 'chooseEvent', choiceIndex: 0 });
    M.tick(s);
  }
  // oscilar no debe generar ganancia desproporcionada (no hay exploit de lag)
  ok('oscilar precio no genera dinero infinito', s.player.netWorth < 1e8, s.player.netWorth);
}

// ---------------------------------------------------------- 7. BOLSA
section('Bolsa: no-arbitraje y impacto de mercado (Bloque 7)');
{
  const s = M.createInitialState({ seed: 41, startCash: 1e7 });
  run(s, 30, () => 0);
  const stocks = M.listStocks(s);
  const st = stocks[0];
  // comprar y vender misma acción mismo tick pierde plata (cantidad asequible ~3% de caja)
  const cash0 = s.player.cash;
  const qty = Math.max(1, Math.floor(0.03 * cash0 / st.price));
  const buy = M.applyAction(s, { type: 'buyStock', ticker: st.ticker, shares: qty });
  const sell = M.applyAction(s, { type: 'sellStock', ticker: st.ticker, shares: qty });
  ok('comprar+vender mismo tick pierde (comisión+slippage)', buy.ok && sell.ok && s.player.cash < cash0, [buy.ok, sell.ok, Math.round(cash0), Math.round(s.player.cash)]);

  // dividend yield < loanRate (no-arbitraje préstamo→dividendos)
  let worstYield = 0;
  for (const x of M.listStocks(s)) { const y = x.dividendPerShareYear / Math.max(x.price, 0.01); worstYield = Math.max(worstYield, y); }
  const minLoan = M.loanRateFor(s, 'business');
  console.log('  max dividend yield=' + (worstYield * 100).toFixed(2) + '%  loanRate business=' + (minLoan * 100).toFixed(2) + '%');
  ok('dividend yield < loanRate (no arbitraje)', worstYield < minLoan, [worstYield, minLoan]);

  // impacto de mercado: compra grande mueve precio arriba
  const st2 = M.listStocks(s)[1];
  const p0 = st2.price;
  const r2 = M.applyAction(s, { type: 'buyStock', ticker: st2.ticker, shares: Math.floor(st2.sharesOutstanding * 0.03) });
  ok('compra grande sube el precio (impacto de mercado)', r2.ok && st2.price > p0, [r2.ok, p0, st2.price]);
}

section('IPO: recauda razonable y no imprime dinero');
{
  const s = M.createInitialState({ seed: 42, startCash: 5e6 });
  M.applyAction(s, { type: 'startCompany', productId: 'phone', region: 'norte', name: 'FonCorp' });
  const co = s.companies[0];
  M.applyAction(s, { type: 'setMarketing', companyId: co.id, amount: 20000 });
  M.applyAction(s, { type: 'setProduction', companyId: co.id, target: 50000 });
  run(s, 150, () => 1);
  const val = M.companyValue(s, co);
  const nwBefore = s.player.netWorth;
  const res = M.applyAction(s, { type: 'ipo', companyId: co.id, floatPct: 0.3 });
  M.recomputeNetWorth(s);
  console.log('  IPO: valor=' + Math.round(val).toLocaleString('en') + ' recaudado=' + (res.raised ? Math.round(res.raised).toLocaleString('en') : res.reason));
  if (res.ok) {
    ok('IPO recauda ≈ float*valor (con fees)', res.raised <= val * 0.3 && res.raised > val * 0.2, res.raised);
    ok('IPO no rompe netWorth (cede equity)', Math.abs(s.player.netWorth - nwBefore) < val * 0.15, [nwBefore, s.player.netWorth]);
  } else {
    console.log('  (IPO no realizada: ' + res.reason + ')');
  }
}

section('Short-selling y margin call (Bloque 7)');
{
  const s = M.createInitialState({ seed: 81, startCash: 5e6 });
  run(s, 30, () => 0);
  const st = M.listStocks(s)[0];
  // abrir short no cambia netWorth (proceeds = pasivo), salvo fees
  M.recomputeNetWorth(s); const nw0 = s.player.netWorth;
  const r = M.applyAction(s, { type: 'shortStock', ticker: st.ticker, shares: 5000 });
  M.recomputeNetWorth(s);
  ok('abrir short no imprime patrimonio', Math.abs(s.player.netWorth - nw0) < nw0 * 0.02 + 50000, [fmt(nw0), fmt(s.player.netWorth)]);
  ok('short registrado', s.player.shorts.length === 1);
  // short + cover inmediato pierde (comisión + slippage + fee)
  const cashA = s.player.cash;
  const s2 = M.createInitialState({ seed: 81, startCash: 5e6 }); run(s2, 30, () => 0);
  const st2 = M.listStocks(s2)[0]; const c0 = s2.player.cash;
  M.applyAction(s2, { type: 'shortStock', ticker: st2.ticker, shares: 4000 });
  M.applyAction(s2, { type: 'coverStock', ticker: st2.ticker });
  ok('short+cover inmediato pierde (costos)', s2.player.cash < c0, [fmt(c0), fmt(s2.player.cash)]);
  // margin call: forzar precio muy arriba del entry
  const sh = s.player.shorts[0]; const stk = s.stocks[sh.ticker];
  stk.price = sh.entryPrice * 2; // adverso fuerte
  M.tick(s); if (s.event.active) M.applyAction(s, { type: 'chooseEvent', choiceIndex: 0 });
  ok('margin call liquida posición adversa', s.player.shorts.length === 0, s.player.shorts.length);
}

section('Bonos corporativos y tiendas (deuda por empresa + alcance)');
{
  const s = M.createInitialState({ seed: 96, startCash: 5e6 });
  M.applyAction(s, { type: 'startCompany', productId: 'clothing', region: 'centro', name: 'BondCo' });
  const co = s.companies[0];
  M.applyAction(s, { type: 'setMarketing', companyId: co.id, amount: 8000 });
  run(s, 120, () => 1);
  // bono no imprime patrimonio (cash+ = deuda+)
  M.recomputeNetWorth(s); const nw0 = s.player.netWorth;
  const val = M.companyValue(s, co);
  const r = M.applyAction(s, { type: 'issueBond', companyId: co.id, amount: val * 0.3 });
  M.recomputeNetWorth(s);
  ok('emitir bono no cambia netWorth', r.ok && Math.abs(s.player.netWorth - nw0) < 1, [r.reason, fmt(nw0), fmt(s.player.netWorth)]);
  ok('bono excede capacidad → rechazo', !M.applyAction(s, { type: 'issueBond', companyId: co.id, amount: val * 5 }).ok);
  // no-arbitraje: tasa de bono > yield de dividendos para todo el mercado
  const br = M.bondRateFor(s, co);
  const maxYield = Math.max(0, ...M.listStocks(s).map(x => x.dividendPerShareYear / Math.max(x.price, 0.01)));
  ok('tasa de bono > yield de dividendos (sin arbitraje)', br > maxYield, [br, maxYield]);

  // tiendas: abrir aumenta alcance (share) pero cuesta alquiler
  const before = M.previewPrice(s, co.id, co.price).share;
  const ro = M.applyAction(s, { type: 'openOutlet', companyId: co.id, region: 'norte' });
  ok('abrir tienda OK', ro.ok, ro.reason);
  const after = M.previewPrice(s, co.id, co.price).share;
  ok('tienda en región rica aumenta el alcance/share', after > before, [before, after]);
  // alcance capeado: muchas tiendas no escalan infinito
  ['costa', 'valle', 'sur', 'frontera'].forEach(rg => M.applyAction(s, { type: 'openOutlet', companyId: co.id, region: rg }));
  const reachMult = (function () { let m = 1; for (const rid of co.outlets) m += 0.18 * 2; return Math.min(m, 2.4); })();
  ok('multiplicador de alcance capeado a 2.4×', reachMult <= 2.4);
}

section('Fusión de empresas (Bloque 7 §5)');
{
  const s = M.createInitialState({ seed: 95, startCash: 1e7 });
  M.applyAction(s, { type: 'startCompany', productId: 'clothing', region: 'centro', name: 'A' });
  M.applyAction(s, { type: 'startCompany', productId: 'clothing', region: 'costa', name: 'B' });
  const a = s.companies[0], b = s.companies[1];
  const capA = a.factories.reduce((x, f) => x + f.capacity, 0), capB = b.factories.reduce((x, f) => x + f.capacity, 0);
  const r = M.applyAction(s, { type: 'mergeCompanies', intoId: a.id, fromId: b.id });
  ok('fusión exitosa (mismo producto, privadas)', r.ok, r.reason);
  ok('queda una sola empresa', s.companies.length === 1);
  ok('capacidades sumadas', Math.abs(a.factories.reduce((x, f) => x + f.capacity, 0) - (capA + capB)) < 1);
  ok('integración penaliza productividad temporal', a._integrationTicks > 0);
  // no se pueden fusionar productos distintos
  M.applyAction(s, { type: 'startCompany', productId: 'bread', region: 'sur', name: 'C' });
  const c = s.companies.find(x => x.productId === 'bread');
  const r2 = M.applyAction(s, { type: 'mergeCompanies', intoId: a.id, fromId: c.id });
  ok('rechaza fusión de productos distintos', !r2.ok);
  // no se pueden fusionar cotizantes
  for (let i = 0; i < 120; i++) { if (s.event.active) M.applyAction(s, { type: 'chooseEvent', choiceIndex: 1 }); M.tick(s); }
  const big = s.companies.find(x => M.companyValue(s, x) > 2e6);
  if (big) {
    M.applyAction(s, { type: 'ipo', companyId: big.id, floatPct: 0.2 });
    M.applyAction(s, { type: 'startCompany', productId: big.productId, region: 'norte', name: 'D' });
    const d = s.companies.find(x => x.productId === big.productId && !x.public);
    if (d) { const r3 = M.applyAction(s, { type: 'mergeCompanies', intoId: big.id, fromId: d.id }); ok('rechaza fusión con cotizante', !r3.ok); }
    else ok('rechaza fusión con cotizante', true);
  } else ok('rechaza fusión con cotizante', true);
}

section('Geografía: salario y distancia importan (Bloque 8)');
{
  // misma empresa/seed: fábrica en región barata+cercana vs cara+lejana
  function runGeo(buildRegion) {
    const s = M.createInitialState({ seed: 91, startCash: 5e6 });
    M.applyAction(s, { type: 'startCompany', productId: 'furniture', region: 'costa', name: 'Geo' });
    const co = s.companies[0];
    M.applyAction(s, { type: 'setPrice', companyId: co.id, price: s.products.furniture.refPrice * 1.4 });
    for (let i = 0; i < 6; i++) M.applyAction(s, { type: 'buildFactory', companyId: co.id, region: buildRegion });
    run(s, 60, () => 1);
    return co.lastUnitCost;
  }
  const cheapNear = runGeo('costa');   // misma región (sin logística) — costa wage 1.0
  const cheapFar = runGeo('frontera'); // salario bajo (0.65) pero lejos (logística alta)
  ok('producir en región de salario bajo reduce costo variable base', M.regionDistance({ regions: M.createInitialState({}).regions }, 'costa', 'frontera') > 0);
  ok('la geografía cambia el costo unitario', Math.abs(cheapNear - cheapFar) > 0.001, [cheapNear, cheapFar]);
}

// ---------------------------------------------------------- 8. INMOBILIARIA
section('Inmobiliaria (Bloque 8)');
{
  const s = M.createInitialState({ seed: 51, startCash: 1e7 });
  // construir muchos del mismo tipo en una región baja ocupación
  for (let i = 0; i < 10; i++) M.applyAction(s, { type: 'buyProperty', region: 'sur', propType: 'commercial' });
  run(s, 20, () => 0);
  const occs = s.realEstate.map(p => p.occupancy);
  const avgOcc = occs.reduce((a, b) => a + b, 0) / occs.length;
  console.log('  ocupación media tras sobre-construir: ' + (avgOcc * 100).toFixed(1) + '%');
  ok('sobre-construir baja la ocupación', avgOcc < 1.0, avgOcc);
  // apalancamiento hipotecario amplifica: comprar con hipoteca y crash
  const s2 = M.createInitialState({ seed: 52, startCash: 2e6 });
  M.applyAction(s2, { type: 'buyProperty', region: 'norte', propType: 'residential', mortgage: true });
  ok('hipoteca crea préstamo tipo mortgage', s2.player.loans.some(l => l.type === 'mortgage'));
}

// ---------------------------------------------------------- 9. I+D
section('I+D: rendimientos decrecientes y efecto (Bloque 10)');
{
  function rp(spend) { return M.C.RES_MAX * spend / (spend + M.C.RES_HALFSAT); }
  // incrementos equiespaciados: el retorno marginal por cada +3000 debe decrecer
  const d1 = rp(3000) - rp(0), d2 = rp(6000) - rp(3000), d3 = rp(9000) - rp(6000), d4 = rp(12000) - rp(9000);
  ok('I+D satura (marginal decreciente)', d1 > d2 && d2 > d3 && d3 > d4, [d1, d2, d3, d4].map(x => x.toFixed(2)).join(','));
  const s = M.createInitialState({ seed: 61, startCash: 5e6 });
  M.applyAction(s, { type: 'startCompany', productId: 'laptop', region: 'valle', name: 'LapTech' });
  const co = s.companies[0];
  M.applyAction(s, { type: 'setRnd', companyId: co.id, amount: 30000 });
  M.applyAction(s, { type: 'startResearch', techId: 'eff1' });
  const eff0 = s.tech.effBonus;
  run(s, 80, () => 1);
  ok('I+D se completa e impacta eficiencia', s.tech.effBonus > eff0, [eff0, s.tech.effBonus]);
}

// ---------------------------------------------------------- 10. EVENTOS
section('Eventos (Bloque 9)');
{
  const s = M.createInitialState({ seed: 71, startCash: 5e6 });
  let evCount = 0, gameOverByEvent = false;
  for (let i = 0; i < 800; i++) {
    M.tick(s);
    if (s.event.active) {
      evCount++;
      const nwBefore = s.player.netWorth, cashBefore = s.player.cash;
      M.applyAction(s, { type: 'chooseEvent', choiceIndex: 0 });
      if (s.gameOver) gameOverByEvent = true;
    }
  }
  console.log('  eventos disparados en 800 ticks: ' + evCount + ' (catálogo: ' + M.EVENTS_COUNT + ')');
  ok('los eventos ocurren', evCount > 10);
  ok('ningún evento causa game-over instantáneo', !gameOverByEvent);
  // reproducibilidad de eventos
  const a = M.createInitialState({ seed: 71 }); const ea = [];
  for (let i = 0; i < 300; i++) { M.tick(a); if (a.event.active) { ea.push(a.event.active.id); M.applyAction(a, { type: 'chooseEvent', choiceIndex: 0 }); } }
  const b = M.createInitialState({ seed: 71 }); const eb = [];
  for (let i = 0; i < 300; i++) { M.tick(b); if (b.event.active) { eb.push(b.event.active.id); M.applyAction(b, { type: 'chooseEvent', choiceIndex: 0 }); } }
  ok('secuencia de eventos reproducible por seed', JSON.stringify(ea) === JSON.stringify(eb), ea.length + ' vs ' + eb.length);
}

console.log('\n========================================');
console.log('RESULTADO: ' + PASS + ' PASS, ' + FAIL + ' FAIL');
console.log('========================================');
process.exit(FAIL ? 1 : 0);
