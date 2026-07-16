// fight-engine.js — simulacion round por round. El corazon.
// Modo verbose (arma log de texto) y modo silent (solo contadores, para el mundo).
// Diseno para velocidad: eff se calcula 1 vez; loop solo toca stamina/damage/cut; sin allocations por turno.

import { TUNING } from './tuning.js';
import { sigmoid, clamp } from './rng.js';
import { effectiveForFight } from './fighter.js';
import { scoreRound, tallyDecision } from './judges.js';

// Intenciones (una por round). Ver diseno §11.5.
export const INTENTS = ['pressure', 'counter', 'takedown', 'standup', 'survive', 'gamble'];

const INTENT_PROFILE = {
  pressure: { output: 1.5, acc: 2, def: -4, drain: 2.5, aggro: 1.6, ko: 0, seekGround: 0, sprawl: 0, counter: 0, recover: 0 },
  counter:  { output: 0.7, acc: 6, def: 3, drain: -0.8, aggro: 0.7, ko: 0, seekGround: 0, sprawl: 2, counter: 8, recover: 4 },
  takedown: { output: 1.0, acc: 0, def: -1, drain: 1.0, aggro: 1.0, ko: 0, seekGround: 1, sprawl: 0, counter: 0, recover: 0 },
  standup:  { output: 0.9, acc: 0, def: 2, drain: 0.4, aggro: 0.8, ko: 0, seekGround: 0, sprawl: 8, counter: 0, recover: 2 },
  survive:  { output: 0.4, acc: 0, def: 12, drain: -2.0, aggro: 0.3, ko: -0.5, seekGround: 0, sprawl: 3, counter: 0, recover: 8 },
  gamble:   { output: 1.5, acc: -2, def: -8, drain: 3.5, aggro: 1.5, ko: 1.0, seekGround: 0, sprawl: -2, counter: 0, recover: 0 },
};

// ---- Valores de combate derivados de atributos efectivos ----
function strikeSkill(t) { return t.boxing * 0.4 + t.kickboxing * 0.3 + t.muayThai * 0.3; }
function strikingOffense(e) { return strikeSkill(e.tech) * 0.7 + e.phys.speed * 0.3; }
function strikingDefense(e) { return strikeSkill(e.tech) * 0.35 + e.phys.speed * 0.4 + e.ment.fightIQ * 0.25; }
function takedownOffense(e) { return e.tech.wrestling * 0.8 + e.phys.strength * 0.2; }
function takedownDefense(e) { return e.tech.tdd * 0.8 + e.phys.strength * 0.2; }
function clinchValue(e) { return e.tech.clinch * 0.7 + e.phys.strength * 0.3; }
function groundControl(e) { return e.tech.wrestling * 0.5 + e.tech.bjj * 0.5; }
function getUp(e) { return e.tech.bjj * 0.4 + e.phys.strength * 0.3 + e.phys.speed * 0.3; }
function subOffense(e) { return e.tech.subs * 0.7 + e.tech.bjj * 0.3; }
function subDefenseV(e) { return e.tech.subDefense * 0.7 + e.ment.grit * 0.3; }

function staminaFactor(stamina) { return 0.55 + 0.45 * clamp(stamina, 0, 100) / 100; }

function prefGround(f) {
  const a = f.f.archetype;
  return a === 'wrestler' || a === 'grappler';
}

// ---- KO / dano ----
function damageOf(action, powerEff, chinEff, controlQuality, rng) {
  const base = TUNING.ACTION_DMG[action] || 8;
  return base * (0.5 + powerEff / 100) * (1 + controlQuality * TUNING.CTRL_DMG_K)
    * (1.4 - chinEff / 100) * rng.uniform(0.8, 1.2);
}

function isKO(dmg, defender, prof, rng) {
  const chinEff = clamp(defender.eff.phys.chin, 1, 100);
  let pKO = TUNING.KO_BASE
    * (dmg / TUNING.KO_DMG_REF)
    * (1 + defender.damage / TUNING.KO_ACCUM_REF)
    * (1 + Math.max(0, 50 - chinEff) / 50)
    * (1 + (defender.stamina < 30 ? 0.5 : 0))
    * (1 + (prof ? Math.max(0, prof.ko) * 0.4 : 0)); // el que apuesta busca el KO
  pKO = clamp(pKO, 0, TUNING.KO_PMAX);
  return rng.chance(pKO);
}

