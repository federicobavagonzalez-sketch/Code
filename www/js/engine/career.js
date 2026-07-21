// career.js — estado de la carrera del jugador; orquesta el ciclo semanal.

import { TUNING } from './tuning.js';
import { clamp } from './rng.js';
import { createFighter, ageYears, chinEffectiveCap } from './fighter.js';
import { generateWorld, worldTick, processFightOutcome, recomputeRankings, divisionFighters, overallSkill, pushEvent } from './world.js';
import { applySlot, passiveRecover, applyAgeDecay, recoverInjuries } from './progression.js';
import { simulateFight, aiChooseIntent, createFightController } from './fight-engine.js';
import { computePurse, fightIncome, applyMissWeight, managerCut, chargeWeekly } from './economy.js';
import { genName } from './names.js';
import { CAMP_WEEKS, formatWeek } from './calendar.js';
import { damageDescriptor, PHYS_KEYS, TECH_KEYS } from './attributes.js';

// Tendencia de atributos (▲▬▼) via media movil, sin exponer numeros.
function updateTrends(player) {
  if (!player._ema) {
    player._ema = {}; player._trend = {};
    for (const k of PHYS_KEYS) player._ema[k] = player.phys[k];
    for (const k of TECH_KEYS) player._ema[k] = player.tech[k];
  }
  const upd = (layer, k) => {
    const cur = layer[k], ema = player._ema[k];
    const diff = cur - ema;
    player._trend[k] = diff > 0.12 ? 'up' : diff < -0.12 ? 'down' : 'flat';
    player._ema[k] = ema + (cur - ema) * 0.25;
  };
  for (const k of PHYS_KEYS) upd(player.phys, k);
  for (const k of TECH_KEYS) upd(player.tech, k);
}

let _offerId = 1;

export function createCareer(seed, opts = {}) {
  const world = generateWorld(seed);
  const player = createFighter({
    isPlayer: true,
    name: opts.name || 'Vos',
    archetype: opts.archetype || 'complete',
    divisionId: opts.divisionId || 'light',
    currentWeek: 0,
    ageInit: opts.ageInit || 19,
  }, world.rng);
  player.coachLevel = 0;
  player.coachMult = TUNING.COACH_LEVELS[0].mult; // gym de barrio
  player.contractPromoterId = 0;
  player.promotionTier = 0;
  // amateur crudo: elo bajo fijo (aunque sea atletico, su tecnica es de barrio).
  // lo empareja con la subclase amateur; sube ganando.
  player.ratingElo = 1030;
  world.fighters.set(player.id, player);
  world.playerId = player.id;
  recomputeRankings(world);

  const career = {
    world, player, seed,
    phase: 'normal',     // 'normal' | 'camp'
    camp: null,          // { offer, weeksLeft, cutDivisionId }
    offers: [],
    history: [],         // peleas del jugador
    over: false, summary: null,
  };
  refreshOffers(career);
  return career;
}

// ---- Ofertas ----
function refreshOffers(career) {
  const { world, player } = career;
  if (player.contractPromoterId === null) { career.offers = []; return; }
  const pool = divisionFighters(world, player.divisionId).filter(f => f.id !== player.id && !f.retired && !f.injuries.some(i => i.weeksLeft > 0));
  // franja alrededor del jugador: un escalon leve hacia arriba habilita subir ganando.
  let near = pool.filter(f => f.ratingElo >= player.ratingElo - 90 && f.ratingElo <= player.ratingElo + 150);
  if (near.length === 0) { // ensanchar si la franja esta vacia
    near = pool.filter(f => Math.abs(f.ratingElo - player.ratingElo) < 260);
  }
  const offers = [];
  const pick = (arr) => arr.length ? arr[world.rng.int(0, arr.length - 1)] : null;
  // 1-2 ofertas razonables (el manager consigue una más)
  const nOffers = world.rng.int(1, 2) + (player.hasManager ? 1 : 0);
  for (let i = 0; i < nOffers; i++) {
    const opp = pick(near.length ? near : pool);
    if (opp) offers.push(makeOffer(career, opp, false));
  }
  // trampa ocasional (rival muy superior, bolsa mayor) — sin advertencia
  if (world.rng.chance(0.25)) {
    const tough = pool.filter(f => f.ratingElo > player.ratingElo + 180);
    const opp = pick(tough);
    if (opp) offers.push(makeOffer(career, opp, false));
  }
  // pelea de titulo si corresponde
  const dv = world.divisions[player.divisionId];
  const isContender = dv.ranking.indexOf(player.id) >= 0 && dv.ranking.indexOf(player.id) <= 3;
  if (isContender && player.promotionTier === 3 && dv.champId && dv.champId !== player.id && world.rng.chance(0.8)) {
    offers.push(makeOffer(career, world.fighters.get(dv.champId), true));
  }
  career.offers = offers;
}

