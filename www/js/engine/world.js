// world.js — 400 peleadores, divisiones, matchmaking, ranking, promotoras, envejecimiento.
// El mundo avanza cada semana aunque el jugador no lo mire.

import { TUNING } from './tuning.js';
import { Rng, clamp } from './rng.js';
import { createFighter, resetIdCounter, ageYears } from './fighter.js';
import { PHYS_KEYS, TECH_KEYS } from './attributes.js';
import { ARCHETYPE_BIAS } from './tuning.js';
import { simulateFight } from './fight-engine.js';
import { applyFightDamage, recoverInjuries } from './injury.js';
import { applyAgeDecay, passiveRecover, mentalAfterFight } from './progression.js';
import { genName } from './names.js';
import { CAMP_WEEKS } from './calendar.js';

// ---- Maduracion de un NPC hasta su edad (aproximacion barata) ----
export function overallSkill(f) {
  let te = 0; for (const k of TECH_KEYS) te += f.tech[k]; te /= TECH_KEYS.length;
  let ph = 0; for (const k of PHYS_KEYS) ph += f.phys[k]; ph /= PHYS_KEYS.length;
  return te * 0.5 + ph * 0.3 + f.ment.fightIQ * 0.2;
}

function ageGrowth(curAge) {
  for (const b of TUNING.AGE_BANDS) if (curAge <= b.maxAge) return b.growth;
  return 0.05;
}
function ageDecayObj(curAge) {
  for (const b of TUNING.AGE_BANDS) if (curAge <= b.maxAge) return b.decay;
  return {};
}

function matureFighter(f, targetAge, rng) {
  const bias = ARCHETYPE_BIAS[f.archetype];
  const years = Math.max(0, Math.floor(targetAge - 18));
  for (let y = 0; y < years; y++) {
    const curAge = 18 + y;
    const gM = ageGrowth(curAge);
    // tecnicos: crecen segun foco de arquetipo (mas rapido lo priorizado)
    for (const k of TECH_KEYS) {
      const focus = 0.14 + Math.max(0, (bias[k] || 0)) * 0.012 + rng.uniform(-0.02, 0.02);
      const room = clamp((f.caps[k] - f.tech[k]) / TUNING.CAP_APPROACH, 0, 1);
      f.tech[k] = Math.min(f.caps[k], f.tech[k] + (f.caps[k] - f.tech[k]) * focus * room);
    }
    // fisicos: crecen con gM y decaen por edad
    for (const k of PHYS_KEYS) {
      const room = clamp((f.caps[k] - f.phys[k]) / TUNING.CAP_APPROACH, 0, 1);
      f.phys[k] = Math.min(f.caps[k], f.phys[k] + (f.caps[k] - f.phys[k]) * 0.18 * gM * room);
      const dec = (ageDecayObj(curAge)[k] || 0);
      f.phys[k] = Math.max(TUNING.AGE_PHYS_FLOOR, f.phys[k] - dec);
    }
  }
  // experiencia mental por edad
  f.ment.fightIQ = clamp(25 + years * 3.2 + rng.uniform(-5, 5), 20, 100);
  f.ment.grit = clamp(f.ment.grit + years * 1.5 + rng.uniform(-5, 5), 20, 100);
  f.ment.confidence = clamp(f.ment.confidence + rng.uniform(-8, 12), 20, 100);
}

function assignTierAndElo(f, rng) {
  const sk = overallSkill(f);
  f.ratingElo = Math.round(1000 + sk * 8 + rng.uniform(-60, 60));
  const e = f.ratingElo;
  if (e >= TUNING.PROMOTE_RATING[3]) f.promotionTier = 3;
  else if (e >= TUNING.PROMOTE_RATING[2]) f.promotionTier = 2;
  else if (e >= TUNING.PROMOTE_RATING[1]) f.promotionTier = 1;
  else f.promotionTier = 0;
  // record ficticio coherente con edad/tier
  const years = Math.max(0, ageYears(f, 0) - 18);
  const fights = Math.round(years * rng.uniform(2, 4));
  const wr = clamp(0.4 + (sk - 55) / 120, 0.2, 0.85);
  f.record.wins = Math.round(fights * wr);
  f.record.losses = fights - f.record.wins;
  f.record.koWins = Math.round(f.record.wins * 0.3);
  f.record.decWins = f.record.wins - f.record.koWins;
}

