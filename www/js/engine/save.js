// save.js — serializacion de la carrera. Sin dependencias de plataforma.
// Se guarda entre semanas (no a mitad de pelea).

import { Rng } from './rng.js';

const SAVE_VERSION = 1;

export function serializeCareer(career) {
  const w = career.world;
  const fighters = [];
  for (const f of w.fighters.values()) {
    // los objetos fighter son datos planos; no llevan funciones ni refs ciclicas entre semanas.
    fighters.push(f);
  }
  return {
    v: SAVE_VERSION,
    seed: career.seed,
    phase: career.phase,
    camp: career.camp,
    offers: career.offers,
    over: career.over,
    summary: career.summary,
    // historia sin los logs de texto (se recomputan/no se necesitan)
    history: career.history.map(h => ({
      opponentName: h.opponentName, method: h.method, round: h.round,
      playerWon: h.playerWon, draw: h.draw, titleWon: h.titleWon,
      isTitle: h.isTitle, missedWeight: h.missedWeight,
    })),
    world: {
      seed: w.seed, week: w.week, rngState: w.rng.state, playerId: w.playerId,
      divisions: w.divisions, eventsLog: w.eventsLog.slice(-40),
      fighters,
    },
  };
}

export function deserializeCareer(data) {
  if (!data || data.v !== SAVE_VERSION) return null;
  const rng = new Rng(data.world.seed);
  rng.state = data.world.rngState >>> 0;
  const fmap = new Map();
  for (const f of data.world.fighters) fmap.set(f.id, f);
  const world = {
    seed: data.world.seed, rng, week: data.world.week,
    fighters: fmap, divisions: data.world.divisions,
    playerId: data.world.playerId, eventsLog: data.world.eventsLog || [],
  };
  const player = fmap.get(data.world.playerId);
  return {
    world, player, seed: data.seed,
    phase: data.phase, camp: data.camp, offers: data.offers || [],
    history: data.history || [], over: data.over, summary: data.summary,
  };
}
