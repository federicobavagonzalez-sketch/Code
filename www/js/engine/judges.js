// judges.js — scoring 10-9 por round, tres jueces con pesos ocultos, tipos de decision.

import { TUNING } from './tuning.js';

const JUDGE_PROFILES = [
  { strikes: 0.8, damage: 0.9, control: 1.2, aggression: 0.4 }, // premia el control
  { strikes: 1.0, damage: 1.7, control: 0.5, aggression: 0.6 }, // premia el dano
  { strikes: 1.1, damage: 0.8, control: 0.5, aggression: 1.6 }, // premia la agresion
];

// Normaliza los acumuladores a escalas comparables antes de pesar:
// rSig ~0-20 golpes, rDamage ~0-150 (se escala /8), rControl ~0-10 turnos, rAggression ~0-16.
function judgeScore(x, W) {
  return W.strikes * x.rSig + W.damage * (x.rDamage * 0.125) + W.control * x.rControl + W.aggression * x.rAggression;
}

// Devuelve [{A,B},{A,B},{A,B}] con 10-9 / 10-8 / 10-10 por cada juez para el round.
export function scoreRound(A, B, rng) {
  const cards = [];
  for (let j = 0; j < 3; j++) {
    const W = JUDGE_PROFILES[j];
    const sa = judgeScore(A, W) + rng.noise(TUNING.JUDGE_NOISE);
    const sb = judgeScore(B, W) + rng.noise(TUNING.JUDGE_NOISE);
    const gap = Math.abs(sa - sb);
    // normalizar el gap por escala tipica del round para umbrales
    const scale = (sa + sb) / 2 + 1;
    const relGap = gap / scale;
    let a, b;
    if (relGap < TUNING.EVEN_GAP * 0.1) { a = 10; b = 10; }
    else {
      const dom = (relGap > TUNING.DOM_GAP * 0.1) || A.knockdowns > 0 || B.knockdowns > 0;
      if (sa > sb) { a = 10; b = dom ? 8 : 9; }
      else { b = 10; a = dom ? 8 : 9; }
    }
    cards.push({ A: a, B: b });
  }
  return cards;
}

// Suma final de las tarjetas → resultado por decision.
export function tallyDecision(scorecards) {
  let winA = 0, winB = 0, drawJ = 0;
  for (const c of scorecards) {
    if (c.A > c.B) winA++;
    else if (c.B > c.A) winB++;
    else drawJ++;
  }
  let winnerSide, method;
  if (winA > winB && winB === 0 && drawJ === 0) { winnerSide = 'A'; method = 'unanimous'; }
  else if (winB > winA && winA === 0 && drawJ === 0) { winnerSide = 'B'; method = 'unanimous'; }
  else if (winA > winB) { winnerSide = 'A'; method = drawJ > 0 ? 'majority' : 'split'; }
  else if (winB > winA) { winnerSide = 'B'; method = drawJ > 0 ? 'majority' : 'split'; }
  else { winnerSide = 'draw'; method = 'draw'; }
  return { winnerSide, method, round: scorecards.length, decision: true };
}
