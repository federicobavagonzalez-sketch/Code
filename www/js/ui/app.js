// app.js — bootstrap, router y render de pantallas. Se apoya en el engine ya probado.

import { createCareer, advanceWeek, startFight, finishFight, endCareer } from '../engine/career.js';
import { serializeCareer, deserializeCareer } from '../engine/save.js';
import { saveGame, loadGame, hasSave, clearGame } from '../platform/storage.js';
import { hitLight, hitHeavy, ko as hapticKO } from '../platform/haptics.js';
import { INTENTS } from '../engine/fight-engine.js';
import { TUNING } from '../engine/tuning.js';
import { ageYears } from '../engine/fighter.js';
import { formatWeek } from '../engine/calendar.js';
import { PHYS_KEYS, TECH_KEYS } from '../engine/attributes.js';
import { attrGroupHTML, mentalGroupHTML, scoutHTML, recordStr, moneyStr, archLabel, esc } from './view.js';

const app = document.getElementById('app');
const state = { career: null, screen: 'home', tab: 'semana', fight: null, createDraft: null };

// ---- utilidades ----
function render(html) { app.innerHTML = html; }
function on(sel, ev, fn) { app.querySelectorAll(sel).forEach(e => e.addEventListener(ev, fn)); }
async function persist() { if (state.career && !state.career.over) await saveGame(serializeCareer(state.career)); }

const ACTIVITY_LABELS = {
  train: 'Entrenar disciplina', sparring: 'Sparring', conditioning: 'Acondicionamiento',
  rest: 'Descanso', grindwork: 'Trabajo de mierda', personal: 'Vida personal',
};
const CAMP_ACTIVITY_LABELS = {
  train: 'Pulir game plan', sparring: 'Sparring de camp', conditioning: 'Acondicionamiento',
  rest: 'Descanso', grindwork: 'Trabajo de mierda', personal: 'Vida personal',
};
const INTENT_INFO = {
  pressure: ['Presionar', 'Más volumen, gasta cardio'],
  counter: ['Contragolpear', 'Menos volumen, castiga al que va al frente'],
  takedown: ['Llevar al suelo', 'Buscar el derribo'],
  standup: ['Mantener de pie', 'Defender el derribo, sprawl'],
  survive: ['Sobrevivir', 'Proteger, recuperar, ceder puntos'],
  gamble: ['Apostar todo', 'Buscar el KO, defensa abierta'],
};

// ================= BOOT =================
async function boot() {
  const exists = await hasSave();
  state.hasSave = exists;
  routeHome();
}

// ================= HOME =================
function routeHome() {
  state.screen = 'home';
  render(`
    <div class="screen center">
      <div class="hero">
        <div class="logo">CA<span class="g">G</span>E</div>
        <div class="tag">carrera de peleador</div>
      </div>
      <div class="spacer"></div>
      <div class="card" style="text-align:left">
        <p class="muted" style="margin-top:0">Empezás como un amateur sin nombre en un gym de barrio. La mayoría no llega a ningún lado. Vas a ver hasta dónde llega tu cuerpo.</p>
      </div>
      <button class="btn btn-primary btn-block" id="new">Nueva carrera</button>
      ${state.hasSave ? '<button class="btn btn-block" id="cont">Continuar</button>' : ''}
      <div class="spacer"></div>
      <div class="faint center">Sin conexión. Todo pasa en este teléfono.</div>
    </div>`);
  on('#new', 'click', () => { if (state.hasSave) { if (confirm('Ya hay una carrera guardada. ¿Empezar una nueva y borrarla?')) startCreate(); } else startCreate(); });
  on('#cont', 'click', continueGame);
}

async function continueGame() {
  const data = await loadGame();
  const career = data && deserializeCareer(data);
  if (!career) { alert('No se pudo cargar la carrera.'); return; }
  state.career = career;
  if (career.over) { routeSummary(); return; }
  routeHub('semana');
}