export function generateWorld(seed) {
  const rng = new Rng(seed);
  resetIdCounter(1);
  const world = {
    seed, rng, week: 0,
    fighters: new Map(),
    divisions: {},
    playerId: null,
    eventsLog: [],
  };
  for (const d of TUNING.DIVISIONS) world.divisions[d.id] = { champId: null, ranking: [] };

  const perDiv = Math.round(TUNING.WORLD_SIZE / TUNING.DIVISIONS.length);
  for (const d of TUNING.DIVISIONS) {
    for (let i = 0; i < perDiv; i++) {
      const age = rng.triangular(18, 27, 39);
      const arche = rng.pick(['striker', 'wrestler', 'grappler', 'complete']);
      const f = createFighter({ isPlayer: false, archetype: arche, divisionId: d.id, currentWeek: 0, ageInit: age }, rng);
      f.name = genName(rng);
      matureFighter(f, age, rng);
      assignTierAndElo(f, rng);
      f.contractPromoterId = f.promotionTier;
      f.nextFightWeek = rng.int(1, 16);
      world.fighters.set(f.id, f);
    }
  }
  // subclase amateur: jovenes crudos que dan un escalon real de entrada al jugador.
  for (const d of TUNING.DIVISIONS) {
    for (let i = 0; i < 8; i++) {
      const arche = rng.pick(['striker', 'wrestler', 'grappler', 'complete']);
      const f = createFighter({ isPlayer: false, archetype: arche, divisionId: d.id, currentWeek: 0, ageInit: rng.uniform(18, 21) }, rng);
      f.name = genName(rng);
      matureFighter(f, 18 + rng.uniform(0, 1.5), rng);
      f.ratingElo = Math.round(rng.uniform(940, 1140)); // amateur crudo
      f.promotionTier = 0; f.contractPromoterId = 0;
      f.nextFightWeek = rng.int(1, 12);
      world.fighters.set(f.id, f);
    }
  }
  recomputeRankings(world);
  return world;
}

// ---- Ranking y campeon ----
export function divisionFighters(world, divId, includeRetired = false) {
  const out = [];
  for (const f of world.fighters.values()) {
    if (f.divisionId !== divId) continue;
    if (!includeRetired && f.retired) continue;
    out.push(f);
  }
  out.sort((a, b) => b.ratingElo - a.ratingElo);
  return out;
}

export function recomputeRankings(world) {
  for (const d of TUNING.DIVISIONS) {
    const list = divisionFighters(world, d.id);
    const dv = world.divisions[d.id];
    dv.ranking = list.slice(0, TUNING.RANK_SIZE).map(f => f.id);
    if (!dv.champId || !world.fighters.get(dv.champId) || world.fighters.get(dv.champId).retired) {
      dv.champId = list.length ? list[0].id : null;
    }
  }
}

// ---- Elo ----
function eloExpected(ra, rb) { return 1 / (1 + Math.pow(10, (rb - ra) / 400)); }
function updateElo(winner, loser, draw, tier) {
  const k = TUNING.ELO_K_BY_TIER[tier] || 16;
  const ea = eloExpected(winner.ratingElo, loser.ratingElo);
  const sa = draw ? 0.5 : 1;
  winner.ratingElo += k * (sa - ea);
  loser.ratingElo += k * ((1 - sa) - (1 - ea));
}

