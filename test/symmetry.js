// test 19.1 — simetria: 10.000 peleas entre peleadores identicos ~ 50/50.
import { Rng } from '../www/js/engine/rng.js';
import { createFighter, resetIdCounter } from '../www/js/engine/fighter.js';
import { simulateFight } from '../www/js/engine/fight-engine.js';

export function runSymmetry(N = 10000, seed = 12345) {
  const rng = new Rng(seed);
  let aWins = 0, bWins = 0, draws = 0;
  const methods = {};
  for (let i = 0; i < N; i++) {
    resetIdCounter(1);
    // dos peleadores identicos: mismo arquetipo, mismos atributos (rng separado y reseteado)
    const fr = new Rng(1000 + i);
    const a = createFighter({ isPlayer: false, archetype: 'complete', ageInit: 26 }, fr);
    const fr2 = new Rng(1000 + i); // MISMA semilla => atributos identicos
    const b = createFighter({ isPlayer: false, archetype: 'complete', ageInit: 26 }, fr2);
    a.name = 'A'; b.name = 'B';
    const res = simulateFight(a, b, { rng: rng.fork(i), rounds: 3, verbose: false });
    if (res.winnerSide === 'A') aWins++;
    else if (res.winnerSide === 'B') bWins++;
    else draws++;
    methods[res.method] = (methods[res.method] || 0) + 1;
  }
  const decisive = aWins + bWins;
  const aPct = decisive ? (aWins / decisive * 100) : 0;
  const pass = Math.abs(aPct - 50) <= 2;
  console.log(`\n[19.1 SIMETRIA] N=${N}`);
  console.log(`  A: ${aWins}  B: ${bWins}  draws: ${draws}`);
  console.log(`  A% (de decisivas): ${aPct.toFixed(2)}%  (objetivo 48-52)`);
  console.log(`  metodos:`, methods);
  console.log(`  => ${pass ? 'PASA' : 'FALLA'}`);
  return { pass, aPct, aWins, bWins, draws, methods };
}

if (import.meta.url === `file://${process.argv[1]}`) runSymmetry();