function makeOffer(career, opp, isTitle) {
  const { player } = career;
  let purse = computePurse(player.promotionTier, player.ratingElo);
  if (player.hasManager) purse = Math.round(purse * TUNING.MANAGER_PURSE_BOOST);
  return {
    id: _offerId++,
    opponentId: opp.id,
    opponentName: opp.name,
    weekTarget: career.world.week + CAMP_WEEKS,
    purse, isTitle,
    divisionId: player.divisionId,
  };
}

export function acceptOffer(career, offerId, cutDivisionId = null) {
  const offer = career.offers.find(o => o.id === offerId);
  if (!offer) return false;
  career.phase = 'camp';
  career.camp = { offer, weeksLeft: CAMP_WEEKS, cutDivisionId: cutDivisionId || career.player.divisionId };
  career.player.gamePlanFit = 0;
  career.offers = [];
  career.player.weeksSinceLastOffer = 0;
  return true;
}

// ---- Corte de peso ----
function buildCutContext(career) {
  const { player, camp, world } = career;
  const div = TUNING.DIVISIONS.find(d => d.id === camp.cutDivisionId);
  const cutKg = Math.max(0, player.naturalWeightKg - div.limit);
  const cutFrac = cutKg / player.naturalWeightKg;
  const relief = player.hasNutritionist ? TUNING.NUTRITION_CUT_RELIEF : 1.0;
  let missed = false;
  if (cutFrac > TUNING.SAFE_FRAC) {
    const pMiss = clamp((cutFrac - TUNING.SAFE_FRAC) / (TUNING.MAX_FRAC - TUNING.SAFE_FRAC) * (1.5 - player.ment.discipline / 100) * relief, 0, 0.9);
    missed = world.rng.chance(pMiss);
  }
  return { cutFrac, missedWeight: missed, divisionId: camp.cutDivisionId, relief };
}