// ================= CREATE =================
function startCreate() {
  state.createDraft = { name: '', archetype: 'complete', divisionId: 'light' };
  routeCreate();
}
function routeCreate() {
  state.screen = 'create';
  const d = state.createDraft;
  const arche = [
    ['striker', 'Golpes: boxeo, patadas, rodillas'],
    ['wrestler', 'Derribos, control, ground and pound'],
    ['grappler', 'Suelo, sumisiones, jiu-jitsu'],
    ['complete', 'Sin picos ni huecos graves'],
  ];
  render(`
    <div class="screen scroll">
      <h1>Tu peleador</h1>
      <div class="card">
        <div class="section-label">Nombre</div>
        <input id="nm" placeholder="Apodo o nombre" maxlength="22" value="${esc(d.name)}"
          style="width:100%;min-height:44px;background:var(--bg-elev2);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:0 12px;font-size:1rem" />
      </div>
      <div class="card">
        <div class="section-label">Base (sesga tu potencial oculto, no tus valores)</div>
        <div class="grid" id="arch">
          ${arche.map(([k, dd]) => `<button class="opt ${d.archetype === k ? 'sel' : ''}" data-a="${k}"><span class="k">${archLabel(k)}</span><span class="d">${dd}</span></button>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="section-label">División</div>
        <div class="grid" id="div">
          ${TUNING.DIVISIONS.map(dv => `<button class="opt ${d.divisionId === dv.id ? 'sel' : ''}" data-d="${dv.id}"><span class="k">${dv.name}</span><span class="d">hasta ${dv.limit} kg</span></button>`).join('')}
        </div>
      </div>
      <button class="btn btn-primary btn-block" id="go">Entrar al gym</button>
      <div class="faint center">Tus techos de potencial se sortean ahora. No los vas a ver. Los descubrís cuando el progreso se frena.</div>
    </div>`);
  on('#nm', 'input', e => d.name = e.target.value);
  on('#arch [data-a]', 'click', e => { d.archetype = e.currentTarget.dataset.a; routeCreate(); });
  on('#div [data-d]', 'click', e => { d.divisionId = e.currentTarget.dataset.d; routeCreate(); });
  on('#go', 'click', async () => {
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    state.career = createCareer(seed, { name: d.name.trim() || 'Vos', archetype: d.archetype, divisionId: d.divisionId });
    await persist();
    routeHub('semana');
  });
}

// ================= HUB =================
function routeHub(tab) {
  if (state.career.over) return routeSummary();
  state.screen = 'hub';
  state.tab = tab || state.tab;
  const c = state.career, p = c.player;
  const money = moneyStr(p.bankroll);
  const inCamp = c.phase === 'camp';
  let body = '';
  if (state.tab === 'semana') body = inCamp ? campTab() : weekTab();
  else if (state.tab === 'gym') body = gymTab();
  else if (state.tab === 'ranking') body = rankingTab();
  else if (state.tab === 'perfil') body = profileTab();

  render(`
    <div class="topbar">
      <div><div class="title" style="font-size:1.2rem">${esc(p.name)}</div><div class="date">${dateLabel()}</div></div>
      <div class="money ${p.bankroll < 0 ? 'neg' : ''}">${money}</div>
    </div>
    <div class="screen scroll" style="padding-bottom:70px">${body}</div>
    <div class="tabbar">
      ${tabBtn('semana', inCamp ? 'Camp' : 'Semana')}
      ${tabBtn('gym', 'Gym')}
      ${tabBtn('ranking', 'Ranking')}
      ${tabBtn('perfil', 'Perfil')}
    </div>`);
  wireHub();
}

function tabBtn(id, label) {
  return `<button data-tab="${id}" class="${state.tab === id ? 'active' : ''}"><span class="ic">${label}</span></button>`;
}
function dateLabel() {
  return formatWeek(state.career.world.week);
}

function wireHub() {
  on('.tabbar [data-tab]', 'click', e => routeHub(e.currentTarget.dataset.tab));
  if (state.tab === 'semana') wireWeek();
  if (state.tab === 'ranking') { /* estatico */ }
}

// ---- pestaña SEMANA (fuera de camp) ----
function weekTab() {
  const c = state.career;
  if (!state._slots) state._slots = defaultSlots(false);
  const offers = c.offers;
  return `
    ${condCard()}
    <div class="section-label">Ofertas de pelea</div>
    ${offers.length ? offers.map(offerCard).join('') : '<div class="card muted">No hay ofertas esta semana. Seguí entrenando o meté horas de laburo.</div>'}
    <div class="section-label">Esta semana — 3 actividades</div>
    <div class="card">
      <div class="slot-list" id="slots">${slotSelectors(false)}</div>
    </div>
    <button class="btn btn-primary btn-block" id="advance">Avanzar semana</button>
    <div class="faint center">La fatiga alta baja las ganancias y sube el riesgo de lesión. Descansar es una decisión.</div>`;
}

function campTab() {
  const c = state.career, camp = c.camp;
  const opp = c.world.fighters.get(camp.offer.opponentId);
  if (!state._slots) state._slots = defaultSlots(true);
  const cut = cutInfo();
  return `
    <div class="card">
      <div class="section-label">Camp — ${camp.weeksLeft} ${camp.weeksLeft === 1 ? 'semana' : 'semanas'} para la pelea</div>
      ${scoutHTML(opp, c.world, c.world.week)}
      ${camp.offer.isTitle ? '<div class="chip hot" style="margin-top:8px">PELEA DE TÍTULO</div>' : ''}
    </div>
    ${condCard()}
    <div class="section-label">Corte de peso</div>
    <div class="card">
      <div class="muted">${cut.text}</div>
      ${cut.warn ? `<div class="warn" style="margin-top:6px">${cut.warn}</div>` : ''}
      <div style="margin-top:8px" class="tag-line">
        ${TUNING.DIVISIONS.map(dv => `<button class="chip ${camp.cutDivisionId === dv.id ? 'hot' : ''}" data-cut="${dv.id}">${dv.name}</button>`).join('')}
      </div>
    </div>
    <div class="section-label">Semana de camp — 3 actividades</div>
    <div class="card"><div class="slot-list" id="slots">${slotSelectors(true)}</div></div>
    <button class="btn btn-primary btn-block" id="advance">Avanzar semana</button>`;
}

function cutInfo() {
  const c = state.career, camp = c.camp, p = c.player;
  const div = TUNING.DIVISIONS.find(d => d.id === camp.cutDivisionId);
  const cutKg = Math.max(0, p.naturalWeightKg - div.limit);
  const frac = cutKg / p.naturalWeightKg;
  let text, warn = null;
  if (frac <= TUNING.SAFE_FRAC * 0.5) text = `Peleás en ${div.name} casi sin cortar. Sin ventaja de tamaño, sin castigo.`;
  else if (frac <= TUNING.SAFE_FRAC) text = `Corte manejable a ${div.name}. Algo de ventaja de tamaño.`;
  else if (frac <= TUNING.MAX_FRAC) { text = `Corte agresivo a ${div.name}: sos el más grande, pero llegás seco.`; warn = 'El corte castiga tu cardio y tu mentón el día de la pelea. Riesgo de no dar el peso.'; }
  else { text = `Corte brutal a ${div.name}.`; warn = 'Casi seguro fallás el pesaje o llegás vaciado. Muy peligroso.'; }
  return { text, warn };
}

function condCard() {
  const p = state.career.player;
  const fat = p.fatigue > 70 ? 'quemado' : p.fatigue > 45 ? 'algo cansado' : 'fresco';
  const inj = p.injuries.filter(i => i.weeksLeft > 0);
  const injTxt = inj.length ? inj.map(i => `${i.label} (${i.weeksLeft} sem)`).join(', ') : 'sin lesiones';
  return `<div class="card">
    <div class="attr-row"><span class="attr-name">Estado físico</span><span class="attr-val">${fat}</span></div>
    <div class="attr-row"><span class="attr-name">Lesiones</span><span class="attr-val" style="font-size:.85rem">${esc(injTxt)}</span></div>
  </div>`;
}

function offerCard(o) {
  const c = state.career;
  const opp = c.world.fighters.get(o.opponentId);
  return `<div class="card">
    ${scoutHTML(opp, c.world, c.world.week)}
    <div class="stat-line"><span class="l">Bolsa</span><span class="v">${moneyStr(o.purse)}</span></div>
    ${o.isTitle ? '<div class="chip hot">TÍTULO</div>' : ''}
    <button class="btn btn-primary btn-block" data-accept="${o.id}" style="margin-top:10px">Aceptar (camp de 8 semanas)</button>
  </div>`;
}

function slotSelectors(isCamp) {
  const labels = isCamp ? CAMP_ACTIVITY_LABELS : ACTIVITY_LABELS;
  let out = '';
  for (let i = 0; i < 3; i++) {
    const s = state._slots[i];
    out += `<div class="slot"><span class="num">${i + 1}</span>
      <select data-slot="${i}" data-kind="act">
        ${Object.keys(labels).map(a => `<option value="${a}" ${s.activity === a ? 'selected' : ''}>${labels[a]}</option>`).join('')}
      </select>
      ${subSelect(s, i)}
    </div>`;
  }
  return out;
}
function subSelect(s, i) {
  if (s.activity === 'train') {
    return `<select data-slot="${i}" data-kind="attr">${TECH_KEYS.map(k => `<option value="${k}" ${s.attr === k ? 'selected' : ''}>${attrShort(k)}</option>`).join('')}</select>`;
  }
  if (s.activity === 'conditioning') {
    return `<select data-slot="${i}" data-kind="focus">${PHYS_KEYS.map(k => `<option value="${k}" ${s.focus === k ? 'selected' : ''}>${attrShort(k)}</option>`).join('')}</select>`;
  }
  return '';
}
const SHORT = { boxing: 'Boxeo', kickboxing: 'Kickboxing', muayThai: 'Muay Thai', wrestling: 'Wrestling', bjj: 'Jiu-Jitsu', tdd: 'Def. derribo', clinch: 'Clinch', gnp: 'G&P', subs: 'Sumisiones', subDefense: 'Esc. sumisión', power: 'Potencia', speed: 'Velocidad', cardio: 'Cardio', strength: 'Fuerza', chin: 'Mentón', recovery: 'Recuperación' };
function attrShort(k) { return SHORT[k] || k; }

function defaultSlots(isCamp) {
  if (isCamp) return [{ activity: 'sparring' }, { activity: 'train', attr: 'boxing' }, { activity: 'rest' }];
  return [{ activity: 'train', attr: 'boxing' }, { activity: 'conditioning', focus: 'cardio' }, { activity: 'rest' }];
}

function wireWeek() {
  on('#slots [data-kind]', 'change', e => {
    const i = +e.target.dataset.slot, kind = e.target.dataset.kind, val = e.target.value;
    const s = state._slots[i];
    if (kind === 'act') { s.activity = val; if (val === 'train' && !s.attr) s.attr = 'boxing'; if (val === 'conditioning' && !s.focus) s.focus = 'cardio'; routeHub('semana'); }
    else if (kind === 'attr') s.attr = val;
    else if (kind === 'focus') s.focus = val;
  });
  on('[data-accept]', 'click', async e => {
    const id = +e.currentTarget.dataset.accept;
    state.career.offers = state.career.offers; // no-op
    const dec = { acceptOfferId: id };
    // aceptar entra a camp; avanzamos la semana con los slots actuales
    dec.slots = state._slots.map(cloneSlot);
    doAdvance(dec);
  });
  on('[data-cut]', 'click', e => { state.career.camp.cutDivisionId = e.currentTarget.dataset.cut; routeHub('semana'); });
  on('#advance', 'click', () => doAdvance({ slots: state._slots.map(cloneSlot) }));
}
function cloneSlot(s) { return { ...s }; }

async function doAdvance(baseDec) {
  const c = state.career;
  const rep = advanceWeek(c, baseDec, { interactive: true });
  c._dateLabel = rep.dateLabel || c._dateLabel;
  state._slots = null;
  if (rep.over) { await clearGame(); routeSummary(); return; }
  if (rep.fightPending) { await persist(); routeFight(); return; }
  await persist();
  routeHub('semana');
}

// ---- pestaña GYM ----
function gymTab() {
  const p = state.career.player;
  return `
    <div class="card">
      <div class="section-label">Físicos</div>
      ${attrGroupHTML(p, PHYS_KEYS, 'phys', true)}
    </div>
    <div class="card">
      <div class="section-label">Técnicos</div>
      ${attrGroupHTML(p, TECH_KEYS, 'tech', true)}
    </div>
    <div class="card">
      <div class="section-label">Mentales</div>
      ${mentalGroupHTML(p)}
    </div>
    <div class="faint center">▲ subiendo · ▬ estancado · ▼ bajando. Si entrenás y no sube, tocaste tu techo.</div>`;
}

// ---- pestaña RANKING ----
function rankingTab() {
  const c = state.career, p = c.player;
  const dv = c.world.divisions[p.divisionId];
  const champ = c.world.fighters.get(dv.champId);
  const rows = dv.ranking.map((id, i) => {
    const f = c.world.fighters.get(id);
    const me = id === p.id ? ' style="color:var(--amber-bright)"' : '';
    return `<div class="attr-row"${me}><span class="attr-name">#${i + 1} ${esc(f.name)}</span><span class="attr-val" style="font-size:.85rem">${recordStr(f)}</span></div>`;
  }).join('');
  const div = TUNING.DIVISIONS.find(d => d.id === p.divisionId);
  const myRank = dv.ranking.indexOf(p.id);
  return `
    <div class="card">
      <div class="section-label">Campeón — ${div.name}</div>
      <div class="fighter-corner" style="text-align:left"><div class="nm">${champ ? esc(champ.name) : '—'}</div><div class="cond">${champ ? recordStr(champ) : ''}</div></div>
    </div>
    <div class="card">
      <div class="section-label">Top ${TUNING.RANK_SIZE}</div>
      ${rows}
    </div>
    <div class="faint center">${myRank >= 0 ? 'Estás en el ranking.' : 'Todavía no entrás al top ' + TUNING.RANK_SIZE + '.'}</div>`;
}

