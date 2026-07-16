// policies.js — politicas automaticas de jugador para el testing headless.

import { PHYS_KEYS, TECH_KEYS } from '../www/js/engine/attributes.js';
import { ageYears } from '../www/js/engine/fighter.js';

const ALL_ACTIVITIES = ['train', 'sparring', 'conditioning', 'rest', 'grindwork', 'personal'];

// Politica ALEATORIA: elige slots al azar, acepta ofertas al azar, se retira tarde.
export function randomPolicy(career, rng) {
  const { player } = career;
  const age = ageYears(player, career.world.week);
  // aceptar oferta a veces si no esta en camp
  let acceptOfferId = null;
  if (career.phase === 'normal' && career.offers.length && rng.chance(0.5)) {
    acceptOfferId = rng.pick(career.offers).id;
  }
  const slots = [];
  for (let i = 0; i < 3; i++) {
    const act = rng.pick(ALL_ACTIVITIES);
    slots.push(makeSlot(act, player, rng));
  }
  // retiro aleatorio pasada cierta edad
  const retire = age > 33 && rng.chance(0.02);
  return { slots, acceptOfferId, retire };
}

// Politica "sensata": entrena y descansa balanceado, acepta ofertas parejas, evita trampas obvias.
export function sensiblePolicy(career, rng) {
  const { player, world } = career;
  const age = ageYears(player, world.week);
  let acceptOfferId = null;
  if (career.phase === 'normal' && career.offers.length) {
    // aceptar la oferta mas cercana en elo (evita trampa)
    let best = null, bestGap = 1e9;
    for (const o of career.offers) {
      const opp = world.fighters.get(o.opponentId);
      const gap = opp.ratingElo - player.ratingElo;
      if (gap < bestGap) { bestGap = gap; best = o; }
    }
    if (best && bestGap < 150 && player.fatigue < 60) acceptOfferId = best.id;
  }
  const slots = [];
  const inCamp = career.phase === 'camp';
  for (let i = 0; i < 3; i++) {
    if (player.fatigue > 70) { slots.push({ activity: 'rest' }); continue; }
    if (player.bankroll < 0 && !inCamp) { slots.push({ activity: 'grindwork' }); continue; }
    if (inCamp) { slots.push(i < 2 ? makeSlot('sparring', player, rng) : { activity: 'rest' }); continue; }
    slots.push(i < 2 ? makeSlot('train', player, rng) : makeSlot('conditioning', player, rng));
  }
  const retire = (age > 35 && rng.chance(0.05)) || player.careerDamage > 1600;
  return { slots, acceptOfferId, retire };
}

// Politica AMBICIOSA: concentra entrenamiento en pocas skills clave del arquetipo,
// descansa para no lesionarse, y acepta escalones moderados cuando esta desarrollado.
const FOCUS_BY_ARCH = {
  striker: ['boxing', 'kickboxing', 'muayThai', 'tdd'],
  wrestler: ['wrestling', 'tdd', 'gnp', 'clinch'],
  grappler: ['bjj', 'subs', 'subDefense', 'wrestling'],
  complete: ['boxing', 'wrestling', 'bjj', 'muayThai'],
};
export function ambitiousPolicy(career, rng) {
  const { player, world } = career;
  const age = ageYears(player, world.week);
  const focus = FOCUS_BY_ARCH[player.archetype];
  let acceptOfferId = null;
  if (career.phase === 'normal' && career.offers.length && player.fatigue < 65) {
    // aceptar la mejor oferta que no sea un abismo (hasta +220 de elo si estoy desarrollado)
    const tol = player.record.wins > 8 ? 220 : 120;
    let choice = null, choiceGap = 1e9;
    for (const o of career.offers) {
      const opp = world.fighters.get(o.opponentId);
      const gap = opp.ratingElo - player.ratingElo;
      if (gap <= tol && gap < choiceGap) { choiceGap = gap; choice = o; }
      if (o.isTitle) { choice = o; break; }
    }
    if (choice) acceptOfferId = choice.id;
  }
  const slots = [];
  const inCamp = career.phase === 'camp';
  for (let i = 0; i < 3; i++) {
    if (player.fatigue > 68) { slots.push({ activity: 'rest' }); continue; }
    if (player.bankroll < -2000 && !inCamp) { slots.push({ activity: 'grindwork' }); continue; }
    if (inCamp) { slots.push(i < 2 ? { activity: 'sparring' } : { activity: 'rest' }); continue; }
    // concentra en la skill de foco mas lejos de su cap
    if (i < 2) slots.push({ activity: 'train', attr: farthestFromCap(player, focus) });
    else slots.push({ activity: 'conditioning', focus: 'cardio' });
  }
  const retire = (age > 36 && rng.chance(0.15)) || player.careerDamage > 1500;
  return { slots, acceptOfferId, retire };
}
function farthestFromCap(player, keys) {
  let best = keys[0], bestGap = -1;
  for (const k of keys) {
    const layer = ['power','speed','cardio','strength','chin','recovery'].includes(k) ? player.phys : player.tech;
    const gap = player.caps[k] - layer[k];
    if (gap > bestGap) { bestGap = gap; best = k; }
  }
  return best;
}

function makeSlot(act, player, rng) {
  if (act === 'train') return { activity: 'train', attr: weightedTech(player, rng) };
  if (act === 'conditioning') return { activity: 'conditioning', focus: rng.pick(PHYS_KEYS) };
  return { activity: act };
}

function weightedTech(player, rng) {
  // entrena algo lejos de su cap (para progresar) sesgado a su arquetipo
  return rng.pick(TECH_KEYS);
}