// ---- Procesar resultado de una pelea (compartido AI y jugador) ----
export function processFightOutcome(world, fA, fB, res) {
  const aWon = res.winnerSide === 'A';
  const bWon = res.winnerSide === 'B';
  const draw = res.winnerSide === 'draw';
  const winner = aWon ? fA : fB;
  const loser = aWon ? fB : fA;

  // dano de carrera
  const aGotKOd = bWon && (res.method === 'ko' || res.method === 'tko');
  const bGotKOd = aWon && (res.method === 'ko' || res.method === 'tko');
  applyFightDamage(fA, res.damageA, aGotKOd);
  applyFightDamage(fB, res.damageB, bGotKOd);

  // records
  const tier = Math.max(fA.promotionTier, fB.promotionTier);
  if (draw) {
    fA.record.draws++; fB.record.draws++;
    updateElo(fA, fB, true, tier);
    fA.lossStreak = 0; fB.lossStreak = 0;
  } else {
    winner.record.wins++; loser.record.losses++;
    if (res.method === 'ko' || res.method === 'tko' || res.method === 'doctor') { winner.record.koWins++; loser.record.koLosses++; }
    else if (res.method === 'submission') { winner.record.subWins++; loser.record.subLosses++; }
    else { winner.record.decWins++; loser.record.decLosses++; }
    updateElo(winner, loser, false, tier);
    winner.lossStreak = 0;
    loser.lossStreak++;
  }

  // mental
  const aStronger = fB.ratingElo > fA.ratingElo + 40;
  const bStronger = fA.ratingElo > fB.ratingElo + 40;
  mentalAfterFight(fA, aWon, aWon ? res.method : res.method, bStronger);
  mentalAfterFight(fB, bWon, res.method, aStronger);

  // lesion de pelea posible para el perdedor / por corte
  if (res.method === 'doctor') addFightInjury(loser, 'cut', world.rng);
  if (world.rng.chance(0.08)) addFightInjury(loser, world.rng.pick(['cut', 'hand']), world.rng);
  if (world.rng.chance(0.04)) addFightInjury(winner, 'hand', world.rng);

  // promocion / corte
  handlePromotion(winner);
  if (!draw) handleRelegation(loser);

  return { winner, loser, draw };
}

function addFightInjury(f, type, rng) {
  const spec = TUNING.INJURY_TYPES[type];
  if (!spec) return;
  const [wmin, wmax] = spec.weeks;
  f.injuries.push({ type, label: spec.label, weeksLeft: rng.int(wmin, wmax), totalWeeks: wmax });
}

export function deriveTierFromElo(elo) {
  if (elo >= TUNING.PROMOTE_RATING[3]) return 3;
  if (elo >= TUNING.PROMOTE_RATING[2]) return 2;
  if (elo >= TUNING.PROMOTE_RATING[1]) return 1;
  return 0;
}

// NPCs: tier = nivel de elo (skill), sin cascada. Jugador: promocion por record (hito de carrera).
function handlePromotion(f) {
  if (!f.isPlayer) {
    const t = deriveTierFromElo(f.ratingElo);
    if (t > f.promotionTier) { f.promotionTier = t; f.contractPromoterId = t; }
    return;
  }
  const t = f.promotionTier;
  if (t >= 3) return;
  if (f.record.wins < TUNING.PROMOTE_WINS[t]) return;
  // amateur (t0->1) se gradua por record; tiers pagos requieren tambien elo que lo justifique.
  if (t >= 1 && f.ratingElo < TUNING.PROMOTE_RATING[t + 1] - 40) return;
  f.promotionTier = t + 1;
  f.contractPromoterId = t + 1;
}
function handleRelegation(f) {
  if (!f.isPlayer) {
    // NPC: su tier sigue al elo; una mala racha le baja el elo y el tier se ajusta solo.
    const t = deriveTierFromElo(f.ratingElo);
    if (t < f.promotionTier) { f.promotionTier = t; f.contractPromoterId = t; }
    return;
  }
  if (f.lossStreak >= TUNING.CUT_LOSS_STREAK) {
    f.lossStreak = 0;
    // el circuito amateur (tier 0) no tiene contrato que cortar: seguis peleando amateurs.
    if (f.promotionTier > 0) { f.promotionTier--; f.contractPromoterId = f.promotionTier; }
    else { f.contractPromoterId = 0; }
    f.weeksSinceLastOffer = 0;
  }
}

// ---- Retiro ----
function checkRetirement(world, f) {
  if (f.retired || f.isPlayer) return;
  const age = ageYears(f, world.week);
  let p = 0;
  if (age >= 40) p = 1;
  else if (age >= 37) p = 0.12;
  else if (age >= 34) p = 0.03;
  if (f.careerDamage > 1500) p = Math.max(p, 0.25);
  if (f.contractPromoterId === null && f.weeksSinceLastOffer > TUNING.OFFER_DROUGHT) p = Math.max(p, 0.3);
  if (world.rng.chance(p / 8)) { // p es anual aprox; se evalua semanal
    f.retired = true;
    f.retiredReason = age >= 37 ? 'edad' : (f.careerDamage > 1500 ? 'daño' : 'sin ofertas');
  }
}

