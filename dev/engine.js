/* MAGNATE — Motor económico puro. Sin DOM, sin timers, 100% serializable.
   La UI solo lee state y llama applyAction. Orden de tick fijo (ver DESIGN.md §3). */
(function (root, factory) {
  const M = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  else root.MAGNATE = M;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ----------------------------------------------------------------- CONSTANTES
  const C = {
    TICKS_PER_YEAR: 52,
    START_CASH: 8000,
    STUDENT_DEBT: 45000, STUDENT_RATE: 0.05, STUDENT_TERM: 260,
    START_SCORE: 580, SCORE_SMOOTHING: 0.04,
    CASH_YIELD: 0.01,
    BASE_CREDIT_LIMIT: 20000,
    INSOLVENCY_THRESHOLD: 50000, INSOLVENCY_TICKS: 6,
    TAX_RATE: 0.25, TAX_PERIOD: 13,
    ATTR_A: 1.0, ATTR_B: 1.2, ATTR_C: 0.5,
    MKT_MAX: 0.8, MKT_HALFSAT: 4000, BRAND_DECAY: 0.004,
    QUAL_W: 0.6, QUAL_STEP_COST: 1.0,
    SCALE_K: 5e-7, SCALE_MIN: 0.75,
    STORAGE_FRAC: 0.004, REF_POP: 5e6,
    BASE_INFLATION: 0.03, INFL_TARGET: 0.02,
    NEUTRAL_RATE: 0.04, RATE_SMOOTH: 0.05,
    CYCLE_LEN: 260, CYCLE_AMP: 0.22,
    STOCK_CONVERGE: 0.1, STOCK_NOISE: 0.012, STOCK_IMPACT_K: 0.55, COMMISSION: 0.005,
    RES_MAX: 12, RES_HALFSAT: 3000,
    EVENT_BASE_PROB: 0.055, EVENT_COOLDOWN: 8,
    WIN_NETWORTH: 1e12,
    CONTROL_PREMIUM: 0.25,
    STAFF_PER_CAP: 1000, BASE_WAGE: 220, STOCK_INIT_PRICE: 40,
    SHORT_INIT_MARGIN: 0.5, SHORT_MARGIN_CALL: 1.6, SHORT_BORROW: 0.06,
  };
  C.CONTROL_PREMIUM = 0.35;

  const STAGES = [
    { id: 0, name: 'Endeudado', min: -Infinity },
    { id: 1, name: 'Emprendedor', min: 0 },
    { id: 2, name: 'PyME', min: 1e6 },
    { id: 3, name: 'Empresario', min: 50e6 },
    { id: 4, name: 'Corporación', min: 1e9 },
    { id: 5, name: 'Magnate', min: 100e9 },
    { id: 6, name: 'Trillonario', min: 1e12 },
  ];

  // ------------------------------------------------------------------ CATÁLOGO
  // cat: staple|retail|tech|luxury|heavy|material   tier: raw|inter|final
  function buildProducts() {
    const P = {};
    const add = (id, o) => { P[id] = Object.assign({ id, inputs: [], obs: 0, payout: 0.3 }, o); };
    // materias primas
    add('grain',   { name: 'Grano',     industry: 'agro',   cat: 'material', tier: 'raw', elasticity: 0.5, refPrice: 0.6,  baseVarCost: 0.25, baseDemand: 400000, pe: 9 });
    add('cotton',  { name: 'Algodón',   industry: 'agro',   cat: 'material', tier: 'raw', elasticity: 0.7, refPrice: 4,    baseVarCost: 1.6,  baseDemand: 120000, pe: 9 });
    add('ironOre', { name: 'Mineral Fe',industry: 'mineria',cat: 'material', tier: 'raw', elasticity: 0.6, refPrice: 22,   baseVarCost: 9,    baseDemand: 60000,  pe: 8 });
    add('oil',     { name: 'Petróleo',  industry: 'energia',cat: 'material', tier: 'raw', elasticity: 0.5, refPrice: 70,   baseVarCost: 30,   baseDemand: 50000,  pe: 10 });
    add('silicon', { name: 'Silicio',   industry: 'mineria',cat: 'material', tier: 'raw', elasticity: 0.8, refPrice: 30,   baseVarCost: 12,   baseDemand: 35000,  pe: 11 });
    add('lumber',  { name: 'Madera',    industry: 'agro',   cat: 'material', tier: 'raw', elasticity: 0.7, refPrice: 14,   baseVarCost: 6,    baseDemand: 40000,  pe: 9 });
    // intermedios
    add('flour',   { name: 'Harina',    industry: 'alimentos', cat: 'material', tier: 'inter', elasticity: 0.6, refPrice: 1.2, baseVarCost: 0.4,  baseDemand: 220000, pe: 11, inputs: [['grain', 1]] });
    add('fabric',  { name: 'Tela',      industry: 'textil',    cat: 'material', tier: 'inter', elasticity: 0.9, refPrice: 8,   baseVarCost: 3,    baseDemand: 90000,  pe: 12, inputs: [['cotton', 1]] });
    add('steel',   { name: 'Acero',     industry: 'metal',     cat: 'material', tier: 'inter', elasticity: 0.7, refPrice: 60,  baseVarCost: 26,   baseDemand: 40000,  pe: 10, inputs: [['ironOre', 2]] });
    add('plastic', { name: 'Plástico',  industry: 'quimica',   cat: 'material', tier: 'inter', elasticity: 0.8, refPrice: 20,  baseVarCost: 8,    baseDemand: 50000,  pe: 11, inputs: [['oil', 0.2]] });
    add('chip',    { name: 'Chip',      industry: 'semis',     cat: 'tech',     tier: 'inter', elasticity: 1.3, refPrice: 80,  baseVarCost: 30,   baseDemand: 30000,  pe: 14, obs: 0.35, inputs: [['silicon', 1]] });
    add('comp',    { name: 'Componentes',industry: 'electronica',cat:'tech',    tier: 'inter', elasticity: 1.1, refPrice: 25,  baseVarCost: 9,    baseDemand: 70000,  pe: 15, obs: 0.15, inputs: [['plastic', 0.5], ['steel', 0.1]] });
    // finales
    add('bread',     { name: 'Pan',         industry: 'alimentos',  cat: 'staple', tier: 'final', elasticity: 0.5, refPrice: 3,     baseVarCost: 1.1,  baseDemand: 200000, pe: 12, inputs: [['flour', 0.5]] });
    add('packfood',  { name: 'Alimento env.',industry: 'alimentos', cat: 'staple', tier: 'final', elasticity: 0.7, refPrice: 6,     baseVarCost: 2.3,  baseDemand: 130000, pe: 14, inputs: [['flour', 0.4]] });
    add('clothing',  { name: 'Ropa',        industry: 'textil',     cat: 'retail', tier: 'final', elasticity: 1.0, refPrice: 40,    baseVarCost: 15,   baseDemand: 42000,  pe: 16, inputs: [['fabric', 1]] });
    add('furniture', { name: 'Muebles',     industry: 'muebles',    cat: 'retail', tier: 'final', elasticity: 1.1, refPrice: 300,   baseVarCost: 120,  baseDemand: 9000,   pe: 14, inputs: [['lumber', 2], ['fabric', 1]] });
    add('appliance', { name: 'Electrodom.', industry: 'electronica',cat: 'tech',   tier: 'final', elasticity: 1.2, refPrice: 500,   baseVarCost: 210,  baseDemand: 6000,   pe: 15, obs: 0.18, inputs: [['steel', 3], ['comp', 2]] });
    add('phone',     { name: 'Smartphone',  industry: 'tech',       cat: 'tech',   tier: 'final', elasticity: 1.5, refPrice: 600,   baseVarCost: 220,  baseDemand: 9000,   pe: 16, obs: 0.5,  inputs: [['chip', 1], ['comp', 2]], payout: 0.25 });
    add('laptop',    { name: 'Laptop',      industry: 'tech',       cat: 'tech',   tier: 'final', elasticity: 1.4, refPrice: 1100,  baseVarCost: 470,  baseDemand: 4200,   pe: 15, obs: 0.4,  inputs: [['chip', 2], ['comp', 3]], payout: 0.25 });
    add('car',       { name: 'Automóvil',   industry: 'automotriz', cat: 'luxury', tier: 'final', elasticity: 1.8, refPrice: 28000, baseVarCost: 13500,baseDemand: 160,    pe: 12, obs: 0.12, inputs: [['steel', 8], ['comp', 10], ['plastic', 5]] });
    add('watch',     { name: 'Reloj de lujo',industry: 'lujo',      cat: 'luxury', tier: 'final', elasticity: 2.0, refPrice: 5000,  baseVarCost: 1400, baseDemand: 800,    pe: 18, inputs: [['steel', 0.5]] });
    return P;
  }

  // industrias jugables (las que el jugador puede elegir al fundar empresa)
  const PLAYABLE = ['bread', 'packfood', 'clothing', 'furniture', 'appliance', 'phone', 'laptop', 'car', 'watch',
    'flour', 'fabric', 'steel', 'plastic', 'chip', 'comp', 'grain', 'cotton', 'ironOre', 'oil', 'silicon', 'lumber'];

  // productos sembrados con competidores IA al inicio
  const SEEDED = ['bread', 'packfood', 'clothing', 'furniture', 'appliance', 'phone', 'laptop', 'car', 'watch', 'steel', 'chip'];

  // ------------------------------------------------------------------ REGIONES
  function buildRegions() {
    return [
      { id: 'norte',    name: 'Distrito Norte',  population: 8.0e6, wealthIndex: 1.35, wageLevel: 1.30, landPrice: 1.4, landPrice0: 1.4, taxRate: 0.27, demandMod: { tech: 1.3, lujo: 1.4, automotriz: 1.2 } },
      { id: 'centro',   name: 'Capital Centro',  population: 12.0e6,wealthIndex: 1.15, wageLevel: 1.15, landPrice: 1.6, landPrice0: 1.6, taxRate: 0.25, demandMod: { retail: 1.2, alimentos: 1.15 } },
      { id: 'costa',    name: 'Costa Este',      population: 6.0e6, wealthIndex: 1.05, wageLevel: 1.00, landPrice: 1.0, landPrice0: 1.0, taxRate: 0.24, demandMod: { textil: 1.2, muebles: 1.2 } },
      { id: 'valle',    name: 'Valle Industrial',population: 5.0e6, wealthIndex: 0.85, wageLevel: 0.80, landPrice: 0.6, landPrice0: 0.6, taxRate: 0.20, demandMod: { metal: 1.3, automotriz: 1.2, electronica: 1.2 } },
      { id: 'sur',      name: 'Llanura Sur',     population: 4.0e6, wealthIndex: 0.75, wageLevel: 0.70, landPrice: 0.45,landPrice0: 0.45,taxRate: 0.18, demandMod: { agro: 1.4, alimentos: 1.2 } },
      { id: 'frontera', name: 'Frontera Oeste',  population: 3.0e6, wealthIndex: 0.70, wageLevel: 0.65, landPrice: 0.4, landPrice0: 0.4, taxRate: 0.16, demandMod: { mineria: 1.4, energia: 1.3 } },
    ];
  }

  // ------------------------------------------------------------------ TECH TREE
  function buildTech() {
    // branch A productos, B eficiencia, C automatización, D calidad/marca, E logística
    return [
      { id: 'eff1', name: 'Procesos Lean', branch: 'Eficiencia', cost: 1200, prereq: [], eff: { effBonus: 0.06 } },
      { id: 'eff2', name: 'Automatización ligera', branch: 'Eficiencia', cost: 3200, prereq: ['eff1'], eff: { effBonus: 0.06 } },
      { id: 'eff3', name: 'Manufactura avanzada', branch: 'Eficiencia', cost: 7000, prereq: ['eff2'], eff: { effBonus: 0.07 } },
      { id: 'qual1', name: 'Control de calidad', branch: 'Calidad', cost: 1400, prereq: [], eff: { ceiling: 2 } },
      { id: 'qual2', name: 'Materiales premium', branch: 'Calidad', cost: 3600, prereq: ['qual1'], eff: { ceiling: 3 } },
      { id: 'qual3', name: 'Ingeniería de producto', branch: 'Calidad', cost: 8000, prereq: ['qual2'], eff: { ceiling: 4 } },
      { id: 'auto1', name: 'Robótica de línea', branch: 'Automatización', cost: 4000, prereq: ['eff1'], eff: { labor: 0.18, fixed: 0.10 } },
      { id: 'auto2', name: 'Fábrica oscura', branch: 'Automatización', cost: 9000, prereq: ['auto1'], eff: { labor: 0.22, fixed: 0.12 } },
      { id: 'mkt1', name: 'Marca corporativa', branch: 'Marca', cost: 2000, prereq: [], eff: { mktBonus: 0.12 } },
      { id: 'mkt2', name: 'Marketing de datos', branch: 'Marca', cost: 5000, prereq: ['mkt1'], eff: { mktBonus: 0.14 } },
      { id: 'log1', name: 'Red logística', branch: 'Logística', cost: 2400, prereq: [], eff: { logi: 0.30 } },
      { id: 'log2', name: 'Cadena integrada', branch: 'Logística', cost: 6000, prereq: ['log1'], eff: { logi: 0.30, lead: 1 } },
      { id: 'prod1', name: 'I+D de producto', branch: 'Productos', cost: 3000, prereq: [], eff: { fresh: 1 } },
      { id: 'prod2', name: 'Patentes', branch: 'Productos', cost: 6500, prereq: ['prod1'], eff: { fresh: 1, patent: 1 } },
      { id: 'fin1', name: 'Tesorería avanzada', branch: 'Finanzas', cost: 4500, prereq: [], eff: { riskCut: 0.02 } },
    ];
  }

  // ---------------------------------------------------------------------- PRNG
  function rngNext(state) {
    let s = state.rng >>> 0;
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    state.rng = s;
    return s / 4294967296;
  }
  function rngRange(state, a, b) { return a + (b - a) * rngNext(state); }
  function rngInt(state, a, b) { return Math.floor(rngRange(state, a, b + 1)); }
  function pick(state, arr) { return arr[Math.floor(rngNext(state) * arr.length)]; }

  // ------------------------------------------------------------------- HELPERS
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const fin = (x, d) => (Number.isFinite(x) ? x : (d || 0));
  function pushLog(state, msg, kind) {
    state.log.unshift({ tick: state.tick, msg, kind: kind || 'info' });
    if (state.log.length > 80) state.log.length = 80;
  }
  let _idc = 1;
  function uid(prefix) { return prefix + '_' + (_idc++); }
  // costo semanal del seguro: escala con la exposición (empresas + inmuebles + patrimonio)
  function insuranceCostFor(state) {
    return (600 + state.companies.length * 700 + state.realEstate.length * 350 + Math.max(0, state.player.netWorth) * 0.00008) * state.macro.inflationIndex;
  }
  // aplica una pérdida de cash de un evento; el seguro reduce el golpe un 60%
  function applyHit(state, amount) {
    const reduced = state.player.insured ? amount * 0.4 : amount;
    state.player.cash -= reduced;
    return reduced;
  }

  // --------------------------------------------------------------- COMPETIDORES
  const COMP_NAMES = {
    bread: ['PanRey', 'MoliSur', 'Doradito'], packfood: ['NutriPack', 'ValleVerde', 'ConservaMax'],
    clothing: ['UrbanHilo', 'ModaPlena', 'TelarCo'], furniture: ['CasaRoble', 'ErgoHogar', 'MaderaViva'],
    appliance: ['FríoNorte', 'ElectroVida', 'HogarTec'], phone: ['NimboCell', 'Pixela', 'OrbiMóvil'],
    laptop: ['NeoBook', 'TitanPC', 'LumenLap'], car: ['Velocar', 'RutaMotriz', 'AndinAuto'],
    watch: ['CronoLux', 'Aurea', 'Régent'], steel: ['AceroPlus', 'FerroNova'], chip: ['SiliCore', 'NanoFab'],
  };
  const PROFILES = ['aggressive', 'premium', 'efficient', 'expansionist'];

  function makeCompetitor(state, productId, idx) {
    const p = state.products[productId];
    const names = COMP_NAMES[productId] || [productId + ' Co'];
    const name = names[idx % names.length] || (productId + ' #' + idx);
    const profile = PROFILES[(idx + productId.length) % PROFILES.length];
    const region = pick(state, state.regions).id;
    // markup inicial según perfil
    let markup = profile === 'premium' ? 0.9 : profile === 'aggressive' ? 0.22 : profile === 'efficient' ? 0.4 : 0.55;
    const fixedCost = p.baseDemand * 0.0008 * p.refPrice * rngRange(state, 0.8, 1.2);
    const capacity = p.baseDemand * 0.2 * rngRange(state, 0.7, 1.3);
    const so = Math.round(rngRange(state, 5e6, 5e7));
    const ticker = (name.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4) + idx);
    const qLevel = profile === 'premium' ? rngRange(state, 4, 6) : rngRange(state, 1, 3);
    return {
      id: uid('cmp'), name, productId, region, profile,
      markup, price: p.refPrice * rngRange(state, 0.85, 1.15),
      capacity, fixedCost,
      qualityLevel: qLevel, qualityCeiling: 6 + (p.cat === 'tech' ? 6 : 2),
      brandStrength: profile === 'premium' ? rngRange(state, 0.4, 0.7) : rngRange(state, 0.1, 0.4),
      marketingBudget: fixedCost * rngRange(state, 0.2, 0.6),
      rndBudget: (p.cat === 'tech' || profile === 'premium' || profile === 'efficient') ? fixedCost * rngRange(state, 0.1, 0.4) : 0,
      techEff: 0, fresh: 1, cash: fixedCost * 30,
      marketShare: 0.3, lastSold: 0, lastDemand: 0,
      // estimación realista de ganancias de régimen (unidades≈share·demanda · margen≈20% · anual)
      profitHist: [], annualEarnings: p.baseDemand * 0.3 * p.refPrice * 0.2 * 52,
      targetShare: profile === 'aggressive' ? 0.4 : profile === 'expansionist' ? 0.35 : 0.28,
      sharesOutstanding: so, public: true, ticker, beta: p.cat === 'luxury' || p.cat === 'tech' ? 1.4 : p.cat === 'staple' ? 0.6 : 1.0,
      dead: false, age: 0,
    };
  }

  // costo de insumos (mayorista) por unidad de productId. vertical reduce 30%.
  function inputCost(state, productId, vertical) {
    const p = state.products[productId];
    let c = 0;
    for (const [inId, qty] of p.inputs) {
      const m = state.markets[inId];
      const wholesale = (m ? m.referencePrice : state.products[inId].refPrice) * 1.1;
      c += wholesale * qty;
    }
    // energía/combustible encarece insumos de industrias pesadas
    if (p.cat === 'heavy' || p.industry === 'automotriz') c *= state.macro.fuelIndex;
    return vertical ? c * 0.7 : c;
  }

  // ------------------------------------------------------------ ESTADO INICIAL
  function createInitialState(config) {
    config = config || {};
    const seed = (config.seed != null ? config.seed : 12345) >>> 0;
    const state = {
      seed, rng: seed, tick: 0, gameOver: false, won: false, bankrupt: false, stage: 0,
      player: {
        cash: config.startCash != null ? config.startCash : C.START_CASH,
        creditScore: C.START_SCORE,
        scoreFactors: { payment: 0.60, util: 0.9, age: 0, mix: 0.2, inquiries: 1 },
        inquiries: [], loans: [], studentLoanId: null,
        stocks: {}, shorts: [], taxCarryForward: 0, quarterProfitAccum: 0, lastTaxTick: 0,
        insolventStreak: 0, netWorth: 0, realNetWorth: 0, ownedProperties: 0,
        liquidationsBlocked: false, insured: false,
      },
      companies: [], products: buildProducts(), markets: {}, regions: buildRegions(),
      competitors: [], stocks: {}, realEstate: [],
      macro: {
        inflationIndex: 1.0, annualInflation: C.BASE_INFLATION, interestRate: 0.06,
        cyclePhase: 0, cycleLen: C.CYCLE_LEN, cycleAmp: C.CYCLE_AMP,
        stockIndex: 1000, reIndex: 1.0, fuelIndex: 1.0,
      },
      tech: { unlocked: [], project: null, points: 0, effBonus: 0, ceilingBonus: 0, laborBonus: 0, fixedPenalty: 0, mktBonus: 0, logiBonus: 0, leadCut: 0, freshBonus: 0, patent: false, riskCut: 0 },
      event: { active: null, cooldown: 4 },
      milestones: {}, history: [], log: [], techTree: buildTech(),
      _quarterProfit: 0,
    };
    // mercados
    for (const id in state.products) {
      const p = state.products[id];
      state.markets[id] = { productId: id, referencePrice: p.refPrice, baseDemand: p.baseDemand, lastClearingPrice: p.refPrice, lastTotalDemand: p.baseDemand };
    }
    // competidores sembrados
    for (const pid of SEEDED) {
      const n = pid === 'car' || pid === 'watch' ? 2 : 3;
      for (let i = 0; i < n; i++) state.competitors.push(makeCompetitor(state, pid, i));
    }
    rebuildStocks(state);
    // deuda estudiantil
    const sl = makeLoan(state, C.STUDENT_DEBT, 'student', C.STUDENT_TERM, C.STUDENT_RATE);
    state.player.loans.push(sl);
    state.player.studentLoanId = sl.id;
    pushLog(state, 'Arrancás con USD ' + C.STUDENT_DEBT.toLocaleString('en') + ' de deuda estudiantil. Tu objetivo: ser trillonario.', 'info');
    recomputeNetWorth(state);
    pushHistory(state);
    return state;
  }

  function rebuildStocks(state) {
    for (const c of state.competitors) {
      if (c.dead || !c.public) continue;
      if (!state.stocks[c.ticker]) {
        const p = state.products[c.productId];
        const val = competitorValue(state, c);
        const price0 = C.STOCK_INIT_PRICE;
        const so = Math.max(1e5, Math.round(val / price0));
        c.sharesOutstanding = so;
        state.stocks[c.ticker] = {
          ticker: c.ticker, kind: 'comp', refId: c.id, productId: c.productId,
          sharesOutstanding: so, price: price0,
          dividendPerShareYear: 0, beta: c.beta, eps: 0, book: 0, peMult: p.pe,
        };
      }
    }
  }

  // ----------------------------------------------------------------- PRÉSTAMOS
  function riskPremium(score) {
    // score 800 -> ~0.01 ; score 400 -> ~0.18 ; lineal-ish inverso
    const t = clamp((850 - score) / 450, 0, 1);
    return 0.01 + 0.17 * t * t; // convexa: malos scores pagan mucho más
  }
  function typeSpread(type) {
    return ({ personal: 0.03, business: 0.02, mortgage: 0.01, lineOfCredit: 0.035, student: 0.0 })[type] || 0.02;
  }
  function loanRateFor(state, type) {
    const r = state.macro.interestRate + riskPremium(state.player.creditScore) + typeSpread(type) - state.tech.riskCut;
    // piso 5.5% > tope de dividend yield (4.5%) y > cashYield: no-arbitraje duro
    return Math.max(0.055, r);
  }
  function makeLoan(state, principal, type, termTicks, forcedRate) {
    const annualRate = forcedRate != null ? forcedRate : loanRateFor(state, type);
    const r = annualRate / 52;
    const pay = r <= 0 ? principal / termTicks : principal * r / (1 - Math.pow(1 + r, -termTicks));
    return { id: uid('loan'), principal, balance: principal, annualRate, termTicks, ageTicks: 0, paymentPerTick: pay, missed: 0, type };
  }
  function totalDebt(state) {
    let d = 0; for (const l of state.player.loans) d += l.balance; return d;
  }
  function creditLimit(state) {
    const nw = Math.max(0, state.player.netWorth);
    const scoreBonus = (state.player.creditScore - 300) / 550 * 80000;
    return C.BASE_CREDIT_LIMIT + nw * 0.5 + scoreBonus;
  }

  // -------------------------------------------------------------- VALUACIÓN
  function factoryCapacity(p) { return Math.max(10, p.baseDemand * 0.1); }
  function factoryCost(p, region) { return Math.max(4000, factoryCapacity(p) * p.refPrice * 0.2 * region.landPrice); }
  function regionDistance(state, a, b) {
    if (a === b) return 0;
    const ia = state.regions.findIndex(r => r.id === a), ib = state.regions.findIndex(r => r.id === b);
    if (ia < 0 || ib < 0) return 0.5;
    return clamp(0.3 + 0.12 * Math.abs(ia - ib), 0, 1.3);
  }
  function companyAssets(state, co) {
    let a = 0;
    for (const f of co.factories) a += (f.cost != null ? f.cost : f.capacity * 4) * f.condition; // valor de libro
    a += co.inventory * (state.products[co.productId].baseVarCost * state.macro.inflationIndex);
    return a;
  }
  function avgAnnualProfit(co) {
    if (!co.profitHistory.length) return 0;
    const w = co.profitHistory.slice(-52);
    const sum = w.reduce((s, x) => s + x, 0);
    // denominador mínimo de 52: una empresa joven no anualiza pocas semanas buenas
    return sum / Math.max(w.length, 52) * 52;
  }
  function companyValue(state, co) {
    const p = state.products[co.productId];
    const macroMult = 1 + 0.5 * state.macro.cyclePhase;
    const earn = avgAnnualProfit(co);
    const mult = p.pe * macroMult;
    const assets = companyAssets(state, co);
    const brandVal = co.brandStrength * p.refPrice * p.baseDemand * 0.01;
    const v = Math.max(assets, earn * mult + assets + brandVal);
    return Math.max(0, fin(v, 0));
  }
  function competitorValue(state, c) {
    const p = state.products[c.productId];
    const macroMult = 1 + 0.5 * state.macro.cyclePhase;
    const assets = c.capacity * 8 + Math.max(0, c.cash);
    const brandVal = c.brandStrength * p.refPrice * p.baseDemand * 0.01;
    const v = Math.max(assets, c.annualEarnings * p.pe * macroMult + assets + brandVal);
    return Math.max(0, fin(v, 0));
  }

  // -------------------------------------------------------------- NET WORTH
  function recomputeNetWorth(state) {
    const pl = state.player;
    let nw = pl.cash;
    for (const co of state.companies) nw += companyValue(state, co) * (1 - (co.floatPct || 0));
    for (const t in pl.stocks) { const s = state.stocks[t]; if (s) nw += pl.stocks[t] * s.price; }
    for (const sh of pl.shorts) { const s = state.stocks[sh.ticker]; if (s) nw -= sh.shares * s.price; } // pasivo: acciones que debés
    for (const pr of state.realEstate) nw += pr.currentValue;
    for (const co of state.companies) nw += co.inventory * state.products[co.productId].baseVarCost * state.macro.inflationIndex;
    nw -= totalDebt(state);
    pl.netWorth = fin(nw, 0);
    pl.realNetWorth = pl.netWorth / state.macro.inflationIndex;
    // etapa
    let st = 0; for (const s of STAGES) if (pl.netWorth >= s.min) st = s.id;
    state.stage = st;
    return pl.netWorth;
  }

  function pushHistory(state) {
    state.history.push({
      tick: state.tick, cash: Math.round(state.player.cash), netWorth: Math.round(state.player.netWorth),
      real: Math.round(state.player.realNetWorth), score: Math.round(state.player.creditScore),
      infl: +(state.macro.annualInflation).toFixed(4), rate: +(state.macro.interestRate).toFixed(4),
      stockIndex: Math.round(state.macro.stockIndex),
    });
    if (state.history.length > 1200) state.history.shift();
  }

  // ============================================================= TICK
  function tick(state) {
    if (state.gameOver) return state;
    if (state.event.active) return state; // tiempo pausado hasta resolver evento
    state.tick++;
    state._quarterProfit = 0;

    stepMacro(state);                 // 1
    const resolved = stepDemand(state); // 2
    stepSales(state, resolved);        // 3
    stepProduction(state, resolved);   // 4
    stepCompetitorAI(state, resolved); // 5
    stepFinance(state);                // 6
    stepResearch(state);               // 7
    stepCapitalMarkets(state);         // 8
    stepCredit(state);                 // 9
    maybeEvent(state);                 // 10
    stepClose(state);                  // 11
    return state;
  }

  // 1 -------------------------------------------------------------- MACRO
  function stepMacro(state) {
    const m = state.macro;
    // ruido lento sobre len/amp (seedeado, suave)
    m.cycleLen = clamp(m.cycleLen + (rngNext(state) - 0.5) * 0.5, 200, 340);
    m.cycleAmp = clamp(m.cycleAmp + (rngNext(state) - 0.5) * 0.002, 0.15, 0.30);
    m.cyclePhase = Math.sin(2 * Math.PI * state.tick / m.cycleLen);
    const phase = m.cyclePhase;
    // inflación
    const cycleBonus = 0.02 * phase;
    m.annualInflation = clamp(C.BASE_INFLATION + cycleBonus + (rngNext(state) - 0.5) * 0.004, -0.01, 0.12);
    m.inflationIndex *= (1 + m.annualInflation / 52);
    // tasa (Taylor)
    const target = C.NEUTRAL_RATE + 1.5 * (m.annualInflation - C.INFL_TARGET) + 0.5 * phase * 0.05;
    m.interestRate += (target - m.interestRate) * C.RATE_SMOOTH;
    m.interestRate = clamp(m.interestRate, 0.005, 0.25);
    // combustible/energía sigue al petróleo + ruido
    const oilM = state.markets['oil'];
    m.fuelIndex = clamp(0.6 + 0.4 * (oilM.referencePrice / state.products['oil'].refPrice) + (rngNext(state) - 0.5) * 0.02, 0.6, 2.5);
    // drift de precios de referencia con inflación
    for (const id in state.markets) state.markets[id].referencePrice *= (1 + m.annualInflation / 52);
    // precios inmobiliarios regionales: macro + presión de construcción
    for (const r of state.regions) {
      const macroPush = (1 + 0.15 * phase);
      r.landPrice += (r.landPrice0 * macroPush - r.landPrice) * 0.02;
      r.landPrice = clamp(r.landPrice, r.landPrice0 * 0.5, r.landPrice0 * 2.5);
    }
    m.reIndex = state.regions.reduce((s, r) => s + r.landPrice / r.landPrice0, 0) / state.regions.length;
  }

  function macroMult(state) { return 1 + state.macro.cycleAmp * state.macro.cyclePhase; }

  // 2 -------------------------------------------------------------- DEMANDA
  function regionMod(state, regionId, industry) {
    const r = state.regions.find(x => x.id === regionId);
    if (!r) return 1;
    return (0.7 + 0.3 * r.wealthIndex) * (r.demandMod[industry] || 1) * (0.85 + 0.15 * r.population / C.REF_POP);
  }
  function mktMultiplier(spend, bonus) {
    const eff = C.MKT_MAX * spend / (spend + C.MKT_HALFSAT);
    return 1 + eff * (1 + (bonus || 0));
  }
  function sellerAttr(state, s) {
    const qFactor = 1 + 0.15 * s.qualityLevel * s.fresh;
    const bFactor = 0.3 + s.brandStrength;
    const mFactor = mktMultiplier(s.marketingBudget, s.isPlayer ? state.tech.mktBonus : 0);
    const rMod = regionMod(state, s.region, state.products[s.productId].industry);
    const price = Math.max(s.price, 0.01);
    let A = Math.pow(qFactor, C.ATTR_A) * Math.pow(bFactor, C.ATTR_C) * mFactor * rMod / Math.pow(price, C.ATTR_B);
    // precio de reserva: la demanda colapsa cuando el precio supera ~2× la referencia
    const ref = state.markets[s.productId] ? state.markets[s.productId].referencePrice : state.products[s.productId].refPrice;
    const ratio = price / Math.max(ref, 0.01);
    if (ratio > 2) A /= (1 + 3 * (ratio - 2) * (ratio - 2));
    return Math.max(A, 1e-12);
  }

  function stepDemand(state) {
    const resolved = {}; // productId -> { sellers:[{ref,isPlayer,A,share,demand,price}], totalDemand }
    const byProduct = {};
    for (const c of state.competitors) {
      if (c.dead) continue;
      (byProduct[c.productId] = byProduct[c.productId] || []).push({ ref: c, isPlayer: false, productId: c.productId, price: c.price, qualityLevel: c.qualityLevel, fresh: c.fresh, brandStrength: c.brandStrength, marketingBudget: c.marketingBudget, region: c.region, qualityCeiling: c.qualityCeiling });
    }
    for (const co of state.companies) {
      (byProduct[co.productId] = byProduct[co.productId] || []).push({ ref: co, isPlayer: true, productId: co.productId, price: co.price, qualityLevel: co.qualityLevel, fresh: co.fresh, brandStrength: co.brandStrength, marketingBudget: co.marketingBudget, region: co.region, qualityCeiling: co.qualityCeiling });
    }
    const mm = macroMult(state);
    for (const pid in byProduct) {
      const sellers = byProduct[pid];
      const market = state.markets[pid];
      const product = state.products[pid];
      let sumA = 0;
      for (const s of sellers) { s.A = sellerAttr(state, s); sumA += s.A; }
      let indexPrice = 0, avgQual = 0, avgMkt = 0;
      for (const s of sellers) {
        s.share = s.A / sumA;
        indexPrice += s.share * s.price;
        avgQual += s.share * (1 + C.QUAL_W * clamp(s.qualityLevel / Math.max(s.qualityCeiling, 1), 0, 1));
        avgMkt += s.share * mktMultiplier(s.marketingBudget, s.isPlayer ? state.tech.mktBonus : 0);
      }
      let totalDemand = market.baseDemand * Math.pow(indexPrice / market.referencePrice, -product.elasticity) * avgQual * avgMkt * mm;
      totalDemand = clamp(fin(totalDemand, 0), 0, market.baseDemand * 8);
      for (const s of sellers) s.demand = totalDemand * s.share;
      market.lastClearingPrice = indexPrice;
      market.lastTotalDemand = totalDemand;
      resolved[pid] = { sellers, totalDemand, indexPrice };
    }
    return resolved;
  }

  // 3 -------------------------------------------------------------- VENTAS
  function stepSales(state, resolved) {
    for (const pid in resolved) {
      for (const s of resolved[pid].sellers) {
        if (s.isPlayer) {
          const co = s.ref;
          const sold = Math.min(s.demand, co.inventory);
          co.inventory -= sold;
          const revenue = sold * co.price;
          co.lastUnitsSold = sold; co.lastRevenue = revenue; co.marketShare = s.share;
          co._revenueThisTick = revenue;
        } else {
          const c = s.ref;
          const sold = Math.min(s.demand, c.capacity);
          c.lastSold = sold; c.lastDemand = s.demand; c.marketShare = s.share;
        }
      }
    }
  }

  // 4 -------------------------------------------------------------- PRODUCCIÓN
  function requiredStaff(co) {
    let cap = 0; for (const f of co.factories) cap += f.capacity * f.condition;
    return cap / C.STAFF_PER_CAP;
  }
  function effectiveCapacity(co) {
    let cap = 0; for (const f of co.factories) cap += f.capacity * f.condition;
    const e = co.employees;
    const req = Math.max(cap / C.STAFF_PER_CAP, 0.0001);
    const staffRatio = clamp(e.count / req, 0, 1.2);
    const laborFactor = Math.min(staffRatio, 1) * (0.5 + 0.5 * e.avgSkill) * (0.6 + 0.4 * e.morale);
    let f = cap * laborFactor;
    if (co._integrationTicks > 0) f *= 0.7; // costo de integración: productividad reducida unas semanas
    return f;
  }
  function stepProduction(state, resolved) {
    const m = state.macro;
    for (const co of state.companies) {
      const p = state.products[co.productId];
      const capEff = effectiveCapacity(co);
      const ic = inputCost(state, co.productId, co.vertical);
      // demanda resuelta de esta empresa (sin límite de inventario)
      let demand = co.lastUnitsSold;
      const rp = resolved[co.productId];
      if (rp) { const si = rp.sellers.find(x => x.isPlayer && x.ref === co); if (si) demand = si.demand; }
      const scaleFactor = clamp(1 - C.SCALE_K * Math.min(co.productionTarget, capEff), C.SCALE_MIN, 1);
      const effTech = clamp(state.tech.effBonus, 0, 0.35);
      // perfil geográfico de producción: salario y distancia ponderados por capacidad de cada fábrica
      let totCap = 0, wWage = 0, wDist = 0;
      for (const f of co.factories) { const fr = f.region || co.region; const rr = state.regions.find(r => r.id === fr) || { wageLevel: 1 }; totCap += f.capacity; wWage += f.capacity * rr.wageLevel; wDist += f.capacity * regionDistance(state, fr, co.region); }
      const avgWage = totCap ? wWage / totCap : 1;
      const avgDist = totCap ? wDist / totCap : 0;
      // producir en regiones de salario bajo abarata; producir lejos del mercado encarece logística
      const varCostEff = (p.baseVarCost * m.inflationIndex + ic) * scaleFactor * (1 - effTech) * (0.85 + 0.15 * avgWage);
      const logiCost = varCostEff * (0.02 + 0.06 * avgDist) * m.fuelIndex * (1 - clamp(state.tech.logiBonus, 0, 0.6));
      const unitCostFull = varCostEff + logiCost;
      // make-to-demand: producir para cubrir demanda + buffer 1.5 sem, capeado por target y capacidad
      const desiredInv = demand * 1.5;
      const need = Math.max(0, desiredInv - co.inventory) + demand;
      let units = Math.max(0, Math.min(co.productionTarget, capEff, need));
      units = fin(units, 0);
      const fixedCost = co.factories.reduce((s, f) => s + f.fixedCostPerTick, 0) * m.inflationIndex * (1 + clamp(state.tech.fixedPenalty, 0, 0.5));
      const prodCost = fixedCost + unitCostFull * units;
      co.inventory += units;
      co.lastUnitCost = unitCostFull;
      // holding
      const holdingCost = co.inventory * p.refPrice * C.STORAGE_FRAC * m.inflationIndex;
      // RRHH
      const e = co.employees;
      const region = state.regions.find(r => r.id === co.region) || { wageLevel: 1 };
      const salaries = e.count * e.avgWage; // nominal: lo que el jugador efectivamente paga
      const marketWage = C.BASE_WAGE * region.wageLevel * m.inflationIndex;
      const wageRatio = e.avgWage / Math.max(marketWage, 1);
      const moraleTarget = clamp(0.4 + 0.6 * (wageRatio - 0.9), 0.1, 1) * (state.player.cash < -10000 ? 0.7 : 1);
      e.morale += (moraleTarget - e.morale) * 0.1;
      e.morale = clamp(e.morale, 0.05, 1);
      if (e.morale < 0.4) e.avgSkill = clamp(e.avgSkill - 0.003, 0.1, 1); // rotación
      const marketing = co.marketingBudget;
      const rnd = co.rndBudget;
      const revenue = co._revenueThisTick || 0;
      const contribution = revenue - prodCost - holdingCost - salaries - marketing - rnd;
      co.cashContribution = fin(contribution, 0);
      state.player.cash += co.cashContribution;
      state._quarterProfit += co.cashContribution;
      // marca
      const eff = C.MKT_MAX * marketing / (marketing + C.MKT_HALFSAT);
      co.brandStrength = clamp(co.brandStrength + eff * 0.02 - C.BRAND_DECAY, 0, 1);
      // obsolescencia (tech/luxury): fresh decae salvo I+D de producto
      if (p.obs > 0) {
        co.fresh = clamp(co.fresh - p.obs / 52 + state.tech.freshBonus * 0.0, 0.35, 1);
      }
      // historial de ganancias
      co.profitHistory.push(co.cashContribution);
      if (co.profitHistory.length > 60) co.profitHistory.shift();
      co._revenueThisTick = 0;
      if (co._integrationTicks > 0) co._integrationTicks--;
    }
  }

  // 5 ----------------------------------------------------------- COMPETIDOR IA
  function stepCompetitorAI(state, resolved) {
    const m = state.macro;
    for (const c of state.competitors) {
      if (c.dead) continue;
      c.age++;
      const p = state.products[c.productId];
      const ic = inputCost(state, c.productId, false);
      const unitCost = (p.baseVarCost * m.inflationIndex + ic) * (1 - c.techEff);
      const revenue = c.lastSold * c.price;
      const fixedCost = c.fixedCost * m.inflationIndex;
      const cost = fixedCost + unitCost * c.lastSold + c.marketingBudget + c.rndBudget;
      const profit = revenue - cost;
      c.cash += profit;
      c.profitHist.push(profit); if (c.profitHist.length > 52) c.profitHist.shift();
      c.annualEarnings = c.profitHist.reduce((s, x) => s + x, 0) / c.profitHist.length * 52;
      // ajuste de markup suavizado hacia target share
      if (c.marketShare < c.targetShare) c.markup -= 0.004; else c.markup += 0.003;
      const margin = c.price > 0 ? (c.price - unitCost) / c.price : 0;
      const minMargin = c.profile === 'aggressive' ? 0.05 : c.profile === 'premium' ? 0.30 : 0.12;
      if (margin < minMargin) c.markup += 0.006;
      c.markup = clamp(c.markup, 0.04, 1.6);
      const floor = unitCost * 1.03, ceil = p.refPrice * 3;
      const desired = clamp(unitCost * (1 + c.markup), floor, ceil);
      c.price += (desired - c.price) * 0.15;
      c.price = clamp(c.price, floor, ceil);
      // inversión / expansión según perfil y caja
      if (c.lastDemand > c.capacity * 0.92 && c.cash > fixedCost * 25) {
        const expand = c.capacity * 0.025;
        c.capacity += expand; c.cash -= expand * 6;
      }
      if ((c.profile === 'premium' || c.profile === 'efficient') && c.cash > fixedCost * 20) {
        if (c.qualityLevel < c.qualityCeiling) { c.qualityLevel += 0.02; c.cash -= fixedCost * 0.1; }
        c.techEff = clamp(c.techEff + 0.0006, 0, 0.30);
      }
      if (c.profile === 'aggressive') c.targetShare = clamp(c.targetShare + 0.0005, 0.2, 0.5);
      c.brandStrength = clamp(c.brandStrength + (c.marketingBudget > 0 ? 0.003 : -0.002), 0.05, 0.95);
      c.fresh = clamp(c.fresh - (p.obs > 0 ? p.obs / 52 : 0) + (c.rndBudget > 0 ? 0.01 : 0), 0.4, 1);
      // límite de dolor: retiro de guerra de precios
      if (c.cash < -fixedCost * 18) {
        if (c.markup < 0.5) { c.markup += 0.05; } // sube precio, deja de pelear
        if (c.cash < -fixedCost * 40) { c.dead = true; pushLog(state, c.name + ' quebró y abandonó el mercado de ' + p.name + '.', 'warn'); }
      }
      // acotar caja (dividendos/reinversión) → nunca cash infinito
      const cap = fixedCost * 60;
      if (c.cash > cap) c.cash = cap;
    }
    // ENTRADA de nuevos competidores en mercados rentables y poco saturados
    if (state.tick % 13 === 0) {
      for (const pid of SEEDED.concat(['flour', 'fabric', 'plastic', 'comp'])) {
        const market = state.markets[pid];
        const alive = state.competitors.filter(c => c.productId === pid && !c.dead).length;
        const playerHere = state.companies.some(co => co.productId === pid);
        const margin = (market.lastClearingPrice - state.products[pid].baseVarCost * state.macro.inflationIndex) / Math.max(market.lastClearingPrice, 1);
        if (alive < 5 && margin > 0.45 && rngNext(state) < 0.4) {
          const c = makeCompetitor(state, pid, alive + rngInt(state, 0, 5));
          c.cash = c.fixedCost * 25;
          state.competitors.push(c);
          if (playerHere) pushLog(state, 'Nuevo competidor ' + c.name + ' entró al mercado de ' + state.products[pid].name + '.', 'warn');
        }
      }
      rebuildStocks(state);
    }
  }

  // 6 -------------------------------------------------------------- FINANZAS
  function stepFinance(state) {
    const pl = state.player;
    // costo de complejidad: administrar muchas empresas escala super-lineal (la fricción
    // crece con el tamaño del imperio). El primer negocio no paga overhead.
    if (state.companies.length > 1) {
      const overhead = 1500 * Math.pow(state.companies.length - 1, 1.5) * state.macro.inflationIndex;
      pl.cash -= overhead; state._quarterProfit -= overhead;
    }
    // intereses + amortización de préstamos
    for (let i = pl.loans.length - 1; i >= 0; i--) {
      const l = pl.loans[i];
      l.ageTicks++;
      const r = l.annualRate / 52;
      const interest = l.balance * r;
      if (pl.cash >= l.paymentPerTick) {
        l.balance = l.balance + interest - l.paymentPerTick;
        pl.cash -= l.paymentPerTick;
        state._quarterProfit -= (l.paymentPerTick - (l.paymentPerTick - interest)); // interés cuenta como gasto
        l.missed = 0;
        // pago puntual sube payment factor
        pl.scoreFactors.payment = clamp(pl.scoreFactors.payment + 0.012, 0, 1);
        if (l.balance <= 0.5) {
          pushLog(state, 'Préstamo saldado (' + l.type + ').', 'good');
          if (l.id === pl.studentLoanId) { pl.studentLoanId = null; awardMilestone(state, 'paidStudent', 'Pagaste tu deuda estudiantil.'); }
          pl.loans.splice(i, 1);
        }
      } else {
        l.missed++;
        l.balance += interest; // se capitaliza
        const pen = Math.min(0.12, 0.05 + 0.02 * l.missed);
        pl.scoreFactors.payment = clamp(pl.scoreFactors.payment - pen, 0, 1);
        state._quarterProfit -= interest;
        if (l.missed === 1) pushLog(state, 'Cuota impaga (' + l.type + '). El interés se capitaliza y tu score baja gradualmente.', 'warn');
      }
    }
    // prima de seguro (sumidero constante; mitiga eventos negativos)
    if (pl.insured) { const ic = insuranceCostFor(state); pl.cash -= ic; state._quarterProfit -= ic; }
    // interés sobre cash positivo
    const cashInt = Math.max(pl.cash, 0) * (C.CASH_YIELD / 52);
    pl.cash += cashInt; state._quarterProfit += cashInt;
    // dividendos
    let div = 0;
    for (const t in pl.stocks) { const s = state.stocks[t]; if (s) div += pl.stocks[t] * s.dividendPerShareYear / 52; }
    pl.cash += div; state._quarterProfit += div;
    // inmuebles: alquileres y mantenimiento
    for (const pr of state.realEstate) {
      const income = pr.rentPerTick * pr.occupancy;
      pl.cash += income; pl.cash -= pr.maintenancePerTick;
      state._quarterProfit += income - pr.maintenancePerTick;
    }
    // impuestos trimestrales
    if (state.tick - pl.lastTaxTick >= C.TAX_PERIOD) {
      let taxable = state._quarterProfitCumulative = (state._quarterProfitCumulative || 0);
    }
    pl.quarterProfitAccum += state._quarterProfit;
    if (state.tick % C.TAX_PERIOD === 0) {
      let profit = pl.quarterProfitAccum;
      if (profit > 0) {
        const offset = Math.min(profit, pl.taxCarryForward);
        profit -= offset; pl.taxCarryForward -= offset;
        const tax = profit * C.TAX_RATE;
        pl.cash -= tax;
        if (tax > 0) pushLog(state, 'Impuestos del trimestre: USD ' + Math.round(tax).toLocaleString('en'), 'info');
      } else {
        pl.taxCarryForward += -profit;
      }
      pl.quarterProfitAccum = 0;
      pl.lastTaxTick = state.tick;
    }
  }

  // 7 -------------------------------------------------------------- I+D
  function stepResearch(state) {
    const tech = state.tech;
    let totalRnd = 0, skillSum = 0, n = 0;
    for (const co of state.companies) { totalRnd += co.rndBudget; skillSum += co.employees.avgSkill; n++; }
    if (totalRnd <= 0 || !tech.project) return;
    const avgSkill = n ? skillSum / n : 0.5;
    const pts = C.RES_MAX * totalRnd / (totalRnd + C.RES_HALFSAT) * (0.5 + 0.5 * avgSkill) * 52;
    tech.points += pts;
    const node = state.techTree.find(t => t.id === tech.project);
    if (node && tech.points >= node.cost) {
      tech.points -= node.cost;
      unlockTech(state, node);
      tech.project = null;
    }
  }
  function unlockTech(state, node) {
    const tech = state.tech;
    if (tech.unlocked.includes(node.id)) return;
    tech.unlocked.push(node.id);
    const e = node.eff;
    if (e.effBonus) tech.effBonus = clamp(tech.effBonus + e.effBonus, 0, 0.32);
    if (e.ceiling) tech.ceilingBonus += e.ceiling;
    if (e.labor) tech.laborBonus = clamp(tech.laborBonus + e.labor, 0, 0.5);
    if (e.fixed) tech.fixedPenalty = clamp(tech.fixedPenalty + e.fixed, 0, 0.5);
    if (e.mktBonus) tech.mktBonus = clamp(tech.mktBonus + e.mktBonus, 0, 0.6);
    if (e.logi) tech.logiBonus = clamp(tech.logiBonus + e.logi, 0, 0.7);
    if (e.lead) tech.leadCut += e.lead;
    if (e.fresh) tech.freshBonus += e.fresh;
    if (e.patent) tech.patent = true;
    if (e.riskCut) tech.riskCut = clamp(tech.riskCut + e.riskCut, 0, 0.05);
    // aplicar techo de calidad a empresas
    if (e.ceiling) for (const co of state.companies) co.qualityCeiling += e.ceiling;
    // automatización reduce empleados necesarios (sube capacidad por empleado)
    pushLog(state, 'I+D completada: ' + node.name + '.', 'good');
  }

  // 8 ------------------------------------------------------ MERCADO DE CAPITALES
  function updateStockFromEntity(state, s) {
    const macroMultV = 1 + 0.6 * state.macro.cyclePhase - (state.macro.interestRate - 0.05) * 2;
    let earnings, assets, payout;
    const p = state.products[s.productId];
    if (s.kind === 'comp') {
      const c = state.competitors.find(x => x.id === s.refId);
      if (!c || c.dead) { s.dead = true; return; }
      earnings = c.annualEarnings; assets = c.capacity * 8 + Math.max(0, c.cash); payout = p.payout;
      s.sharesOutstanding = c.sharesOutstanding;
    } else {
      const co = state.companies.find(x => x.id === s.refId);
      if (!co) { s.dead = true; return; }
      earnings = avgAnnualProfit(co); assets = companyAssets(state, co); payout = p.payout;
    }
    s.eps = earnings / s.sharesOutstanding;
    s.book = assets / s.sharesOutstanding;
    const peMult = Math.max(4, p.pe * clamp(macroMultV, 0.4, 1.8));
    s.peMult = peMult;
    const fundamental = Math.max(0.01, s.eps * peMult + s.book * 0.6);
    const noise = (rngNext(state) - 0.5) * 2 * C.STOCK_NOISE * s.beta;
    s.price += (fundamental - s.price) * C.STOCK_CONVERGE;
    s.price *= (1 + noise);
    s.price = Math.max(0.01, fin(s.price, 0.01));
    // dividendo con tope de yield 4.5% (< piso de loanRate 5.5%): no-arbitraje duro
    const rawDiv = Math.max(0, earnings) * payout / s.sharesOutstanding;
    s.dividendPerShareYear = Math.min(rawDiv, s.price * 0.045);
  }
  function stepCapitalMarkets(state) {
    let idxSum = 0, idxN = 0;
    for (const t in state.stocks) {
      const s = state.stocks[t];
      if (s.dead) continue;
      updateStockFromEntity(state, s);
      idxSum += s.price * s.sharesOutstanding; idxN += s.sharesOutstanding;
    }
    if (idxN > 0) {
      const raw = idxSum / idxN; // precio promedio ponderado por acciones (≈ STOCK_INIT_PRICE al inicio)
      const target = raw / C.STOCK_INIT_PRICE * 1000; // rebase a 1000
      state.macro.stockIndex = state.macro.stockIndex * 0.85 + target * 0.15;
    }
    // inmuebles: valor sigue landPrice regional; ocupación por oferta/demanda
    const typeCount = {};
    for (const pr of state.realEstate) typeCount[pr.region + '|' + pr.type] = (typeCount[pr.region + '|' + pr.type] || 0) + 1;
    for (const pr of state.realEstate) {
      const r = state.regions.find(x => x.id === pr.region);
      const inflMul = state.macro.inflationIndex / (pr.inflAtBuy || 1);
      pr.currentValue = pr.purchasePrice * (r.landPrice / pr.landPriceAtBuy) * inflMul * (1 + pr.developmentLevel * 0.35);
      const demandUnits = r.population / 1e6 * r.wealthIndex * (pr.type === 'industrial' ? 0.6 : pr.type === 'commercial' ? 0.9 : 1.2);
      const supplyUnits = (typeCount[pr.region + '|' + pr.type] || 1);
      pr.occupancy = clamp(0.7 + 0.3 * (demandUnits / supplyUnits - 1) * 0.3, 0.3, 1);
      pr.rentPerTick = pr.currentValue * 0.00175 * (1 + pr.developmentLevel * 0.25);
    }
    // ventas en corto: fee de préstamo de acciones por tick + margin call si el precio sube fuerte
    const pl = state.player;
    for (let i = pl.shorts.length - 1; i >= 0; i--) {
      const sh = pl.shorts[i], st = state.stocks[sh.ticker];
      if (!st || st.dead) { pl.shorts.splice(i, 1); continue; }
      const fee = sh.shares * st.price * (C.SHORT_BORROW / 52);
      pl.cash -= fee; state._quarterProfit -= fee;
      if (st.price >= sh.entryPrice * C.SHORT_MARGIN_CALL) {
        const cost = sh.shares * st.price * (1 + C.COMMISSION);
        pl.cash -= cost;
        pushLog(state, '⚠ MARGIN CALL: liquidación forzada de tu posición corta en ' + sh.ticker + ' a USD ' + Math.round(st.price).toLocaleString('en') + '. Pérdida realizada.', 'danger');
        pl.shorts.splice(i, 1);
      }
    }
  }

  // 9 -------------------------------------------------------------- CRÉDITO
  function stepCredit(state) {
    const pl = state.player, f = pl.scoreFactors;
    // utilización
    const lim = creditLimit(state);
    const used = totalDebt(state);
    f.util = clamp(1 - used / Math.max(lim, 1), 0, 1);
    // antigüedad
    f.age = clamp(state.tick / 260, 0, 1);
    // mix: variedad de tipos de crédito al día
    const types = new Set(pl.loans.filter(l => l.missed === 0).map(l => l.type));
    f.mix = clamp(0.2 + 0.2 * types.size, 0, 1);
    // consultas recientes (últimas 12 semanas)
    pl.inquiries = pl.inquiries.filter(t => state.tick - t < 12);
    f.inquiries = clamp(1 - 0.15 * pl.inquiries.length, 0, 1);
    // payment decae muy lento hacia neutro si no hay actividad (estabiliza)
    if (pl.loans.length === 0) f.payment = clamp(f.payment + (0.7 - f.payment) * 0.01, 0, 1);
    const target = 300 + 550 * (0.35 * f.payment + 0.30 * f.util + 0.15 * f.age + 0.10 * f.mix + 0.10 * f.inquiries);
    pl.creditScore += (target - pl.creditScore) * C.SCORE_SMOOTHING;
    pl.creditScore = clamp(Math.round(pl.creditScore), 300, 850);
  }

  // 10 -------------------------------------------------------------- EVENTOS
  function maybeEvent(state) {
    if (state.event.cooldown > 0) { state.event.cooldown--; return; }
    if (rngNext(state) < C.EVENT_BASE_PROB) {
      const ev = rollEvent(state);
      if (ev) { state.event.active = ev; state.event.cooldown = C.EVENT_COOLDOWN; }
    }
  }

  // 11 -------------------------------------------------------------- CIERRE
  function stepClose(state) {
    recomputeNetWorth(state);
    // historial de cuota de mercado por empresa (para gráficos de competencia)
    for (const co of state.companies) {
      if (!co.shareHistory) co.shareHistory = [];
      co.shareHistory.push(+(co.marketShare || 0).toFixed(4));
      if (co.shareHistory.length > 120) co.shareHistory.shift();
    }
    checkMilestones(state);
    // bancarrota: insolvente N ticks consecutivos
    const insolvent = state.player.netWorth < -C.INSOLVENCY_THRESHOLD && state.player.cash < 0;
    if (insolvent) {
      state.player.insolventStreak++;
      if (state.player.insolventStreak === 1) pushLog(state, '⚠ ALERTA: insolvencia. Vendé activos, refinanciá o recortá costos. Bancarrota en ' + C.INSOLVENCY_TICKS + ' semanas si seguís así.', 'danger');
      if (state.player.insolventStreak >= C.INSOLVENCY_TICKS) { state.bankrupt = true; state.gameOver = true; pushLog(state, '💀 BANCARROTA. Fin del juego.', 'danger'); }
    } else {
      if (state.player.insolventStreak > 0) pushLog(state, 'Saliste de zona de insolvencia.', 'good');
      state.player.insolventStreak = 0;
    }
    if (!state.won && state.player.netWorth >= C.WIN_NETWORTH) {
      state.won = true; pushLog(state, '🏆 ¡TRILLONARIO! Alcanzaste el objetivo. Podés seguir en modo libre.', 'good');
    }
    pushHistory(state);
  }

  // -------------------------------------------------------------- HITOS
  function awardMilestone(state, id, msg) {
    if (state.milestones[id]) return;
    state.milestones[id] = state.tick;
    pushLog(state, '🎯 Hito: ' + msg, 'good');
  }
  function checkMilestones(state) {
    const pl = state.player;
    if (pl.creditScore >= 700) awardMilestone(state, 'score700', 'Score crediticio 700+.');
    if (state.companies.length >= 1) awardMilestone(state, 'firstCo', 'Fundaste tu primera empresa.');
    if (pl.netWorth >= 1e6) awardMilestone(state, 'millon', 'Primer millón de patrimonio.');
    if (pl.netWorth >= 1e9) awardMilestone(state, 'billon', 'Primeros mil millones.');
    if (state.companies.some(c => c.public)) awardMilestone(state, 'ipo', 'Primera IPO.');
    if (state.realEstate.length >= 1) awardMilestone(state, 'firstProp', 'Primera propiedad.');
  }

  // ============================================================= ACCIONES
  function applyAction(state, action) {
    if (state.gameOver) return { ok: false, reason: 'Juego terminado.' };
    const pl = state.player;
    const A = action || {};
    switch (A.type) {
      case 'startCompany': {
        if (!PLAYABLE.includes(A.productId)) return { ok: false, reason: 'Industria no disponible.' };
        const p = state.products[A.productId];
        const region = state.regions.find(r => r.id === A.region) || state.regions[0];
        const setupCost = factoryCost(p, region);
        if (pl.cash < setupCost) return { ok: false, reason: 'Necesitás USD ' + Math.round(setupCost).toLocaleString('en') + ' para arrancar esta empresa.' };
        pl.cash -= setupCost;
        const cap = factoryCapacity(p);
        const co = {
          id: uid('co'), name: A.name || (p.name + ' Co'), industry: p.industry, region: region.id, productId: A.productId,
          price: p.refPrice, qualityLevel: 1, qualityCeiling: 6 + state.tech.ceilingBonus + (p.cat === 'tech' ? 4 : 0),
          inventory: 0, productionTarget: cap,
          factories: [{ tier: 1, capacity: cap, condition: 1, cost: setupCost, fixedCostPerTick: setupCost * 0.012, region: region.id }],
          marketingBudget: 0, rndBudget: 0, brandStrength: 0.08, fresh: 1, vertical: !!A.vertical,
          employees: { count: Math.max(3, Math.round(cap / C.STAFF_PER_CAP)), avgSkill: 0.5, avgWage: C.BASE_WAGE * region.wageLevel, morale: 0.7 },
          cashContribution: 0, lastUnitsSold: 0, lastRevenue: 0, marketShare: 0, profitHistory: [], lastUnitCost: 0,
          public: false, ticker: null, floatPct: 0, _revenueThisTick: 0, _integrationTicks: 0, shareHistory: [],
        };
        state.companies.push(co);
        pushLog(state, 'Fundaste ' + co.name + ' en ' + region.name + ' (costo USD ' + Math.round(setupCost).toLocaleString('en') + ').', 'good');
        recomputeNetWorth(state);
        return { ok: true, id: co.id };
      }
      case 'setPrice': {
        const co = findCo(state, A.companyId); if (!co) return bad('Empresa no encontrada');
        co.price = clamp(fin(A.price, co.price), 0.01, state.products[co.productId].refPrice * 10);
        return { ok: true };
      }
      case 'setProduction': {
        const co = findCo(state, A.companyId); if (!co) return bad('Empresa no encontrada');
        co.productionTarget = Math.max(0, fin(A.target, 0));
        return { ok: true };
      }
      case 'setMarketing': {
        const co = findCo(state, A.companyId); if (!co) return bad('Empresa no encontrada');
        co.marketingBudget = Math.max(0, fin(A.amount, 0));
        return { ok: true };
      }
      case 'setRnd': {
        const co = findCo(state, A.companyId); if (!co) return bad('Empresa no encontrada');
        co.rndBudget = Math.max(0, fin(A.amount, 0));
        return { ok: true };
      }
      case 'investQuality': {
        const co = findCo(state, A.companyId); if (!co) return bad('Empresa no encontrada');
        if (co.qualityLevel >= co.qualityCeiling) return bad('Calidad al máximo. Investigá I+D para subir el techo.');
        const p = state.products[co.productId];
        const cost = p.refPrice * p.baseDemand * 0.0008 * (co.qualityLevel + 1);
        if (pl.cash < cost) return bad('Costo USD ' + Math.round(cost).toLocaleString('en'));
        pl.cash -= cost; co.qualityLevel = Math.min(co.qualityCeiling, co.qualityLevel + 1);
        return { ok: true };
      }
      case 'buildFactory': {
        const co = findCo(state, A.companyId); if (!co) return bad('Empresa no encontrada');
        const p = state.products[co.productId];
        const region = state.regions.find(r => r.id === A.region) || state.regions.find(r => r.id === co.region);
        const cap = factoryCapacity(p);
        const cost = factoryCost(p, region);
        if (pl.cash < cost) return bad('Costo USD ' + Math.round(cost).toLocaleString('en'));
        pl.cash -= cost;
        co.factories.push({ tier: 1, capacity: cap, condition: 1, cost: cost, fixedCostPerTick: cost * 0.012, region: region.id });
        return { ok: true };
      }
      case 'hire': {
        const co = findCo(state, A.companyId); if (!co) return bad('Empresa no encontrada');
        co.employees.count += Math.max(1, Math.round(A.n || 1));
        return { ok: true };
      }
      case 'fire': {
        const co = findCo(state, A.companyId); if (!co) return bad('Empresa no encontrada');
        const n = Math.max(1, Math.round(A.n || 1));
        co.employees.count = Math.max(0, co.employees.count - n);
        co.employees.morale = clamp(co.employees.morale - 0.05, 0.05, 1);
        return { ok: true };
      }
      case 'setWage': {
        const co = findCo(state, A.companyId); if (!co) return bad('Empresa no encontrada');
        co.employees.avgWage = Math.max(0, fin(A.wage, co.employees.avgWage));
        return { ok: true };
      }
      case 'train': {
        const co = findCo(state, A.companyId); if (!co) return bad('Empresa no encontrada');
        const cost = co.employees.count * 200;
        if (pl.cash < cost) return bad('Costo USD ' + Math.round(cost).toLocaleString('en'));
        pl.cash -= cost;
        co.employees.avgSkill = clamp(co.employees.avgSkill + 0.05 * (1 - co.employees.avgSkill), 0.1, 1);
        return { ok: true };
      }
      case 'setVertical': {
        const co = findCo(state, A.companyId); if (!co) return bad('Empresa no encontrada');
        co.vertical = !!A.on; return { ok: true };
      }
      case 'mergeCompanies': {
        const a = findCo(state, A.intoId), b = findCo(state, A.fromId);
        if (!a || !b) return bad('Empresa no encontrada');
        if (a.id === b.id) return bad('Elegí dos empresas distintas.');
        if (a.productId !== b.productId) return bad('Solo se pueden fusionar empresas del mismo producto.');
        if (a.public || b.public) return bad('No se pueden fusionar empresas que cotizan en bolsa.');
        const capA = a.factories.reduce((s, f) => s + f.capacity, 0), capB = b.factories.reduce((s, f) => s + f.capacity, 0);
        const totCap = (capA + capB) || 1;
        const totCount = Math.max(1, a.employees.count + b.employees.count);
        a.qualityLevel = (a.qualityLevel * capA + b.qualityLevel * capB) / totCap;
        a.qualityCeiling = Math.max(a.qualityCeiling, b.qualityCeiling);
        a.brandStrength = clamp(Math.max(a.brandStrength, b.brandStrength) + 0.05, 0, 1); // sinergia capeada
        a.employees.avgSkill = (a.employees.avgSkill * a.employees.count + b.employees.avgSkill * b.employees.count) / totCount;
        a.employees.morale = clamp((a.employees.morale * a.employees.count + b.employees.morale * b.employees.count) / totCount - 0.1, 0.05, 1);
        a.employees.count += b.employees.count;
        a.inventory += b.inventory;
        a.productionTarget += b.productionTarget;
        a.marketingBudget += b.marketingBudget;
        a.rndBudget += b.rndBudget;
        a.factories = a.factories.concat(b.factories);
        a.profitHistory = []; a.shareHistory = a.shareHistory || [];
        a._integrationTicks = 6; // productividad reducida unas semanas (costo de integración)
        state.companies = state.companies.filter(c => c.id !== b.id);
        pushLog(state, 'Fusionaste ' + b.name + ' dentro de ' + a.name + '. Integración en curso: productividad reducida unas semanas.', 'good');
        awardMilestone(state, 'firstMerge', 'Primera fusión de empresas.');
        recomputeNetWorth(state);
        return { ok: true };
      }
      case 'sellCompany': {
        const co = findCo(state, A.companyId); if (!co) return bad('Empresa no encontrada');
        const v = companyValue(state, co) * (1 - (co.floatPct || 0)) * 0.9; // descuento por liquidez
        pl.cash += v;
        state.companies = state.companies.filter(c => c.id !== co.id);
        if (co.ticker && state.stocks[co.ticker]) state.stocks[co.ticker].dead = true;
        pushLog(state, 'Vendiste ' + co.name + ' por USD ' + Math.round(v).toLocaleString('en') + '.', 'info');
        recomputeNetWorth(state);
        return { ok: true };
      }
      case 'takeLoan': {
        const amt = fin(A.amount, 0);
        if (amt <= 0) return bad('Monto inválido');
        const lim = creditLimit(state), used = totalDebt(state);
        if (used + amt > lim) return bad('Excede tu límite de crédito (disponible USD ' + Math.round(lim - used).toLocaleString('en') + ').');
        const type = A.loanType || 'business';
        const term = A.termTicks || 104;
        const loan = makeLoan(state, amt, type, term);
        pl.loans.push(loan);
        pl.cash += amt;
        pl.inquiries.push(state.tick);
        pushLog(state, 'Tomaste préstamo ' + type + ' de USD ' + Math.round(amt).toLocaleString('en') + ' a ' + (loan.annualRate * 100).toFixed(1) + '% anual.', 'info');
        recomputeNetWorth(state);
        return { ok: true, loanId: loan.id };
      }
      case 'payLoanExtra': {
        const l = pl.loans.find(x => x.id === A.loanId); if (!l) return bad('Préstamo no encontrado');
        const amt = Math.min(fin(A.amount, 0), l.balance, pl.cash);
        if (amt <= 0) return bad('Sin cash o monto inválido');
        l.balance -= amt; pl.cash -= amt;
        if (l.balance <= 0.5) { if (l.id === pl.studentLoanId) { pl.studentLoanId = null; awardMilestone(state, 'paidStudent', 'Pagaste tu deuda estudiantil.'); } pl.loans = pl.loans.filter(x => x.id !== l.id); }
        recomputeNetWorth(state);
        return { ok: true };
      }
      case 'refinance': {
        const l = pl.loans.find(x => x.id === A.loanId); if (!l) return bad('Préstamo no encontrado');
        const newRate = loanRateFor(state, l.type);
        if (newRate >= l.annualRate - 0.002) return bad('Tu score no mejora la tasa todavía.');
        l.annualRate = newRate;
        const r = newRate / 52;
        const remaining = l.termTicks - l.ageTicks;
        l.paymentPerTick = r <= 0 ? l.balance / Math.max(remaining, 1) : l.balance * r / (1 - Math.pow(1 + r, -Math.max(remaining, 1)));
        pl.inquiries.push(state.tick);
        pushLog(state, 'Refinanciaste a ' + (newRate * 100).toFixed(1) + '% anual.', 'good');
        return { ok: true };
      }
      case 'buyStock': {
        const s = state.stocks[A.ticker]; if (!s || s.dead) return bad('Acción no disponible');
        const shares = Math.max(0, Math.floor(A.shares || 0));
        if (shares <= 0) return bad('Cantidad inválida');
        const impact = C.STOCK_IMPACT_K * shares / s.sharesOutstanding;
        const avgPrice = s.price * (1 + impact / 2);
        const cost = shares * avgPrice * (1 + C.COMMISSION);
        if (pl.cash < cost) return bad('Costo USD ' + Math.round(cost).toLocaleString('en'));
        pl.cash -= cost;
        pl.stocks[A.ticker] = (pl.stocks[A.ticker] || 0) + shares;
        s.price *= (1 + impact * 0.25); // el impacto es mayormente temporal: solo 25% queda en el precio de mercado
        // control de competidor cotizante
        maybeTakeover(state, s);
        recomputeNetWorth(state);
        return { ok: true, cost };
      }
      case 'sellStock': {
        const s = state.stocks[A.ticker]; if (!s) return bad('Acción no disponible');
        const have = pl.stocks[A.ticker] || 0;
        const shares = Math.min(Math.floor(A.shares || 0), have);
        if (shares <= 0) return bad('No tenés esas acciones');
        const impact = C.STOCK_IMPACT_K * shares / s.sharesOutstanding;
        const avgPrice = s.price * (1 - impact / 2);
        const proceeds = shares * avgPrice * (1 - C.COMMISSION);
        pl.cash += proceeds;
        pl.stocks[A.ticker] = have - shares;
        s.price *= (1 - impact * 0.25);
        s.price = Math.max(0.01, s.price);
        recomputeNetWorth(state);
        return { ok: true, proceeds };
      }
      case 'shortStock': {
        const s = state.stocks[A.ticker]; if (!s || s.dead) return bad('Acción no disponible');
        const shares = Math.max(0, Math.floor(A.shares || 0));
        if (shares <= 0) return bad('Cantidad inválida');
        const initMargin = shares * s.price * C.SHORT_INIT_MARGIN;
        if (pl.cash < initMargin) return bad('Necesitás margen de USD ' + Math.round(initMargin).toLocaleString('en') + ' (50% del valor en corto).');
        const impact = C.STOCK_IMPACT_K * shares / s.sharesOutstanding;
        const avgPrice = s.price * (1 - impact / 2);
        const proceeds = shares * avgPrice * (1 - C.COMMISSION);
        pl.cash += proceeds;
        s.price *= (1 - impact * 0.25); s.price = Math.max(0.01, s.price);
        pl.shorts.push({ id: uid('sh'), ticker: A.ticker, shares, entryPrice: s.price, openTick: state.tick });
        pushLog(state, 'Vendiste en corto ' + shares.toLocaleString('en') + ' de ' + A.ticker + ' (ganás si baja; pérdida ilimitada si sube).', 'info');
        recomputeNetWorth(state);
        return { ok: true, proceeds };
      }
      case 'coverStock': {
        const pos = pl.shorts.find(x => x.id === A.shortId) || pl.shorts.find(x => x.ticker === A.ticker);
        if (!pos) return bad('No tenés esa posición corta');
        const s = state.stocks[pos.ticker];
        if (!s) { pl.shorts = pl.shorts.filter(x => x !== pos); recomputeNetWorth(state); return { ok: true }; }
        const shares = Math.min(Math.floor(A.shares || pos.shares), pos.shares);
        if (shares <= 0) return bad('Cantidad inválida');
        const impact = C.STOCK_IMPACT_K * shares / s.sharesOutstanding;
        const avgPrice = s.price * (1 + impact / 2);
        const cost = shares * avgPrice * (1 + C.COMMISSION);
        if (pl.cash < cost) return bad('Necesitás USD ' + Math.round(cost).toLocaleString('en') + ' para recomprar y cerrar.');
        pl.cash -= cost;
        s.price *= (1 + impact * 0.25);
        pos.shares -= shares; if (pos.shares <= 0.0001) pl.shorts = pl.shorts.filter(x => x !== pos);
        recomputeNetWorth(state);
        return { ok: true, cost };
      }
      case 'ipo': {
        const co = findCo(state, A.companyId); if (!co) return bad('Empresa no encontrada');
        if (co.public) return bad('Ya cotiza en bolsa.');
        const val = companyValue(state, co);
        if (val < 2e6) return bad('La empresa es muy chica para una IPO (valor mínimo USD 2M).');
        const floatPct = clamp(fin(A.floatPct, 0.2), 0.1, 0.49);
        const fees = 0.05;
        const raised = floatPct * val * (1 - fees);
        const so = Math.max(1e5, Math.round(val / C.STOCK_INIT_PRICE));
        const ticker = (co.name.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4) || 'CO') + (state.companies.length);
        co.public = true; co.floatPct = floatPct; co.ticker = ticker;
        state.stocks[ticker] = { ticker, kind: 'player', refId: co.id, productId: co.productId, sharesOutstanding: so, price: C.STOCK_INIT_PRICE, dividendPerShareYear: 0, beta: 1.1, eps: 0, book: 0, peMult: state.products[co.productId].pe };
        pl.cash += raised;
        pushLog(state, 'IPO de ' + co.name + ': flotaste ' + Math.round(floatPct * 100) + '% y recaudaste USD ' + Math.round(raised).toLocaleString('en') + '.', 'good');
        recomputeNetWorth(state);
        return { ok: true, raised };
      }
      case 'acquire': {
        const c = state.competitors.find(x => x.id === A.competitorId && !x.dead); if (!c) return bad('Competidor no encontrado');
        const price = competitorValue(state, c) * (1 + C.CONTROL_PREMIUM);
        if (pl.cash < price) return bad('Necesitás USD ' + Math.round(price).toLocaleString('en') + ' (valor + prima de control).');
        pl.cash -= price;
        absorbCompetitor(state, c);
        pushLog(state, 'Adquiriste ' + c.name + ' por USD ' + Math.round(price).toLocaleString('en') + '.', 'good');
        awardMilestone(state, 'firstAcq', 'Primera adquisición de un competidor.');
        recomputeNetWorth(state);
        return { ok: true };
      }
      case 'buyProperty': {
        const r = state.regions.find(x => x.id === A.region) || state.regions[0];
        const type = A.propType || 'residential';
        const base = { residential: 250000, commercial: 600000, industrial: 400000, land: 120000 }[type] || 250000;
        const price = base * r.landPrice * state.macro.reIndex;
        const useMortgage = !!A.mortgage;
        let down = price, loan = null;
        if (useMortgage) {
          down = price * 0.25;
          const amt = price - down;
          const lim = creditLimit(state), used = totalDebt(state);
          if (used + amt > lim) return bad('La hipoteca excede tu límite de crédito.');
          loan = makeLoan(state, amt, 'mortgage', 520);
        }
        if (pl.cash < down) return bad('Necesitás USD ' + Math.round(down).toLocaleString('en'));
        pl.cash -= down;
        if (loan) { pl.loans.push(loan); pl.inquiries.push(state.tick); }
        const pr = {
          id: uid('prop'), region: r.id, type, purchasePrice: price, currentValue: price,
          rentPerTick: price * 0.00175, occupancy: 0.85, maintenancePerTick: price * 0.00025,
          mortgageLoanId: loan ? loan.id : null, developmentLevel: 0, landPriceAtBuy: r.landPrice, inflAtBuy: state.macro.inflationIndex,
        };
        state.realEstate.push(pr);
        pushLog(state, 'Compraste inmueble ' + type + ' en ' + r.name + (loan ? ' con hipoteca' : '') + '.', 'info');
        recomputeNetWorth(state);
        return { ok: true, id: pr.id };
      }
      case 'developProperty': {
        const pr = state.realEstate.find(x => x.id === A.propertyId); if (!pr) return bad('Propiedad no encontrada');
        if (pr.developmentLevel >= 3) return bad('Desarrollo al máximo.');
        const cost = pr.currentValue * 0.4;
        if (pl.cash < cost) return bad('Costo USD ' + Math.round(cost).toLocaleString('en'));
        pl.cash -= cost; pr.developmentLevel++;
        recomputeNetWorth(state);
        return { ok: true };
      }
      case 'sellProperty': {
        const pr = state.realEstate.find(x => x.id === A.propertyId); if (!pr) return bad('Propiedad no encontrada');
        let net = pr.currentValue * 0.97;
        if (pr.mortgageLoanId) { const l = pl.loans.find(x => x.id === pr.mortgageLoanId); if (l) { net -= l.balance; pl.loans = pl.loans.filter(x => x.id !== l.id); } }
        pl.cash += net;
        state.realEstate = state.realEstate.filter(x => x.id !== pr.id);
        pushLog(state, 'Vendiste propiedad por USD ' + Math.round(net).toLocaleString('en') + ' (neto).', 'info');
        recomputeNetWorth(state);
        return { ok: true };
      }
      case 'startResearch': {
        const node = state.techTree.find(t => t.id === A.techId); if (!node) return bad('Tecnología no encontrada');
        if (state.tech.unlocked.includes(node.id)) return bad('Ya investigada.');
        for (const pre of node.prereq) if (!state.tech.unlocked.includes(pre)) return bad('Te faltan prerequisitos.');
        state.tech.project = node.id;
        pushLog(state, 'Proyecto de I+D iniciado: ' + node.name + '. Asigná presupuesto de I+D en tus empresas.', 'info');
        return { ok: true };
      }
      case 'setInsurance': {
        pl.insured = !!A.on;
        pushLog(state, pl.insured ? 'Contrataste un seguro corporativo (' + Math.round(insuranceCostFor(state)).toLocaleString('en') + '/sem). Mitiga golpes de eventos.' : 'Cancelaste el seguro.', 'info');
        return { ok: true };
      }
      case 'chooseEvent': {
        if (!state.event.active) return bad('No hay evento activo');
        return resolveEvent(state, A.choiceIndex);
      }
      default:
        return bad('Acción desconocida: ' + A.type);
    }
  }
  function bad(reason) { return { ok: false, reason }; }
  function findCo(state, id) { return state.companies.find(c => c.id === id); }

  function maybeTakeover(state, s) {
    if (s.kind !== 'comp') return;
    const owned = state.player.stocks[s.ticker] || 0;
    if (owned > s.sharesOutstanding * 0.5) {
      const c = state.competitors.find(x => x.id === s.refId);
      if (c && !c.dead) {
        absorbCompetitor(state, c);
        s.dead = true;
        delete state.player.stocks[s.ticker];
        pushLog(state, 'Tomaste control (>50%) de ' + c.name + ' vía bolsa. Absorbida a tu holding.', 'good');
        awardMilestone(state, 'firstAcq', 'Primera adquisición vía bolsa.');
      }
    }
  }
  function absorbCompetitor(state, c) {
    const p = state.products[c.productId];
    const co = {
      id: uid('co'), name: c.name, industry: p.industry, region: c.region, productId: c.productId,
      price: c.price, qualityLevel: c.qualityLevel, qualityCeiling: c.qualityCeiling,
      inventory: 0, productionTarget: c.capacity * 0.9,
      factories: [{ tier: 1, capacity: c.capacity, condition: 0.85, cost: c.capacity * p.refPrice * 0.3, fixedCostPerTick: c.fixedCost * 0.5, region: c.region }],
      marketingBudget: c.marketingBudget, rndBudget: c.rndBudget, brandStrength: c.brandStrength, fresh: c.fresh, vertical: false,
      employees: { count: Math.max(3, Math.round(c.capacity / C.STAFF_PER_CAP)), avgSkill: 0.55, avgWage: C.BASE_WAGE, morale: 0.55 },
      cashContribution: 0, lastUnitsSold: 0, lastRevenue: 0, marketShare: c.marketShare, profitHistory: [], lastUnitCost: 0,
      public: false, ticker: null, floatPct: 0, _revenueThisTick: 0, _integrationTicks: 6, shareHistory: [],
    };
    state.companies.push(co);
    c.dead = true;
    if (c.ticker && state.stocks[c.ticker]) state.stocks[c.ticker].dead = true;
  }

  // ----------------------------------------------------------- EVENTOS (catálogo)
  function rollEvent(state) {
    const cands = EVENTS.filter(e => !e.cond || e.cond(state));
    if (!cands.length) return null;
    const e = cands[Math.floor(rngNext(state) * cands.length)];
    return { id: e.id, title: e.title, desc: typeof e.desc === 'function' ? e.desc(state) : e.desc, choices: e.choices.map(c => ({ label: c.label, hint: c.hint || '' })) };
  }
  function resolveEvent(state, idx) {
    const active = state.event.active; if (!active) return bad('No hay evento');
    const def = EVENTS.find(e => e.id === active.id);
    const choice = def.choices[idx]; if (!choice) return bad('Opción inválida');
    choice.apply(state);
    pushLog(state, 'Evento «' + active.title + '»: elegiste ' + choice.label + '.', 'info');
    state.event.active = null;
    recomputeNetWorth(state);
    return { ok: true };
  }

  const EVENTS = [
    { id: 'refiOffer', title: 'Oferta de refinanciación', cond: s => s.player.creditScore > 660 && s.player.loans.some(l => l.type !== 'student'),
      desc: 'Un banco te ofrece refinanciar un préstamo a mejor tasa por tu buen score.',
      choices: [
        { label: 'Aceptar', hint: 'Baja tu tasa', apply: s => { const l = s.player.loans.find(x => x.type !== 'student'); if (l) { l.annualRate = Math.max(C.CASH_YIELD + 0.01, l.annualRate - 0.02); } } },
        { label: 'Rechazar', hint: 'Sin cambios', apply: () => {} },
      ] },
    { id: 'creditLine', title: 'Ampliación de línea de crédito', cond: s => s.player.creditScore > 600,
      desc: 'Te ofrecen ampliar tu línea de crédito. Tentador, pero sobre-endeudarse es peligroso.',
      choices: [
        { label: 'Aceptar línea', hint: 'Más crédito disponible', apply: s => { s.player.scoreFactors.inquiries = clamp(s.player.scoreFactors.inquiries - 0.05, 0, 1); } },
        { label: 'No, gracias', hint: 'Mantener disciplina', apply: () => {} },
      ] },
    { id: 'creditCrunch', title: 'Crisis crediticia', desc: 'Una crisis financiera global hace saltar las tasas de interés.',
      choices: [
        { label: 'Aguantar', hint: 'Las tasas suben temporalmente', apply: s => { s.macro.interestRate = clamp(s.macro.interestRate + 0.02, 0, 0.25); } },
        { label: 'Cubrirse vendiendo acciones', hint: 'Liquidás parte de la cartera', apply: s => { for (const t in s.player.stocks) { const sh = Math.floor(s.player.stocks[t] * 0.3); const st = s.stocks[t]; if (st) { s.player.cash += sh * st.price * 0.99; s.player.stocks[t] -= sh; } } } },
      ] },
    { id: 'breakdown', title: 'Avería en fábrica', cond: s => s.companies.length > 0,
      desc: 'Una de tus fábricas se averió. Podés pagar la reparación o producir a media capacidad.',
      choices: [
        { label: 'Reparar ya (caro)', hint: 'Pagás pero seguís a full', apply: s => { const co = s.companies[0]; applyHit(s, co.factories[0].capacity * 4); } },
        { label: 'Producir a media máquina', hint: 'Sin gasto, menos capacidad', apply: s => { const co = s.companies[0]; co.factories[0].condition = clamp(co.factories[0].condition - 0.3, 0.3, 1); } },
      ] },
    { id: 'supplier', title: 'Proveedor sube precios', cond: s => s.companies.length > 0,
      desc: 'Un proveedor clave aumentó sus precios. ¿Cómo respondés?',
      choices: [
        { label: 'Aceptar el aumento', hint: 'Más costo variable un tiempo', apply: s => { s.macro.fuelIndex = clamp(s.macro.fuelIndex + 0.05, 0.6, 2.5); } },
        { label: 'Integrarte verticalmente', hint: 'Producís tus insumos', apply: s => { if (s.companies[0]) s.companies[0].vertical = true; } },
      ] },
    { id: 'strike', title: 'Amenaza de huelga', cond: s => s.companies.some(c => c.employees.morale < 0.5),
      desc: 'La baja moral amenaza con una huelga. Podés ceder un aumento o aguantar la pérdida.',
      choices: [
        { label: 'Dar aumento', hint: 'Sube salarios y moral', apply: s => { for (const co of s.companies) { co.employees.avgWage *= 1.1; co.employees.morale = clamp(co.employees.morale + 0.2, 0, 1); } } },
        { label: 'Aguantar', hint: 'Cae producción y moral', apply: s => { for (const co of s.companies) { co.employees.morale = clamp(co.employees.morale - 0.15, 0.05, 1); co.factories.forEach(f => f.condition = clamp(f.condition - 0.1, 0.3, 1)); } } },
      ] },
    { id: 'priceWar', title: 'Guerra de precios', cond: s => s.companies.length > 0,
      desc: 'Un competidor lanzó una guerra de precios en tu mercado principal.',
      choices: [
        { label: 'Igualar precios', hint: 'Defendés share, perdés margen', apply: s => { const co = s.companies[0]; co.price *= 0.85; } },
        { label: 'Mantener y diferenciar', hint: 'Subís calidad/marca', apply: s => { const co = s.companies[0]; co.brandStrength = clamp(co.brandStrength + 0.1, 0, 1); } },
      ] },
    { id: 'rivalSale', title: 'Competidor en venta', cond: s => s.competitors.some(c => !c.dead),
      desc: 'Una empresa rival está en venta a precio de oportunidad.',
      choices: [
        { label: 'Evaluar en pestaña Mercado', hint: 'Ir a M&A', apply: () => {} },
        { label: 'Ignorar', hint: '', apply: () => {} },
      ] },
    { id: 'copycat', title: 'Te copian un producto', cond: s => s.companies.some(c => state_obs(s, c) && !s.tech.patent),
      desc: 'Un competidor copió tu producto. Sin patentes (I+D) perdés ventaja.',
      choices: [
        { label: 'Acelerar I+D', hint: 'Recuperás frescura', apply: s => { for (const co of s.companies) co.fresh = clamp(co.fresh + 0.15, 0, 1); } },
        { label: 'Bajar precio', hint: 'Competís por precio', apply: s => { if (s.companies[0]) s.companies[0].price *= 0.92; } },
      ] },
    { id: 'antitrust', title: 'Investigación antimonopolio', cond: s => s.companies.some(c => c.marketShare > 0.55),
      desc: 'Concentraste demasiado mercado. El regulador investiga.',
      choices: [
        { label: 'Pagar multa', hint: 'Costo único', apply: s => { s.player.cash -= Math.max(50000, s.player.netWorth * 0.02); } },
        { label: 'Desinvertir parte', hint: 'Bajás share, recuperás caja', apply: s => { const co = s.companies.find(c => c.marketShare > 0.55); if (co) { co.factories.splice(1); s.player.cash += companyValue(s, co) * 0.1; } } },
      ] },
    { id: 'envreg', title: 'Nueva regulación ambiental', cond: s => s.companies.some(c => ['metal', 'quimica', 'automotriz', 'energia', 'mineria'].includes(c.industry)),
      desc: 'Regulación ambiental en industria pesada: cumplir cuesta, no cumplir arriesga multa mayor.',
      choices: [
        { label: 'Invertir en cumplir', hint: 'Costo ahora', apply: s => { s.player.cash -= 40000; } },
        { label: 'Arriesgar (50% multa)', hint: 'Probabilístico', apply: s => { if (rngNext(s) < 0.5) s.player.cash -= 120000; } },
      ] },
    { id: 'oilShock', title: 'Shock petrolero', desc: 'Sube el petróleo: aumentan costos logísticos y de energía.',
      choices: [
        { label: 'Absorber el golpe', hint: 'Sube fuelIndex', apply: s => { s.macro.fuelIndex = clamp(s.macro.fuelIndex + 0.15, 0.6, 2.5); s.markets['oil'].referencePrice *= 1.15; } },
        { label: 'Cubrirse con futuros', hint: 'Pagás prima, menor golpe', apply: s => { s.player.cash -= 25000; s.macro.fuelIndex = clamp(s.macro.fuelIndex + 0.05, 0.6, 2.5); } },
      ] },
    { id: 'reBubble', title: 'Burbuja inmobiliaria', cond: s => s.macro.reIndex > 1.3,
      desc: 'Los valores inmobiliarios están sobrecalentados y podrían corregir.',
      choices: [
        { label: 'Vender propiedades', hint: 'Tomás ganancia', apply: s => { for (const pr of s.realEstate.slice()) { s.player.cash += pr.currentValue * 0.97; } s.realEstate = []; } },
        { label: 'Apostar a que sigue', hint: 'Riesgo de corrección', apply: s => { for (const r of s.regions) r.landPrice *= 0.9; } },
      ] },
    { id: 'subsidy', title: 'Licitación pública', desc: 'Podés ganar un subsidio/licitación invirtiendo capital.',
      choices: [
        { label: 'Invertir USD 50k', hint: '60% de ganar el doble', apply: s => { s.player.cash -= 50000; if (rngNext(s) < 0.6) s.player.cash += 120000; } },
        { label: 'Pasar', hint: '', apply: () => {} },
      ] },
    { id: 'trend', title: 'Tendencia de consumo', desc: 'Una tendencia dispara la demanda de cierto rubro por un tiempo.',
      choices: [
        { label: 'Aprovechar (subir producción)', hint: 'Si estás en el rubro', apply: s => { for (const co of s.companies) co.productionTarget *= 1.2; const m = pick(s, Object.keys(s.markets)); s.markets[m].baseDemand *= 1.05; } },
        { label: 'No cambiar nada', hint: '', apply: () => {} },
      ] },
    { id: 'starHire', title: 'Talento estrella disponible', cond: s => s.companies.length > 0,
      desc: 'Un ejecutivo estrella está disponible. Sube skill y calidad operativa.',
      choices: [
        { label: 'Contratar (caro)', hint: '+skill y +calidad', apply: s => { s.player.cash -= 60000; for (const co of s.companies) { co.employees.avgSkill = clamp(co.employees.avgSkill + 0.1, 0, 1); } } },
        { label: 'No contratar', hint: '', apply: () => {} },
      ] },
    { id: 'recession', title: 'Recesión adelantada', cond: s => s.macro.cyclePhase > 0,
      desc: 'Señales de una recesión que llega antes de lo esperado.',
      choices: [
        { label: 'Recortar costos', hint: 'Reducís gasto preventivo', apply: s => { for (const co of s.companies) { co.marketingBudget *= 0.7; } } },
        { label: 'Invertir contracíclico', hint: 'Comprás barato si tenés caja', apply: s => {} },
      ] },
    { id: 'taxChange', title: 'Cambio impositivo regional', desc: 'Una región cambia su tasa impositiva.',
      choices: [
        { label: 'Aceptar', hint: 'Pequeño ajuste', apply: s => { const r = pick(s, s.regions); r.taxRate = clamp(r.taxRate + 0.02, 0.1, 0.35); } },
        { label: 'Lobby (pagar)', hint: 'Evitás el alza', apply: s => { applyHit(s, 15000); } },
      ] },
    { id: 'insuranceOffer', title: 'Oferta de seguro corporativo', cond: s => !s.player.insured,
      desc: 'Una aseguradora te ofrece cobertura: una prima semanal que reduce el golpe de averías, desastres y juicios.',
      choices: [
        { label: 'Contratar seguro', hint: '≈ ' + 'prima semanal según tu tamaño', apply: s => { s.player.insured = true; } },
        { label: 'No, asumo el riesgo', hint: 'Sin prima', apply: () => {} },
      ] },
    { id: 'lawsuit', title: 'Demanda judicial', cond: s => s.companies.length > 0,
      desc: 'Un cliente te demanda. Podés llegar a un acuerdo o ir a juicio (riesgo mayor).',
      choices: [
        { label: 'Acordar (pagar)', hint: 'Costo cierto, cubierto por seguro', apply: s => { applyHit(s, Math.max(30000, s.player.netWorth * 0.01)); } },
        { label: 'Ir a juicio', hint: '50% de no pagar nada, 50% el doble', apply: s => { if (rngNext(s) < 0.5) applyHit(s, Math.max(60000, s.player.netWorth * 0.02)); } },
      ] },
    { id: 'recall', title: 'Retiro de producto', cond: s => s.companies.some(c => state_obsProduct(s, c.productId)),
      desc: 'Un defecto obliga a retirar un producto del mercado. Cubrir el retiro cuesta, ignorarlo daña la marca.',
      choices: [
        { label: 'Retirar y reparar', hint: 'Pagás (cubierto por seguro)', apply: s => { applyHit(s, Math.max(40000, s.player.netWorth * 0.012)); } },
        { label: 'Minimizar el caso', hint: 'Ahorrás, cae la marca', apply: s => { for (const co of s.companies) co.brandStrength = clamp(co.brandStrength - 0.12, 0, 1); } },
      ] },
    { id: 'poach', title: 'Te roban talento', cond: s => s.companies.some(c => c.employees.avgSkill > 0.55),
      desc: 'Un competidor intenta llevarse a tu mejor gente. ¿Hacés una contraoferta?',
      choices: [
        { label: 'Contraoferta (subir salarios)', hint: 'Retenés el equipo', apply: s => { for (const co of s.companies) { co.employees.avgWage *= 1.08; co.employees.morale = clamp(co.employees.morale + 0.1, 0, 1); } } },
        { label: 'Dejarlos ir', hint: 'Perdés skill', apply: s => { for (const co of s.companies) co.employees.avgSkill = clamp(co.employees.avgSkill - 0.08, 0.1, 1); } },
      ] },
    { id: 'disaster', title: 'Desastre natural', cond: s => s.companies.length > 0 || s.realEstate.length > 0,
      desc: 'Un desastre golpea una región donde operás. Reparar cuesta; el seguro mitiga buena parte.',
      choices: [
        { label: 'Reparar todo', hint: 'Golpe fuerte, cubierto por seguro', apply: s => { applyHit(s, Math.max(50000, s.player.netWorth * 0.025)); } },
        { label: 'Reparación parcial', hint: 'Menos gasto, cae condición', apply: s => { applyHit(s, Math.max(15000, s.player.netWorth * 0.008)); for (const co of s.companies) co.factories.forEach(f => f.condition = clamp(f.condition - 0.15, 0.3, 1)); } },
      ] },
    { id: 'cyber', title: 'Ciberataque', cond: s => s.companies.some(c => ['tech', 'electronica', 'semis'].includes(c.industry)),
      desc: 'Hackearon tus sistemas. Reforzar la seguridad cuesta; ignorarlo arriesga una fuga peor.',
      choices: [
        { label: 'Pagar y blindar', hint: 'Cubierto por seguro', apply: s => { applyHit(s, 45000); } },
        { label: 'Arriesgar (40% fuga)', hint: 'Probabilístico', apply: s => { if (rngNext(s) < 0.4) { applyHit(s, 130000); for (const co of s.companies) co.brandStrength = clamp(co.brandStrength - 0.08, 0, 1); } } },
      ] },
    { id: 'tariff', title: 'Nuevos aranceles', desc: 'Una guerra comercial impone aranceles a las importaciones de insumos.',
      choices: [
        { label: 'Absorber el costo', hint: 'Sube combustible/insumos', apply: s => { s.macro.fuelIndex = clamp(s.macro.fuelIndex + 0.1, 0.6, 2.5); } },
        { label: 'Relocalizar (pagar)', hint: 'Costo único, evitás el alza', apply: s => { applyHit(s, 35000); } },
      ] },
    { id: 'celeb', title: 'Auspicio de una celebridad', cond: s => s.companies.length > 0,
      desc: 'Una figura famosa quiere asociarse a tu marca. Caro, pero dispara el reconocimiento.',
      choices: [
        { label: 'Contratar (caro)', hint: '+marca en todas tus empresas', apply: s => { s.player.cash -= 50000; for (const co of s.companies) co.brandStrength = clamp(co.brandStrength + 0.15, 0, 1); } },
        { label: 'Pasar', hint: '', apply: () => {} },
      ] },
    { id: 'viral', title: 'Producto viral', cond: s => s.companies.length > 0,
      desc: 'Uno de tus productos se volvió tendencia en redes. La demanda se dispara temporalmente.',
      choices: [
        { label: 'Subir producción y aprovechar', hint: 'Más volumen', apply: s => { for (const co of s.companies) { co.productionTarget *= 1.25; co.brandStrength = clamp(co.brandStrength + 0.08, 0, 1); } } },
        { label: 'Mantener la calidad', hint: 'Sin sobreexigir', apply: s => { for (const co of s.companies) co.brandStrength = clamp(co.brandStrength + 0.04, 0, 1); } },
      ] },
    { id: 'rateCut', title: 'Recorte de tasas', cond: s => s.macro.interestRate > 0.04,
      desc: 'El banco central recorta la tasa de referencia para estimular la economía.',
      choices: [
        { label: 'Aprovechar para endeudarse', hint: 'Tasas más bajas ahora', apply: s => { s.macro.interestRate = clamp(s.macro.interestRate - 0.015, 0.005, 0.25); } },
        { label: 'Sin cambios', hint: '', apply: s => { s.macro.interestRate = clamp(s.macro.interestRate - 0.01, 0.005, 0.25); } },
      ] },
    { id: 'grant', title: 'Subsidio a la innovación', cond: s => s.companies.some(c => c.rndBudget > 0),
      desc: 'El Estado premia tu inversión en I+D con un subsidio.',
      choices: [
        { label: 'Aceptar subsidio', hint: 'Cash + impulso de skill', apply: s => { s.player.cash += 40000; for (const co of s.companies) co.employees.avgSkill = clamp(co.employees.avgSkill + 0.04, 0, 1); } },
        { label: 'Rechazar (sin ataduras)', hint: '', apply: () => {} },
      ] },
    { id: 'union', title: 'Negociación sindical', cond: s => s.companies.some(c => c.employees.count > 8),
      desc: 'El sindicato propone un convenio colectivo.',
      choices: [
        { label: 'Firmar convenio', hint: '+salarios, +moral', apply: s => { for (const co of s.companies) { co.employees.avgWage *= 1.06; co.employees.morale = clamp(co.employees.morale + 0.12, 0, 1); } } },
        { label: 'Rechazar', hint: 'Cae moral', apply: s => { for (const co of s.companies) co.employees.morale = clamp(co.employees.morale - 0.1, 0.05, 1); } },
      ] },
  ];
  function state_obs(s, c) { return state_obsProduct(s, c.productId); }
  function state_obsProduct(s, pid) { return s.products[pid] && s.products[pid].obs > 0; }

  // ------------------------------------------------------ SERIALIZACIÓN
  function serialize(state) { return JSON.stringify(state); }
  function deserialize(str) { return JSON.parse(str); }

  // previsualización read-only: estima venta/share/resultado con valores hipotéticos (no muta el estado)
  function previewWith(state, companyId, ov) {
    const co = state.companies.find(function (c) { return c.id === companyId; });
    if (!co) return null;
    ov = ov || {};
    const pid = co.productId, sellers = [];
    for (const c of state.competitors) if (c.productId === pid && !c.dead)
      sellers.push({ ref: c, isPlayer: false, productId: pid, price: c.price, qualityLevel: c.qualityLevel, fresh: c.fresh, brandStrength: c.brandStrength, marketingBudget: c.marketingBudget, region: c.region, qualityCeiling: c.qualityCeiling });
    for (const x of state.companies) if (x.productId === pid) {
      const me = x.id === companyId;
      sellers.push({
        ref: x, isPlayer: true, productId: pid,
        price: me && ov.price != null ? ov.price : x.price,
        qualityLevel: me && ov.qualityLevel != null ? ov.qualityLevel : x.qualityLevel,
        fresh: x.fresh, brandStrength: x.brandStrength,
        marketingBudget: me && ov.marketing != null ? ov.marketing : x.marketingBudget,
        region: x.region, qualityCeiling: x.qualityCeiling,
      });
    }
    let sumA = 0; for (const s of sellers) { s.A = sellerAttr(state, s); sumA += s.A; }
    const market = state.markets[pid], product = state.products[pid], mm = macroMult(state);
    let indexPrice = 0, avgQual = 0, avgMkt = 0;
    for (const s of sellers) {
      s.share = s.A / sumA; indexPrice += s.share * s.price;
      avgQual += s.share * (1 + C.QUAL_W * clamp(s.qualityLevel / Math.max(s.qualityCeiling, 1), 0, 1));
      avgMkt += s.share * mktMultiplier(s.marketingBudget, s.isPlayer ? state.tech.mktBonus : 0);
    }
    let totalDemand = clamp(fin(market.baseDemand * Math.pow(indexPrice / market.referencePrice, -product.elasticity) * avgQual * avgMkt * mm, 0), 0, market.baseDemand * 8);
    const me = sellers.find(function (s) { return s.isPlayer && s.ref === co; });
    const demand = totalDemand * me.share;
    const sellable = Math.min(demand, effectiveCapacity(co));
    const price = ov.price != null ? ov.price : co.price;
    const unitCost = co.lastUnitCost || (product.baseVarCost * state.macro.inflationIndex + inputCost(state, pid, co.vertical));
    const margin = price > 0 ? (price - unitCost) / price : 0;
    const extraMkt = (ov.marketing != null ? ov.marketing : co.marketingBudget) - co.marketingBudget;
    return { demand: demand, share: me.share, sellable: sellable, unitCost: unitCost, margin: margin, profitEst: sellable * (price - unitCost) - Math.max(0, extraMkt) };
  }
  function previewPrice(state, id, price) { return previewWith(state, id, { price: price }); }
  function previewMarketing(state, id, spend) { return previewWith(state, id, { marketing: spend }); }
  function previewQuality(state, id, level) { return previewWith(state, id, { qualityLevel: level }); }

  // util para UI: lista de tickers de acciones vivas
  function listStocks(state) {
    const out = [];
    for (const t in state.stocks) { const s = state.stocks[t]; if (!s.dead) out.push(s); }
    return out;
  }

  return {
    C, STAGES, createInitialState, tick, applyAction, recomputeNetWorth,
    companyValue, competitorValue, creditLimit, totalDebt, loanRateFor, riskPremium,
    inputCost, listStocks, serialize, deserialize, rngNext, EVENTS_COUNT: EVENTS.length,
    PLAYABLE, buildProducts, previewPrice, previewMarketing, previewQuality, insuranceCostFor, regionDistance,
  };
});