// ---- Construccion del peleador-en-pelea ----
function makeFIF(f, currentWeek, cutContext) {
  const eff = effectiveForFight(f, currentWeek, cutContext);
  return {
    f, eff,
    stamina: eff.startStamina,
    damage: 0,
    cut: 0,
    intent: 'pressure',
    rSig: 0, rDamage: 0, rControl: 0, rTakedowns: 0, rAggression: 0, knockdowns: 0,
    // totales de pelea (para stats)
    tSig: 0, tTakedowns: 0, tSubAtt: 0,
  };
}

function resetRoundAcc(x) {
  x.rSig = 0; x.rDamage = 0; x.rControl = 0; x.rTakedowns = 0; x.rAggression = 0; x.knockdowns = 0;
}

// ---- Log helper ----
function logLine(out, verbose, text) { if (verbose) out.push(text); }

const ACTIONS_STANDING = ['jab', 'cross', 'hook', 'legkick'];
const ACTIONS_POWER = ['cross', 'hook', 'knee'];

function pickStrike(prof, rng) {
  if (prof.ko >= 1) return rng.pick(ACTIONS_POWER);
  return rng.pick(ACTIONS_STANDING);
}

// ---- Simulacion de un turno ----
function resolveTurn(st, rng, out, verbose) {
  const A = st.A, B = st.B;
  const pA = INTENT_PROFILE[A.intent], pB = INTENT_PROFILE[B.intent];

  // 1) FASE DE POSICION
  if (st.position === 'STANDING') {
    // quien quiere suelo
    const aWants = pA.seekGround || (prefGround(A) && A.intent !== 'standup' && A.intent !== 'survive');
    const bWants = pB.seekGround || (prefGround(B) && B.intent !== 'standup' && B.intent !== 'survive');
    let tdMan = null, tdDef = null;
    if (aWants && !bWants) { tdMan = A; tdDef = B; }
    else if (bWants && !aWants) { tdMan = B; tdDef = A; }
    else if (aWants && bWants) {
      const oa = takedownOffense(A.eff), ob = takedownOffense(B.eff);
      tdMan = (oa > ob || (oa === ob && rng.chance(0.5))) ? A : B; tdDef = tdMan === A ? B : A;
    }
    if (tdMan) {
      const defProf = INTENT_PROFILE[tdDef.intent];
      const off = takedownOffense(tdMan.eff) * staminaFactor(tdMan.stamina);
      const def = takedownDefense(tdDef.eff) * staminaFactor(tdDef.stamina) + defProf.sprawl;
      let p = clamp(sigmoid(TUNING.K_POS * (off - def + rng.noise(TUNING.NOISE_SPAN))), TUNING.P_MIN, TUNING.P_MAX);
      if (rng.chance(p)) {
        st.position = 'GROUND'; st.controllerId = tdMan === A ? 'A' : 'B'; st.controlQuality = 0.5;
        tdMan.rTakedowns++; tdMan.tTakedowns++; tdMan.rControl++; tdMan.rAggression += 1;
        logLine(out, verbose, `${nm(tdMan)} conecta un derribo.`);
        return;
      } else {
        // derribo stuffeado: el que entra mal se cansa y queda expuesto a un castigo.
        tdDef.rAggression += 0.5;
        tdMan.stamina = clamp(tdMan.stamina - 3.0, 0, 100);
        const coff = strikingOffense(tdDef.eff) * staminaFactor(tdDef.stamina);
        const cdef = strikingDefense(tdMan.eff) * staminaFactor(tdMan.stamina) - 5; // expuesto al entrar
        const cp = clamp(sigmoid(TUNING.K_LAND * (coff - cdef + rng.noise(TUNING.NOISE_SPAN))), TUNING.P_MIN, TUNING.P_MAX);
        if (rng.chance(cp * 0.6)) {
          const dmg = damageOf('cross', tdDef.eff.phys.power, tdMan.eff.phys.chin, 0, rng);
          tdMan.damage += dmg; tdDef.rDamage += dmg; tdDef.rSig++; tdDef.tSig++;
          logLine(out, verbose, `${nm(tdDef)} defiende el derribo y castiga al salir.`);
          if (isKO(dmg, tdMan, INTENT_PROFILE[tdDef.intent], rng)) {
            tdMan.knockdowns++;
            st.finish = { winner: tdDef === A ? 'A' : 'B', method: 'ko', round: st.round };
            logLine(out, verbose, `¡${nm(tdMan)} entra a ciegas y lo cruzan! Nocaut.`);
            return;
          }
        } else {
          logLine(out, verbose, `${nm(tdDef)} defiende el derribo.`);
        }
      }
    }
  } else if (st.position === 'GROUND') {
    const ctrl = st.controllerId === 'A' ? A : B;
    const bottom = st.controllerId === 'A' ? B : A;
    const bProf = INTENT_PROFILE[bottom.intent];
    const bottomWantsUp = bProf.sprawl > 0 || bottom.intent === 'standup' || bottom.intent === 'survive' || (!prefGround(bottom));
    if (bottomWantsUp) {
      const off = getUp(bottom.eff) * staminaFactor(bottom.stamina);
      const def = groundControl(ctrl.eff) * staminaFactor(ctrl.stamina) + st.controlQuality * 20;
      const p = clamp(sigmoid(TUNING.K_POS * (off - def + rng.noise(TUNING.NOISE_SPAN))), TUNING.P_MIN, TUNING.P_MAX);
      if (rng.chance(p)) {
        st.position = 'STANDING'; st.controllerId = null; st.controlQuality = 0;
        logLine(out, verbose, `${nm(bottom)} vuelve a ponerse de pie.`);
        return;
      }
    }
    // el controlador mejora control
    ctrl.rControl++;
    if (rng.chance(0.4)) st.controlQuality = clamp(st.controlQuality + 0.12, 0, 1);
  }

  // 2) FASE DE ACCION
  if (st.position === 'GROUND') {
    const ctrl = st.controllerId === 'A' ? A : B;
    const bottom = st.controllerId === 'A' ? B : A;
    const bProf = INTENT_PROFILE[bottom.intent];
    // intento de sumision: controlador si es grappler, o bottom desde guardia si es grappler
    const subMan = subOffense(ctrl.eff) >= subOffense(bottom.eff) + 5 ? ctrl : (bottom.f.archetype === 'grappler' ? bottom : ctrl);
    const subDef = subMan === ctrl ? bottom : ctrl;
    if (subMan.f.archetype === 'grappler' || subOffense(subMan.eff) > 55) {
      const off = subOffense(subMan.eff) + (subMan === ctrl ? st.controlQuality * 30 : 10);
      const def = subDefenseV(subDef.eff) + (subDef.stamina < 30 ? -8 : 0);
      const p = clamp(sigmoid(TUNING.K_SUB * (off - def + rng.noise(TUNING.NOISE_SPAN))), TUNING.P_MIN, TUNING.P_MAX);
      subMan.tSubAtt++;
      if (rng.chance(p * 0.4)) { // los intentos no siempre terminan en tap
        st.finish = { winner: subMan === A ? 'A' : 'B', method: 'submission', round: st.round };
        logLine(out, verbose, `${nm(subMan)} cierra la sumisión. ¡Tap!`);
        return;
      }
    }
    // ground and pound del controlador
    const off = ctrl.eff.tech.gnp * staminaFactor(ctrl.stamina) * (0.5 + st.controlQuality);
    const def = subDefenseV(bottom.eff) * 0.3 + bottom.eff.ment.fightIQ * 0.2;
    const p = clamp(sigmoid(TUNING.K_LAND * (off - def + rng.noise(TUNING.NOISE_SPAN))), TUNING.P_MIN, TUNING.P_MAX);
    if (rng.chance(p)) {
      const dmg = damageOf('gnp', ctrl.eff.phys.power, bottom.eff.phys.chin, st.controlQuality, rng);
      bottom.damage += dmg; ctrl.rDamage += dmg; ctrl.rSig++; ctrl.tSig++; ctrl.rAggression += 1;
      logLine(out, verbose, `${nm(ctrl)} castiga con golpes en el suelo.`);
      if (isKO(dmg, bottom, INTENT_PROFILE[ctrl.intent], rng)) {
        st.finish = { winner: ctrl === A ? 'A' : 'B', method: 'tko', round: st.round };
        logLine(out, verbose, `¡Parada! ${nm(ctrl)} no deja de golpear.`);
        return;
      }
    }
  } else {
    // STANDING: striking. Elegir agresor por output.
    const outA = INTENT_PROFILE[A.intent].output * (0.7 + A.eff.ment.confidence / 200);
    const outB = INTENT_PROFILE[B.intent].output * (0.7 + B.eff.ment.confidence / 200);
    const aggressor = rng.chance(outA / (outA + outB)) ? A : B;
    const defender = aggressor === A ? B : A;
    const aProf = INTENT_PROFILE[aggressor.intent], dProf = INTENT_PROFILE[defender.intent];

    const cutPenAtk = aggressor.cut > 0.4 ? 6 : 0; // viscion comprometida
    const off = strikingOffense(aggressor.eff) * staminaFactor(aggressor.stamina) + aProf.acc - cutPenAtk
      + aggressor.eff.gamePlanFit * 6;
    const def = strikingDefense(defender.eff) * staminaFactor(defender.stamina) + dProf.def;
    const p = clamp(sigmoid(TUNING.K_LAND * (off - def + rng.noise(TUNING.NOISE_SPAN))), TUNING.P_MIN, TUNING.P_MAX);
    aggressor.rAggression += aProf.aggro;

    if (rng.chance(p)) {
      const action = pickStrike(aProf, rng);
      const dmg = damageOf(action, aggressor.eff.phys.power, defender.eff.phys.chin, 0, rng);
      defender.damage += dmg; aggressor.rDamage += dmg; aggressor.rSig++; aggressor.tSig++;
      // corte
      if (rng.chance(0.05 + (action === 'elbow' ? 0.1 : 0))) defender.cut = clamp(defender.cut + rng.uniform(0.15, 0.4), 0, 1);
      logLine(out, verbose, `${nm(aggressor)} conecta ${strikeText(action)}.`);
      if (isKO(dmg, defender, aProf, rng)) {
        defender.knockdowns++;
        st.finish = { winner: aggressor === A ? 'A' : 'B', method: 'ko', round: st.round };
        logLine(out, verbose, `¡${nm(defender)} cae! Nocaut.`);
        return;
      }
    } else {
      // contra del defensor si viene contragolpeando y el agresor se expuso
      if (dProf.counter > 0 && (aggressor.intent === 'pressure' || aggressor.intent === 'gamble')) {
        const coff = strikingOffense(defender.eff) * staminaFactor(defender.stamina) + dProf.counter;
        const cdef = strikingDefense(aggressor.eff) * staminaFactor(aggressor.stamina) + aProf.def;
        const cp = clamp(sigmoid(TUNING.K_LAND * (coff - cdef + rng.noise(TUNING.NOISE_SPAN))), TUNING.P_MIN, TUNING.P_MAX);
        if (rng.chance(cp)) {
          const action = 'cross';
          const dmg = damageOf(action, defender.eff.phys.power, aggressor.eff.phys.chin, 0, rng) * 1.15;
          aggressor.damage += dmg; defender.rDamage += dmg; defender.rSig++; defender.tSig++; defender.rAggression += 1;
          logLine(out, verbose, `${nm(defender)} contragolpea al vacío de ${nm(aggressor)}.`);
          if (isKO(dmg, aggressor, dProf, rng)) {
            aggressor.knockdowns++;
            st.finish = { winner: defender === A ? 'A' : 'B', method: 'ko', round: st.round };
            logLine(out, verbose, `¡Contra brutal! ${nm(aggressor)} se desploma.`);
            return;
          }
        }
      }
    }
  }

  // 4) STAMINA
  drainStamina(A, INTENT_PROFILE[A.intent], st);
  drainStamina(B, INTENT_PROFILE[B.intent], st);

  // 5) TKO por acumulacion
  checkAccumTKO(st, A, B, out, verbose);
  if (st.finish) return;
  checkAccumTKO(st, B, A, out, verbose);
}

