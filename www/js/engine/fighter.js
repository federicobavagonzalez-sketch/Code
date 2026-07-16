// fighter.js — creacion de peleador, caps ocultos, atributos efectivos.
// El mismo objeto sirve para el jugador y para los 400 de la IA.

import { TUNING, ARCHETYPE_BIAS } from './tuning.js';
import { PHYS_KEYS, TECH_KEYS, MENT_KEYS } from './attributes.js';
import { clamp } from './rng.js';

let _idCounter = 1;
export function resetIdCounter(v = 1) { _idCounter = v; }

const ARCHETYPES = ['striker', 'wrestler', 'grappler', 'complete'];

// Peso natural tipico por division (arriba del limite, hay que cortar un poco).
function naturalWeightFor(division, rng) {
  return division.limit + rng.uniform(2, division.limit * 0.09);
}

export function ageYears(fighter, currentWeek) {
  return (currentWeek - fighter.birthWeekIndex) / 52;
}

function rollCaps(archetype, isPlayer, rng) {
  const T0 = rng.triangular(TUNING.TALENT_TRI.min, TUNING.TALENT_TRI.mode, TUNING.TALENT_TRI.max);
  const T = isPlayer ? Math.max(T0, TUNING.PLAYER_TALENT_FLOOR) : T0;
  const bias = ARCHETYPE_BIAS[archetype];
  const caps = {};
  for (const k of [...PHYS_KEYS, ...TECH_KEYS]) {
    const spread = rng.uniform(-TUNING.CAP_SPREAD, TUNING.CAP_SPREAD);
    caps[k] = Math.round(clamp(T + (bias[k] || 0) + spread, TUNING.CAP_FLOOR, TUNING.CAP_HARD_MAX));
  }
  return caps;
}

export function createFighter(opts, rng) {
  const {
    isPlayer = false, name = null, archetype = null,
    divisionId = null, currentWeek = 0, ageInit = null,
  } = opts;

  const arche = archetype || rng.pick(ARCHETYPES);
  const division = TUNING.DIVISIONS.find(d => d.id === divisionId) || rng.pick(TUNING.DIVISIONS);
  const age = ageInit != null ? ageInit : rng.uniform(18, 21);
  const birthWeekIndex = Math.round(currentWeek - age * 52);
  const caps = rollCaps(arche, isPlayer, rng);

  const phys = {}, tech = {}, ment = {};
  for (const k of PHYS_KEYS) phys[k] = Math.min(rng.uniform(45, 60), caps[k]);
  for (const k of TECH_KEYS) tech[k] = Math.min(rng.uniform(6, 18), caps[k]);
  ment.fightIQ = rng.uniform(20, 35);
  ment.grit = rng.uniform(30, 50);
  ment.confidence = rng.uniform(35, 50);
  ment.discipline = rng.uniform(30, 55);

  const f = {
    id: _idCounter++,
    name: name || null,
    isPlayer,
    controller: isPlayer ? 'human' : 'ai',
    birthWeekIndex,
    archetype: arche,
    naturalWeightKg: naturalWeightFor(division, rng),
    divisionId: division.id,
    phys, tech, ment, caps,
    fatigue: 0,
    injuries: [],
    careerDamage: 0,
    chinCapPenalty: 0,
    record: { wins: 0, losses: 0, draws: 0, koWins: 0, subWins: 0, decWins: 0, koLosses: 0, subLosses: 0, decLosses: 0 },
    ratingElo: TUNING.ELO_START,
    promotionTier: 0,
    contractPromoterId: null,
    bankroll: isPlayer ? 500 : 0,
    lossStreak: 0,
    weeksSinceLastOffer: 0,
    retired: false,
    retiredReason: null,
    // gestion de la carrera del jugador
    coachMult: 1.0,
    hasNutritionist: false,
    hasManager: false,
    gamePlanFit: 0,
  };
  return f;
}

// ---- Edad: multiplicadores y decaimiento ----
function ageBand(age) {
  for (const b of TUNING.AGE_BANDS) if (age <= b.maxAge) return b;
  return TUNING.AGE_BANDS[TUNING.AGE_BANDS.length - 1];
}
export function ageGrowthMult(age) { return ageBand(age).growth; }
export function ageDecay(age) { return ageBand(age).decay; }
export function ageRecovMult(age) {
  for (const r of TUNING.AGE_RECOV_MULT) if (age <= r.maxAge) return r.m;
  return 0.7;
}
export function ageInjuryBump(age) {
  if (age < 32) return 0;
  if (age <= 35) return 0.4;
  return 0.9;
}

export function chinEffectiveCap(f) { return f.caps.chin - f.chinCapPenalty; }

// ---- Atributos efectivos para una pelea (funcion pura) ----
// Aplica fatiga residual, lesiones activas y penalizacion del corte de peso del dia.
export function effectiveForFight(f, currentWeek, cutContext) {
  const phys = { ...f.phys };
  const tech = { ...f.tech };
  const ment = { ...f.ment };

  // chin real limitado por dano cerebral
  phys.chin = Math.min(phys.chin, chinEffectiveCap(f));

  // Lesiones activas
  for (const inj of f.injuries) {
    if (inj.weeksLeft <= 0) continue;
    switch (inj.type) {
      case 'hand': tech.boxing *= 0.6; phys.power *= 0.85; break;
      case 'knee': phys.speed *= 0.7; tech.wrestling *= 0.8; tech.tdd *= 0.85; break;
      case 'shoulder': tech.subs *= 0.75; tech.clinch *= 0.8; tech.gnp *= 0.8; break;
      case 'concussion': phys.chin *= 0.8; break;
      case 'cut': break; // efecto es reabrir en pelea, se maneja en fight-engine
    }
  }

  // Corte de peso del dia
  let sizeEdge = 0, startFatiguePenalty = 0;
  if (cutContext) {
    const overSafe = Math.max(0, cutContext.cutFrac - TUNING.SAFE_FRAC);
    const discFactor = 2 - ment.discipline / 100;
    phys.cardio -= overSafe * TUNING.CUT_CARDIO_K * discFactor;
    phys.chin -= overSafe * TUNING.CUT_CHIN_K * discFactor;
    sizeEdge = cutContext.cutFrac * TUNING.SIZE_EDGE_K;
    phys.strength += sizeEdge;
    phys.power += sizeEdge * 0.5;
    if (cutContext.missedWeight) startFatiguePenalty = TUNING.MISS_FATIGUE;
  }

  // Fatiga residual (fuera de camp puede llegar con fatiga)
  const startStamina = clamp(100 - f.fatigue * 0.5 - startFatiguePenalty, 20, 100);

  // Clamp final
  for (const k in phys) phys[k] = clamp(phys[k], 1, 100);
  for (const k in tech) tech[k] = clamp(tech[k], 1, 100);

  return { phys, tech, ment, startStamina, gamePlanFit: f.gamePlanFit || 0 };
}

export { ARCHETYPES };