// ---- pestaña PERFIL ----
function profileTab() {
  const c = state.career, p = c.player;
  const age = Math.round(ageYears(p, c.world.week));
  const tierName = ['Amateur', 'Regional', 'Nacional', 'Liga grande'][p.promotionTier];
  const lastFights = c.history.slice(-6).reverse().map(h => {
    const r = h.playerWon ? 'V' : h.draw ? 'E' : 'D';
    return `<div class="attr-row"><span class="attr-name">${r} vs ${esc(h.opponentName)}</span><span class="attr-val" style="font-size:.8rem">${esc(methodLabel(h.method))}${h.titleWon ? ' · TÍTULO' : ''}</span></div>`;
  }).join('') || '<div class="muted">Todavía no peleaste.</div>';
  return `
    <div class="card">
      <div class="stat-line"><span class="l">Récord</span><span class="v">${recordStr(p)}</span></div>
      <div class="stat-line"><span class="l">Edad</span><span class="v">${age} años</span></div>
      <div class="stat-line"><span class="l">Nivel</span><span class="v">${tierName}</span></div>
      <div class="stat-line"><span class="l">Base</span><span class="v">${archLabel(p.archetype)}</span></div>
    </div>
    <div class="card">
      <div class="section-label">Últimas peleas</div>
      ${lastFights}
    </div>
    <button class="btn btn-block" id="retire">Retirarse</button>
    <div class="faint center">Retirarse a tiempo es una decisión con peso. El daño no se cura.</div>`;
}