// ---- Avance de una semana ----
// decisions.slots: array de 3 (fuera de camp) o de camp.
// decisions.acceptOfferId, decisions.cutDivisionId, decisions.retire
// opts.fightDecider(self, opp, state) -> intent  (para resolver la pelea; UI puede interceptar)
export function advanceWeek(career, decisions = {}, opts = {}) {
  if (career.over) return { over: true };
  const { world, player } = career;
  const report = { week: world.week + 1, dateLabel: '', slotResults: [], injuries: [], fight: null, events: [] };

  if (decisions.retire) return endCareer(career, 'voluntario');

  // aceptar oferta (solo fuera de camp)
  if (career.phase === 'normal' && decisions.acceptOfferId != null) {
    acceptOffer(career, decisions.acceptOfferId, decisions.cutDivisionId);
  }

  // aplicar slots
  const slots = decisions.slots || [];
  for (const s of slots) applySlot(player, s.activity, s, world.week, world.rng, report);

  // camp: game plan fit sube con slots de sparring/train en camp
  if (career.phase === 'camp') {
    const campWork = slots.filter(s => s.activity === 'sparring' || s.activity === 'train').length;
    player.gamePlanFit = clamp(player.gamePlanFit + campWork * 0.06, 0, 1);
  }

  // cierre de semana del jugador
  applyAgeDecay(player, world.week + 1);
  passiveRecover(player, world.week + 1);
  const rested = slots.some(s => s.activity === 'rest');
  recoverInjuries(player, rested);
  const costs = chargeWeekly(player);
  report.costs = costs;

  updateTrends(player);

  // avanzar el mundo
  worldTick(world);

  // resolver pelea si el camp llego a la fecha
  if (career.phase === 'camp') {
    career.camp.weeksLeft--;
    if (career.camp.weeksLeft <= 0) {
      if (opts.interactive) {
        // no auto-resolver: la UI maneja la pelea via startFight()/finishFight().
        career._pendingFight = true;
        report.fightPending = true;
        report.dateLabel = formatWeek(world.week);
        report.phase = 'camp';
        return report;
      }
      report.fight = resolvePlayerFight(career, opts.fightDecider || null);
      career.phase = 'normal';
      career.camp = null;
    }
  }

  // ofertas y presion por inactividad
  if (career.phase === 'normal') {
    if (career.offers.length === 0) refreshOffers(career);
    if (career.offers.length === 0) player.weeksSinceLastOffer++;
    // retiro forzado por sequia de ofertas o edad/dano extremos
    const age = ageYears(player, world.week);
    if (player.weeksSinceLastOffer > TUNING.OFFER_DROUGHT) return endCareer(career, 'sin ofertas');
    if (age >= 41) return endCareer(career, 'edad');
    if (player.careerDamage > 1800) return endCareer(career, 'daño');
  }

  report.dateLabel = formatWeek(world.week);
  report.bankroll = player.bankroll;
  report.phase = career.phase;
  return report;
}

// ---- Armado de la pelea del jugador ----
function buildFightSetup(career) {
  const { world, player, camp } = career;
  const opp = world.fighters.get(camp.offer.opponentId);
  const cutA = buildCutContext(career);
  const rounds = camp.offer.isTitle ? TUNING.ROUNDS_TITLE : TUNING.ROUNDS_NORMAL;
  const rng = world.rng.fork(world.week * 91 + player.id + opp.id);
  return { opp, cutA, rounds, rng };
}

// Aplica el resultado de una pelea (economia, records, elo, titulo, historia). Compartido.
function applyFightOutcome(career, res, setup) {
  const { world, player, camp } = career;
  const { opp, cutA } = setup;
  const playerWon = res.winnerSide === 'A';
  const draw = res.winnerSide === 'draw';

  const isHighlight = world.rng.chance(0.2) || (playerWon && res.method !== 'unanimous' && res.method !== 'split' && res.method !== 'majority');
  const income = fightIncome(player, playerWon, res.method, isHighlight);
  if (cutA.missedWeight) applyMissWeight(income);
  if (player.hasManager) managerCut(income);
  player.bankroll += income.total;

  const dv = world.divisions[player.divisionId];
  let titleWon = false;
  if (camp.offer.isTitle && playerWon) {
    dv.champId = player.id; titleWon = true;
    const divName = TUNING.DIVISIONS.find(d => d.id === player.divisionId).name;
    pushEvent(world, player.divisionId, `${player.name} conquista el título de ${divName}.`);
  }

  processFightOutcome(world, player, opp, res);
  recomputeRankings(world);

  const fr = {
    opponentName: opp.name, method: res.method, round: res.round,
    playerWon, draw, log: res.log, income, titleWon,
    missedWeight: cutA.missedWeight, isTitle: camp.offer.isTitle,
    record: { ...player.record },
  };
  career.history.push(fr);
  return fr;
}