function drainStamina(x, prof, st) {
  const groundPen = st.position === 'GROUND' ? TUNING.STAMINA_DRAIN.ground : 0;
  const cardioF = 1.2 - x.eff.phys.cardio / 100;
  let d = (TUNING.STAMINA_DRAIN.base + prof.drain + groundPen) * cardioF;
  x.stamina = clamp(x.stamina - d, 0, 100);
}

function checkAccumTKO(st, taker, giver, out, verbose) {
  if (taker.damage > TUNING.TKO_DAMAGE_THRESHOLD) {
    let pStop = clamp((taker.damage - TUNING.TKO_DAMAGE_THRESHOLD) / TUNING.TKO_STOP_RANGE, 0, 0.6);
    if (taker.intent === 'gamble') pStop *= 1.2;
    if (st.rng.chance(pStop * 0.25)) {
      st.finish = { winner: giver === st.A ? 'A' : 'B', method: 'tko', round: st.round };
      logLine(out, verbose, `El árbitro para la pelea. ${nm(taker)} no responde.`);
    }
  }
  // TKO medico por corte
  if (!st.finish && taker.cut >= TUNING.CUT_STOP) {
    st.finish = { winner: giver === st.A ? 'A' : 'B', method: 'doctor', round: st.round };
    logLine(out, verbose, `El médico detiene el combate: el corte de ${nm(taker)} es demasiado.`);
  }
}

