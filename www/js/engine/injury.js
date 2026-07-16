// injury.js — lesiones agudas, recuperacion, dano cerebral acumulado permanente.

import { TUNING } from './tuning.js';
import { ageInjuryBump, ageYears } from './fighter.js';

const INJURY_KEYS = Object.keys(TUNING.INJURY_TYPES);

// Probabilidad de lesion por slot de actividad.
export function injuryChance(f, activity, currentWeek) {
  const base = TUNING.BASE_RISK[activity] || 0;
  if (base === 0) return 0;
  const age = ageYears(f, currentWeek);
  const chin = Math.min(f.phys.chin, f.caps.chin - f.chinCapPenalty);
  const active = f.injuries.filter(i => i.weeksLeft > 0).length;
  return base
    * (1 + f.fatigue / 100 * TUNING.INJ_FATIGUE_K)
    * (1 + ageInjuryBump(age))
    * (2 - chin / 100)
    * (1 + active * 0.5);
}

// Tirar una lesion (tipo + severidad). Devuelve el objeto lesion o null.
export function rollInjury(f, activity, currentWeek, rng) {
  const p = injuryChance(f, activity, currentWeek);
  if (!rng.chance(p)) return null;
  // tipo sesgado por actividad
  let type;
  if (activity === 'sparring') type = rng.pick(['cut', 'hand', 'concussion', 'knee', 'shoulder']);
  else if (activity === 'conditioning') type = rng.pick(['knee', 'shoulder', 'knee']);
  else type = rng.pick(['hand', 'shoulder', 'cut']);
  const spec = TUNING.INJURY_TYPES[type];
  // severidad: 60% menor, 30% moderada, 10% mayor → escala dentro del rango del tipo
  const roll = rng.next();
  const [wmin, wmax] = spec.weeks;
  let weeks;
  if (roll < 0.6) weeks = wmin;
  else if (roll < 0.9) weeks = Math.round((wmin + wmax) / 2);
  else weeks = wmax + rng.int(0, 2);
  const inj = { type, label: spec.label, weeksLeft: weeks, totalWeeks: weeks };
  f.injuries.push(inj);
  return inj;
}

// Aplicar dano de una pelea al contador de carrera y bajar cap de chin al cruzar umbrales.
export function applyFightDamage(f, damageTaken, gotKOd) {
  f.careerDamage += damageTaken * TUNING.CAREER_DMG_SCALE * (gotKOd ? TUNING.DMG_KO_MULT : 1.0);
  for (const th of TUNING.DMG_THRESHOLDS) {
    if (f.careerDamage > th.d) f.chinCapPenalty = Math.max(f.chinCapPenalty, th.pen);
  }
  const capNow = f.caps.chin - f.chinCapPenalty;
  if (f.phys.chin > capNow) f.phys.chin = capNow;
}

// Recuperacion semanal de lesiones (rest acelera). Elimina las curadas.
export function recoverInjuries(f, restedThisWeek) {
  const step = restedThisWeek ? 2 : 1;
  for (const inj of f.injuries) inj.weeksLeft = Math.max(0, inj.weeksLeft - step);
  f.injuries = f.injuries.filter(i => i.weeksLeft > 0);
}

export function hasBlockingInjury(f) {
  return f.injuries.some(i => i.weeksLeft > 0 && (i.type === 'concussion' || i.type === 'knee'));
}
export { INJURY_KEYS };