// Auto-resolucion (headless / IA jugando al jugador).
function resolvePlayerFight(career, fightDecider) {
  const { world, player } = career;
  const setup = buildFightSetup(career);
  const decideA = fightDecider || ((s, o, st) => aiChooseIntent(s, o, st, world.rng));
  const res = simulateFight(player, setup.opp, {
    rng: setup.rng, rounds: setup.rounds, verbose: true, currentWeek: world.week,
    cutA: setup.cutA, cutB: null, decideA,
  });
  return applyFightOutcome(career, res, setup);
}

// ---- Pelea interactiva (UI) ----
// Devuelve un controlador; la UI llama playRound(intent) hasta finished, luego career.finishFight().
export function startFight(career) {
  if (!career._pendingFight) return null;
  const setup = buildFightSetup(career);
  career._fightSetup = setup;
  const ctrl = createFightController(player_(career), setup.opp, {
    rng: setup.rng, rounds: setup.rounds, currentWeek: career.world.week,
    cutA: setup.cutA, cutB: null,
  });
  career._fightController = ctrl;
  return ctrl;
}

export function finishFight(career) {
  const ctrl = career._fightController;
  const setup = career._fightSetup;
  if (!ctrl || !setup) return null;
  const res = ctrl.getResult();
  const fr = applyFightOutcome(career, res, setup);
  career._pendingFight = false;
  career._fightController = null;
  career._fightSetup = null;
  career.phase = 'normal';
  career.camp = null;
  // ofertas nuevas tras la pelea
  refreshOffers(career);
  return fr;
}

function player_(career) { return career.player; }

// ---- Gestión del equipo (gastar plata) ----
export function upgradeCoach(career) {
  const p = career.player;
  const next = p.coachLevel + 1;
  if (next >= TUNING.COACH_LEVELS.length) return { ok: false, reason: 'máximo' };
  const cost = TUNING.COACH_LEVELS[next].cost;
  if (p.bankroll < cost) return { ok: false, reason: 'sin plata' };
  p.bankroll -= cost;
  p.coachLevel = next;
  p.coachMult = TUNING.COACH_LEVELS[next].mult;
  return { ok: true };
}

export function setNutritionist(career, on) {
  career.player.hasNutritionist = !!on;
  return { ok: true };
}

export function setManager(career, on) {
  career.player.hasManager = !!on;
  return { ok: true };
}

// ---- Fin de carrera + resumen ----
export function endCareer(career, reason) {
  const { player, world } = career;
  player.retired = true; player.retiredReason = reason;
  career.over = true;
  const titles = career.history.filter(h => h.titleWon).length;
  const wins = player.record.wins, losses = player.record.losses, draws = player.record.draws;
  career.summary = {
    reason,
    record: `${wins}-${losses}-${draws}`,
    detail: { koWins: player.record.koWins, subWins: player.record.subWins, decWins: player.record.decWins },
    titles,
    everChampion: titles > 0,
    moneyEarned: Math.round(player.bankroll),
    totalFights: career.history.length,
    ageAtRetire: Math.round(ageYears(player, world.week)),
    damageDescriptor: damageDescriptor(player.careerDamage),
    honestLine: honestClosingLine(player, world, titles),
  };
  return { over: true, summary: career.summary };
}

function honestClosingLine(player, world, titles) {
  const age = ageYears(player, world.week);
  if (titles > 0 && player.careerDamage < 1000) return 'Te fuiste como campeón y con la cabeza en su lugar. Casi nadie lo logra.';
  if (titles > 0) return 'Ganaste el cinturón, pero el cuerpo lo pagó. Valió la pena, decís.';
  if (player.careerDamage > 1500) return 'Nunca llegó el título y el cuerpo quedó hecho pedazos. La mayoría termina así.';
  if (age >= 37) return 'Peleaste hasta que el cuerpo dijo basta. Sin cinturón, pero enteros son pocos.';
  return 'No llegaste al título. Como la mayoría. Te sacás los guantes y seguís.';
}

export { formatWeek };
