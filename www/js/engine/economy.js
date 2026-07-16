// economy.js — bolsas, bonus, costos. Solo el jugador lleva contabilidad detallada.

import { TUNING } from './tuning.js';
import { clamp } from './rng.js';

function ratingNorm(elo) { return clamp((elo - 1000) / 800, 0, 1.5); }

// Bolsa base de una pelea segun tier y rating del peleador.
export function computePurse(tier, elo) {
  const base = TUNING.TIER_PURSE_BASE[tier] || 0;
  return Math.round(base * (1 + ratingNorm(elo) * TUNING.PURSE_RATING_K));
}

// Ingreso total de una pelea del jugador.
export function fightIncome(f, won, method, isHighlight) {
  const tier = f.promotionTier;
  const purse = computePurse(tier, f.ratingElo);
  let total = purse;
  const breakdown = { purse, winBonus: 0, finishBonus: 0, perfBonus: 0, managerCut: 0, missDeduct: 0 };
  if (won) {
    breakdown.winBonus = Math.round(purse * TUNING.WIN_BONUS_PCT);
    total += breakdown.winBonus;
    if (method === 'ko' || method === 'tko' || method === 'submission' || method === 'doctor') {
      breakdown.finishBonus = TUNING.FINISH_BONUS[tier] || 0;
      total += breakdown.finishBonus;
    }
  }
  if (isHighlight) { breakdown.perfBonus = TUNING.PERF_BONUS[tier] || 0; total += breakdown.perfBonus; }
  return { total, breakdown };
}

export function applyMissWeight(income) {
  const deduct = Math.round(income.breakdown.purse * TUNING.MISS_PURSE_PCT);
  income.breakdown.missDeduct = deduct;
  income.total -= deduct;
  return income;
}

export function managerCut(income) {
  const cut = Math.round(income.total * TUNING.MANAGER_PCT);
  income.breakdown.managerCut = cut;
  income.total -= cut;
  return income;
}

// Costos semanales del jugador.
export function weeklyCosts(f) {
  const lvl = TUNING.COACH_LEVELS[f.coachLevel || 0];
  const gym = lvl.weekly;
  const nutrition = f.hasNutritionist ? TUNING.NUTRITIONIST_FEE : 0;
  const living = TUNING.LIVING_COST;
  return { gym, nutrition, living, total: gym + nutrition + living };
}

export function chargeWeekly(f) {
  const c = weeklyCosts(f);
  f.bankroll -= c.total;
  return c;
}