function methodLabel(m) {
  return { ko: 'KO', tko: 'TKO', doctor: 'TKO médico', submission: 'sumisión', unanimous: 'decisión unánime', split: 'decisión dividida', majority: 'decisión mayoritaria', draw: 'empate' }[m] || m;
}

// ================= FIGHT =================
function routeFight() {
  state.screen = 'fight';
  const ctrl = startFight(state.career);
  state.fight = { ctrl, log: [], round: 0, finished: false, result: null, chosen: false };
  renderFight();
}

function renderFight() {
  const c = state.career, p = c.player;
  const f = state.fight, ctrl = f.ctrl;
  const opp = c.world.fighters.get(c.camp.offer.opponentId);
  const condA = ctrl.conditionA(), condB = ctrl.conditionB();
  const logHTML = f.log.map(l => {
    let cls = 'logline';
    if (/^---/.test(l)) cls += ' rnd';
    if (/Nocaut|Tap|para la pelea|médico|desploma|cae!/.test(l)) cls += ' big';
    return `<div class="${cls}">${esc(l.replace(/^--- | ---$/g, ''))}</div>`;
  }).join('');

  let controls;
  if (f.finished) {
    controls = `<button class="btn btn-primary btn-block" id="fresult">Ver resultado</button>`;
  } else {
    controls = `
      <div class="section-label">Round ${f.round + 1} — tu decisión</div>
      <div class="intent-grid">
        ${INTENTS.map(k => `<button class="opt" data-intent="${k}"><span class="k">${INTENT_INFO[k][0]}</span><span class="d">${INTENT_INFO[k][1]}</span></button>`).join('')}
      </div>`;
  }

  render(`
    <div class="topbar">
      <div class="title" style="font-size:1.1rem">${c.camp.offer.isTitle ? 'PELEA DE TÍTULO' : 'PELEA'}</div>
      <div class="round-badge">R${Math.max(1, f.round)}/${ctrl.rounds}</div>
    </div>
    <div class="screen" style="padding-bottom:12px">
      <div class="fight-head card">
        <div class="fighter-corner"><div class="nm">${esc(p.name)}</div><div class="cond">${condA.dmg} · ${condA.sta}${condA.cut ? ' · ' + condA.cut : ''}</div></div>
        <div class="round-badge">vs</div>
        <div class="fighter-corner"><div class="nm">${esc(opp.name)}</div><div class="cond">${condB.dmg} · ${condB.sta}${condB.cut ? ' · ' + condB.cut : ''}</div></div>
      </div>
      <div class="fightlog card" id="log">${logHTML || '<div class="muted">Suena la campana.</div>'}</div>
      ${controls}
    </div>`);

  const logEl = app.querySelector('#log');
  if (logEl) logEl.scrollTop = logEl.scrollHeight;

  on('[data-intent]', 'click', e => playRound(e.currentTarget.dataset.intent));
  on('#fresult', 'click', showFightResult);
}