function nm(x) { return x.f.name || 'el peleador'; }
function strikeText(a) {
  return { jab: 'un jab', cross: 'una derecha', hook: 'un gancho', legkick: 'una patada baja', knee: 'una rodilla', elbow: 'un codo' }[a] || 'un golpe';
}

// ---- Recuperacion entre rounds ----
function betweenRounds(x) {
  const rec = x.eff.phys.recovery / 100 * 18 + (x.intent === 'survive' ? 8 : 0) + x.eff.ment.grit / 100 * 4;
  x.stamina = clamp(x.stamina + rec, 0, 100);
}

// ---- API principal ----
export function simulateFight(fA, fB, opts = {}) {
  const {
    rng, rounds = TUNING.ROUNDS_NORMAL, verbose = false, currentWeek = 0,
    cutA = null, cutB = null,
    decideA = null, decideB = null, // (self, opp, state) => intent
  } = opts;
  if (!rng) throw new Error('simulateFight requiere rng');

  const A = makeFIF(fA, currentWeek, cutA);
  const B = makeFIF(fB, currentWeek, cutB);
  const st = { A, B, position: 'STANDING', controllerId: null, controlQuality: 0, round: 1, turn: 0, finish: null, rng };
  A.st = st; B.st = st;
  const out = [];
  const scorecards = [ { A: 0, B: 0 }, { A: 0, B: 0 }, { A: 0, B: 0 } ];

  const dA = decideA || ((s, o, state) => aiChooseIntent(s, o, state, rng));
  const dB = decideB || ((s, o, state) => aiChooseIntent(s, o, state, rng));

  for (let r = 1; r <= rounds && !st.finish; r++) {
    st.round = r;
    resetRoundAcc(A); resetRoundAcc(B);
    A.intent = dA(A, B, st);
    B.intent = dB(B, A, st);
    logLine(out, verbose, `--- Round ${r} ---`);
    for (let t = 0; t < TUNING.T_TURNS && !st.finish; t++) {
      st.turn = t;
      resolveTurn(st, rng, out, verbose);
    }
    if (!st.finish) {
      // puntuar round
      const rc = scoreRound(A, B, rng);
      for (let j = 0; j < 3; j++) { scorecards[j].A += rc[j].A; scorecards[j].B += rc[j].B; }
      betweenRounds(A); betweenRounds(B);
    }
  }

  let result;
  if (st.finish) {
    result = { winnerSide: st.finish.winner, method: st.finish.method, round: st.finish.round };
  } else {
    result = tallyDecision(scorecards);
  }
  result.log = out;
  result.scorecards = scorecards;
  result.damageA = A.damage; result.damageB = B.damage;
  result.statsA = { sig: A.tSig, td: A.tTakedowns, subAtt: A.tSubAtt };
  result.statsB = { sig: B.tSig, td: B.tTakedowns, subAtt: B.tSubAtt };
  result.fA = fA; result.fB = fB;
  return result;
}