// ---- Auto-entrenamiento semanal barato de un NPC ----
function aiWeeklyTrain(world, f) {
  const bias = ARCHETYPE_BIAS[f.archetype];
  // sube 1-2 tecnicos priorizados hacia el cap (lento)
  const rng = world.rng;
  for (let n = 0; n < 2; n++) {
    const k = TECH_KEYS[rng.int(0, TECH_KEYS.length - 1)];
    const w = 0.08 + Math.max(0, (bias[k] || 0)) * 0.01;
    const room = clamp((f.caps[k] - f.tech[k]) / TUNING.CAP_APPROACH, 0, 1);
    f.tech[k] = Math.min(f.caps[k], f.tech[k] + (f.caps[k] - f.tech[k]) * w * room * 0.15);
  }
}

// ---- Tick semanal del mundo ----
export function worldTick(world) {
  world.week++;
  const week = world.week;

  // 1) envejecer / recuperar / auto-entrenar / retiro
  for (const f of world.fighters.values()) {
    if (f.retired) continue;
    applyAgeDecay(f, week);
    passiveRecover(f, week);
    recoverInjuries(f, false);
    if (!f.isPlayer) {
      aiWeeklyTrain(world, f);
      f.weeksSinceLastOffer++;
      checkRetirement(world, f);
    }
  }

  // 2) matchmaking + peleas IA (silent)
  simulateAIFights(world);

  // 3) titulos: cada ~18 semanas, campeon defiende vs #1
  if (week % 18 === 0) simulateTitleFights(world);

  // 4) ranking
  recomputeRankings(world);

  // 5) rookies cada 52 semanas
  if (week % 52 === 0) injectRookies(world);
}

function simulateAIFights(world) {
  const week = world.week;
  for (const d of TUNING.DIVISIONS) {
    const due = [];
    for (const f of world.fighters.values()) {
      if (f.divisionId !== d.id || f.retired || f.isPlayer) continue;
      if (f.contractPromoterId === null) continue;
      if (f.nextFightWeek > week) continue;
      if (f.injuries.some(i => i.weeksLeft > 0)) { f.nextFightWeek = week + 2; continue; }
      due.push(f);
    }
    due.sort((a, b) => b.ratingElo - a.ratingElo);
    for (let i = 0; i + 1 < due.length; i += 2) {
      const a = due[i], b = due[i + 1];
      a.weeksSinceLastOffer = 0; b.weeksSinceLastOffer = 0;
      const res = simulateFight(a, b, { rng: world.rng.fork(week * 100003 + a.id * 31 + b.id), rounds: 3, verbose: false, currentWeek: week });
      processFightOutcome(world, a, b, res);
      a.nextFightWeek = week + world.rng.int(10, 20);
      b.nextFightWeek = week + world.rng.int(10, 20);
    }
  }
}

function simulateTitleFights(world) {
  const week = world.week;
  for (const d of TUNING.DIVISIONS) {
    const dv = world.divisions[d.id];
    const champ = world.fighters.get(dv.champId);
    if (!champ || champ.retired) continue;
    const contenderId = dv.ranking.find(id => id !== dv.champId);
    const contender = world.fighters.get(contenderId);
    if (!contender || contender.retired) continue;
    if (champ.injuries.some(i => i.weeksLeft > 0) || contender.injuries.some(i => i.weeksLeft > 0)) continue;
    const res = simulateFight(champ, contender, { rng: world.rng.fork(week * 777 + champ.id), rounds: 5, verbose: false, currentWeek: week });
    processFightOutcome(world, champ, contender, res);
    if (res.winnerSide === 'B') { dv.champId = contender.id; world.eventsLog.push({ week, type: 'title', text: `${contender.name} es el nuevo campeón de ${d.name}.` }); }
  }
}

function injectRookies(world) {
  const perDiv = 6;
  for (const d of TUNING.DIVISIONS) {
    for (let i = 0; i < perDiv; i++) {
      const arche = world.rng.pick(['striker', 'wrestler', 'grappler', 'complete']);
      const f = createFighter({ isPlayer: false, archetype: arche, divisionId: d.id, currentWeek: world.week, ageInit: world.rng.uniform(18, 21) }, world.rng);
      f.name = genName(world.rng);
      assignTierAndElo(f, world.rng);
      f.ratingElo = Math.min(f.ratingElo, 1150);
      f.promotionTier = 0;
      f.contractPromoterId = 0;
      f.nextFightWeek = world.week + world.rng.int(1, 12);
      world.fighters.set(f.id, f);
    }
  }
}

export function activeCount(world) {
  let n = 0; for (const f of world.fighters.values()) if (!f.retired) n++; return n;
}