function playRound(intent) {
  const f = state.fight;
  const res = f.ctrl.playRound(intent);
  f.round = f.ctrl.round;
  // haptics segun lo que paso
  let heavy = false;
  for (const l of res.log) {
    f.log.push(l);
    if (/Nocaut|desploma|cae!/.test(l)) { hapticKO(); heavy = true; }
    else if (/conecta|castiga|contragolpea|rodilla|codo/.test(l)) { if (!heavy) hitLight(); }
  }
  if (res.finished) { f.finished = true; f.result = res.result; }
  renderFight();
}

async function showFightResult() {
  const c = state.career, f = state.fight;
  const fr = finishFight(c); // aplica economia/records/etc
  c._dateLabel = c._dateLabel;
  const won = fr.playerWon, draw = fr.draw;
  const verdict = won ? 'GANASTE' : draw ? 'EMPATE' : 'PERDISTE';
  const inc = fr.income.breakdown;
  render(`
    <div class="screen scroll center">
      <div class="hero" style="padding-top:30px"><div class="logo" style="font-size:2.4rem;color:${won ? 'var(--amber-bright)' : 'var(--ink)'}">${verdict}</div>
      <div class="tag">${methodLabel(fr.method)}${fr.round ? ' · round ' + fr.round : ''}</div></div>
      <div class="card" style="text-align:left">
        <div class="stat-line"><span class="l">Rival</span><span class="v">${esc(fr.opponentName)}</span></div>
        <div class="stat-line"><span class="l">Récord</span><span class="v">${fr.record.wins}-${fr.record.losses}-${fr.record.draws}</span></div>
        ${fr.titleWon ? '<div class="chip hot" style="margin-top:8px">¡SOS CAMPEÓN!</div>' : ''}
        ${fr.missedWeight ? '<div class="warn" style="margin-top:8px">Fallaste el pesaje: perdiste parte de la bolsa.</div>' : ''}
      </div>
      <div class="card" style="text-align:left">
        <div class="section-label">Bolsa</div>
        <div class="stat-line"><span class="l">Base</span><span class="v">${moneyStr(inc.purse)}</span></div>
        ${inc.winBonus ? `<div class="stat-line"><span class="l">Bonus victoria</span><span class="v">${moneyStr(inc.winBonus)}</span></div>` : ''}
        ${inc.finishBonus ? `<div class="stat-line"><span class="l">Bonus finalización</span><span class="v">${moneyStr(inc.finishBonus)}</span></div>` : ''}
        ${inc.perfBonus ? `<div class="stat-line"><span class="l">Bonus performance</span><span class="v">${moneyStr(inc.perfBonus)}</span></div>` : ''}
        ${inc.managerCut ? `<div class="stat-line"><span class="l">Manager</span><span class="v">-${moneyStr(inc.managerCut)}</span></div>` : ''}
        <div class="stat-line"><span class="l">Total</span><span class="v amber">${moneyStr(fr.income.total)}</span></div>
      </div>
      <button class="btn btn-primary btn-block" id="cont">Volver al gym</button>
    </div>`);
  state.fight = null;
  await persist();
  on('#cont', 'click', () => routeHub('semana'));
}