function finalizeResult(st, A, B, scorecards, out, fA, fB) {
  let result;
  if (st.finish) result = { winnerSide: st.finish.winner, method: st.finish.method, round: st.finish.round };
  else result = tallyDecision(scorecards);
  result.log = out;
  result.scorecards = scorecards;
  result.damageA = A.damage; result.damageB = B.damage;
  result.statsA = { sig: A.tSig, td: A.tTakedowns, subAtt: A.tSubAtt };
  result.statsB = { sig: B.tSig, td: B.tTakedowns, subAtt: B.tSubAtt };
  result.fA = fA; result.fB = fB;
  return result;
}

// Estado cualitativo de un peleador en pelea (sin numeros) para la UI entre rounds.
export function fifCondition(x) {
  const d = x.damage;
  let dmg = d < 40 ? 'entero' : d < 90 ? 'marcado' : d < 150 ? 'lastimado' : 'muy lastimado';
  const s = x.stamina;
  let sta = s > 70 ? 'fresco' : s > 45 ? 'con aire' : s > 25 ? 'cansado' : 'vaciado';
  let cut = x.cut > 0.5 ? 'sangrando feo' : x.cut > 0.15 ? 'con un corte' : null;
  return { dmg, sta, cut };
}

// ---- Controlador de pelea paso a paso (para la UI interactiva) ----
// El jugador es SIEMPRE el lado A. playRound(intent) corre un round y devuelve su log.
export function createFightController(fA, fB, opts = {}) {
  const { rng, rounds = TUNING.ROUNDS_NORMAL, currentWeek = 0, cutA = null, cutB = null } = opts;
  if (!rng) throw new Error('createFightController requiere rng');
  const A = makeFIF(fA, currentWeek, cutA);
  const B = makeFIF(fB, currentWeek, cutB);
  const st = { A, B, position: 'STANDING', controllerId: null, controlQuality: 0, round: 0, turn: 0, finish: null, rng };
  A.st = st; B.st = st;
  const scorecards = [ { A: 0, B: 0 }, { A: 0, B: 0 }, { A: 0, B: 0 } ];
  const fullLog = [];

  return {
    rounds,
    get round() { return st.round; },
    get finished() { return !!st.finish || st.round >= rounds; },
    conditionA() { return fifCondition(A); },
    conditionB() { return fifCondition(B); },
    position() { return st.position; },
    // corre el proximo round con la intencion del jugador (lado A). Devuelve { log, finished, result }.
    playRound(playerIntent) {
      if (st.finish || st.round >= rounds) return { log: [], finished: true, result: this.getResult() };
      st.round++;
      resetRoundAcc(A); resetRoundAcc(B);
      A.intent = playerIntent;
      B.intent = aiChooseIntent(B, A, st, rng);
      const out = [];
      for (let t = 0; t < TUNING.T_TURNS && !st.finish; t++) { st.turn = t; resolveTurn(st, rng, out, true); }
      let roundCards = null;
      if (!st.finish) {
        const rc = scoreRound(A, B, rng);
        for (let j = 0; j < 3; j++) { scorecards[j].A += rc[j].A; scorecards[j].B += rc[j].B; }
        betweenRounds(A); betweenRounds(B);
        roundCards = rc;
      }
      for (const l of out) fullLog.push(l);
      const finished = !!st.finish || st.round >= rounds;
      return { log: out, roundCards, finished, oppIntent: B.intent, result: finished ? this.getResult() : null };
    },
    getResult() { return finalizeResult(st, A, B, scorecards, fullLog, fA, fB); },
  };
}

