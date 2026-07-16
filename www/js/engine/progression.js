// progression.js — entrenamiento, fatiga, declive por edad, eventos mentales.

import { TUNING } from './tuning.js';
import { PHYS_KEYS, TECH_KEYS } from './attributes.js';
import { ageYears, ageGrowthMult, ageDecay, ageRecovMult } from './fighter.js';
import { rollInjury, recoverInjuries } from './injury.js';
import { clamp } from './rng.js';

function fatigueFactor(fatigue) { return clamp(1 - fatigue / 100 * 0.8, 0.2, 1.0); }
function isTech(attr) { return TECH_KEYS.includes(attr); }

// Ganancia de un slot de entrenamiento a un atributo.
export function trainGain(f, attr, currentWeek, rng, mult = 1) {
  const cap = f.caps[attr];
  const cur = f[isTech(attr) ? 'tech' : 'phys'][attr];
  const room = clamp((cap - cur) / TUNING.CAP_APPROACH, 0, 1);
  if (room <= 0) return 0;
  const base = isTech(attr) ? TUNING.K_TECH : TUNING.K_PHYS;
  const age = ageYears(f, currentWeek);
  const gMult = isTech(attr) ? 1.0 : ageGrowthMult(age);
  const disc = 0.9 + 0.2 * f.ment.discipline / 100;
  const gain = base * room * fatigueFactor(f.fatigue) * gMult * f.coachMult * disc * mult * rng.uniform(0.85, 1.15);
  const layer = isTech(attr) ? f.tech : f.phys;
  layer[attr] = Math.min(cap, layer[attr] + gain);
  return gain;
}

// Decaimiento fisico semanal por edad.
export function applyAgeDecay(f, currentWeek) {
  const age = ageYears(f, currentWeek);
  const decay = ageDecay(age);
  for (const k in decay) {
    const perWeek = decay[k] / 52;
    f.phys[k] = Math.max(TUNING.AGE_PHYS_FLOOR, f.phys[k] - perWeek);
  }
}

// Recuperacion pasiva de fatiga (siempre, al cierre de semana).
export function passiveRecover(f, currentWeek) {
  const age = ageYears(f, currentWeek);
  const rec = TUNING.REST_BASE * (0.6 + 0.4 * f.phys.recovery / 100) * ageRecovMult(age);
  f.fatigue = clamp(f.fatigue - rec, 0, 100);
}

// Aplica UN slot de actividad. activity: train|sparring|conditioning|rest|grindwork|personal
// spec: { attr } para train, { focus } para conditioning.
export function applySlot(f, activity, spec, currentWeek, rng, report) {
  const add = TUNING.FATIGUE_ADD[activity] || 0;
  f.fatigue = clamp(f.fatigue + add, 0, 100);

  switch (activity) {
    case 'train':
      trainGain(f, spec.attr, currentWeek, rng);
      break;
    case 'conditioning':
      trainGain(f, spec.focus, currentWeek, rng);
      break;
    case 'sparring': {
      // entrena 2-3 tecnicas con mult, sube fightIQ
      const techs = pickSparTechs(f, rng);
      for (const t of techs) trainGain(f, t, currentWeek, rng, TUNING.SPARRING_TECH_MULT / techs.length + 0.4);
      f.ment.fightIQ = clamp(f.ment.fightIQ + 0.15 * fatigueFactor(f.fatigue), 0, 100);
      break;
    }
    case 'grindwork':
      f.bankroll += TUNING.GRIND_PAY;
      if (report) report.grindEarned = (report.grindEarned || 0) + TUNING.GRIND_PAY;
      break;
    case 'personal':
      f.ment.grit = clamp(f.ment.grit + 0.3, 0, 100);
      f.ment.discipline = clamp(f.ment.discipline + 0.4, 0, 100);
      break;
    case 'rest':
      break;
  }

  // tirada de lesion del slot
  const inj = rollInjury(f, activity, currentWeek, rng);
  if (inj && report) (report.injuries = report.injuries || []).push(inj);
}

function pickSparTechs(f, rng) {
  const a = f.archetype;
  if (a === 'striker') return rng.pick([['boxing', 'kickboxing'], ['boxing', 'muayThai'], ['boxing', 'tdd']]);
  if (a === 'wrestler') return rng.pick([['wrestling', 'gnp'], ['wrestling', 'tdd'], ['clinch', 'wrestling']]);
  if (a === 'grappler') return rng.pick([['bjj', 'subs'], ['bjj', 'subDefense'], ['wrestling', 'bjj']]);
  return rng.pick([['boxing', 'wrestling'], ['bjj', 'muayThai'], ['tdd', 'clinch']]);
}

// Eventos mentales por resultado de pelea.
export function mentalAfterFight(f, won, method, rivalStronger) {
  const factor = rivalStronger ? 1.5 : 1.0;
  if (won) {
    f.ment.confidence = clamp(f.ment.confidence + TUNING.CONF_STEP * factor, 0, 100);
  } else {
    const koLoss = method === 'ko' || method === 'tko';
    f.ment.confidence = clamp(f.ment.confidence - TUNING.CONF_STEP * (koLoss ? 1.5 : 1) * factor, 0, 100);
  }
  f.ment.fightIQ = clamp(f.ment.fightIQ + TUNING.MENTAL.iqPerFight, 0, 100);
}

export function mentalAfterHardRound(f, survived, wasWar) {
  if (survived) f.ment.grit = clamp(f.ment.grit + TUNING.MENTAL.gritSurvive, 0, 100);
  if (wasWar) f.ment.grit = clamp(f.ment.grit + TUNING.MENTAL.gritWarWin, 0, 100);
}

export { fatigueFactor, recoverInjuries };