// ================= SUMMARY =================
function routeSummary() {
  const c = state.career;
  if (!c.summary) endCareer(c, 'voluntario');
  const s = c.summary;
  state.screen = 'summary';
  render(`
    <div class="screen scroll center">
      <div class="hero"><div class="logo" style="font-size:2.2rem">FIN DE CARRERA</div><div class="tag">${esc(reasonLabel(s.reason))}</div></div>
      <div class="card" style="text-align:left">
        <div class="stat-line"><span class="l">Récord</span><span class="v">${s.record}</span></div>
        <div class="stat-line"><span class="l">KO / Sub / Dec</span><span class="v">${s.detail.koWins}/${s.detail.subWins}/${s.detail.decWins}</span></div>
        <div class="stat-line"><span class="l">Títulos</span><span class="v">${s.titles || 'ninguno'}</span></div>
        <div class="stat-line"><span class="l">Peleas</span><span class="v">${s.totalFights}</span></div>
        <div class="stat-line"><span class="l">Plata ganada</span><span class="v">${moneyStr(s.moneyEarned)}</span></div>
        <div class="stat-line"><span class="l">Se retiró a los</span><span class="v">${s.ageAtRetire}</span></div>
        <div class="stat-line"><span class="l">Cómo quedás</span><span class="v" style="font-size:.85rem">${esc(s.damageDescriptor)}</span></div>
      </div>
      <div class="closing">${esc(s.honestLine)}</div>
      <button class="btn btn-primary btn-block" id="again" style="margin-top:16px">Nueva carrera</button>
    </div>`);
  on('#again', 'click', async () => { await clearGame(); state.career = null; startCreate(); });
}
function reasonLabel(r) { return { voluntario: 'Retiro voluntario', edad: 'El cuerpo dijo basta', daño: 'Demasiado daño', 'sin ofertas': 'Nadie te ofrece peleas' }[r] || r; }

// arranque
boot();