// ---- Politica de IA para elegir intencion ----
export function aiChooseIntent(self, opp, st, rng) {
  const arche = self.f.archetype;
  const iAmBottom = st.position === 'GROUND' && st.controllerId && (st.controllerId === 'A' ? st.B : st.A) === self;
  const grappler = arche === 'grappler';

  // Si me tienen abajo y no vivo del suelo: buscar ponerme de pie.
  if (iAmBottom && !grappler && rng.chance(0.7)) return 'standup';
  // Si el rival es wrestler o me tiro a derribar el round pasado: mantener de pie (sprawl).
  if ((opp.f.archetype === 'wrestler' || opp.intent === 'takedown') && !grappler && rng.chance(0.5)) {
    return st.position === 'GROUND' ? 'standup' : 'standup';
  }
  // Muy lastimado o sin cardio: sobrevivir.
  if (self.stamina < 25 || self.damage > TUNING.TKO_DAMAGE_THRESHOLD * 0.7) {
    if (rng.chance(0.6)) return 'survive';
  }
  // Rival lastimado: apostar.
  if (opp.damage > TUNING.TKO_DAMAGE_THRESHOLD * 0.6 && self.stamina > 40 && rng.chance(0.5)) return 'gamble';
  // fightIQ alto: mas contragolpe.
  if (self.eff.ment.fightIQ > 65 && rng.chance(0.35)) return 'counter';

  let pool;
  if (arche === 'wrestler') pool = ['takedown', 'pressure', 'takedown', 'counter'];
  else if (arche === 'grappler') pool = ['takedown', 'takedown', 'survive', 'counter'];
  else if (arche === 'striker') pool = ['pressure', 'counter', 'standup', 'gamble'];
  else pool = ['pressure', 'counter', 'takedown', 'standup'];
  return rng.pick(pool);
}
