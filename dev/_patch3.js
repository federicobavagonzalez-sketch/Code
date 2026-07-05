const fs=require('fs'); let s=fs.readFileSync('engine.js','utf8');
const a=s.indexOf('  function makeCompetitor(state, productId, idx) {');
const end=s.indexOf('\n  }\n', a); // first standalone close
const newFn=`  function netMarginFor(cat) { return ({ staple: 0.04, retail: 0.05, material: 0.07, heavy: 0.06, tech: 0.12, luxury: 0.20 })[cat] || 0.08; }
  function makeCompetitor(state, productId, idx, sizeShare) {
    const p = state.products[productId];
    const pool = COMP_NAMES[productId] || GENERIC_NAMES;
    const base = pool[idx % pool.length] || (p.name + ' Co');
    const name = idx < pool.length ? base : base + ' ' + ('II III IV V VI'.split(' ')[(idx - pool.length) % 5]);
    const profile = PROFILES[(idx + productId.length) % PROFILES.length];
    const region = pick(state, state.regions).id;
    let markup = profile === 'premium' ? 0.9 : profile === 'aggressive' ? 0.22 : profile === 'efficient' ? 0.4 : 0.55;
    const capacity = Math.max(p.plantCap, sizeShare * p.baseDemand) * rngRange(state, 0.85, 1.15);
    const reach = clamp(sizeShare * 3.5 + 0.03, 0.03, 0.95);
    const fixedCost = capacity * p.refPrice * 0.015 * rngRange(state, 0.8, 1.2);
    const netMargin = netMarginFor(p.cat);
    const ticker = (base.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4) || 'CMP') + idx;
    const qLevel = profile === 'premium' ? rngRange(state, 4, 6) : rngRange(state, 1.5, 3.5);
    return {
      id: uid('cmp'), name, productId, region, profile,
      markup, price: p.refPrice * rngRange(state, 0.9, 1.1),
      capacity, fixedCost, reach,
      qualityLevel: qLevel, qualityCeiling: 6 + (p.cat === 'tech' ? 6 : 2),
      brandStrength: profile === 'premium' ? rngRange(state, 0.4, 0.7) : rngRange(state, 0.1, 0.45),
      marketingBudget: fixedCost * rngRange(state, 0.2, 0.6),
      rndBudget: (p.cat === 'tech' || profile === 'premium' || profile === 'efficient') ? fixedCost * rngRange(state, 0.1, 0.4) : 0,
      techEff: 0, fresh: 1, cash: fixedCost * 30,
      marketShare: sizeShare, lastSold: capacity * 0.8, lastDemand: capacity * 0.9,
      profitHist: [], annualEarnings: capacity * p.refPrice * netMargin * 52,
      targetShare: clamp(sizeShare * 1.1, 0.01, 0.5),
      sharesOutstanding: 1e6, public: true, ticker, beta: p.cat === 'luxury' || p.cat === 'tech' ? 1.4 : p.cat === 'staple' ? 0.6 : 1.0,
      dead: false, age: 0,
    };
  }`;
s = s.slice(0,a) + newFn + s.slice(end);
// add GENERIC_NAMES near COMP_NAMES
s = s.replace('const PROFILES =', "const GENERIC_NAMES = ['Apex','Vertex','Nova','Sterling','Pinnacle','Summit','Atlas','Zenith','Keystone','Beacon','Monarch','Cardinal','Liberty','Horizon'];\n  const PROFILES =");
fs.writeFileSync('engine.js', s);
console.log('makeCompetitor reemplazado');
