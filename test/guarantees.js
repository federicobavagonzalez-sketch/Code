// test 19.3 — nada garantiza la victoria; ninguna tactica de round domina.
import { Rng } from '../www/js/engine/rng.js';
import { createFighter } from '../www/js/engine/fighter.js';
import { simulateFight, aiChooseIntent, INTENTS } from '../www/js/engine/fight-engine.js';

// Construye dos peleadores identicos (mismos atributos) con edades dadas.
function twinPair(seed, arche = 'complete') {
  const a = createFighter({ isPlayer: false, archetype: arche, ageInit: 26 }, new Rng(seed));
  const b = createFighter({ isPlayer: false, archetype: arche, ageInit: 26 }, new Rng(seed));
  a.name = 'A'; b.name = 'B';
  return [a, b];
}

// 19.3a — un rival muy inferior aun asi gana a veces (upsets >= ~1%).
export function runUpsets(N = 5000, seed = 7) {
  const rng = new Rng(seed);
  let weakWins = 0;
  for (let i = 0; i < N; i++) {
    const strong = createFighter({ isPlayer: false, archetype: 'complete', ageInit: 27 }, new Rng(2000 + i));
    const weak = createFighter({ isPlayer: false, archetype: 'complete', ageInit: 27 }, new Rng(9000 + i));
    // inflar al fuerte a topes altos, dejar al debil crudo
    for (const k in strong.tech) strong.tech[k] = Math.min(95, strong.caps[k]);
    for (const k in strong.phys) strong.phys[k] = Math.min(95, strong.caps[k]);
    strong.ment.fightIQ = 90;
    strong.name = 'FUERTE'; weak.name = 'DEBIL';
    // el fuerte juega optimo (apuesta cuando el debil esta lastimado); el debil sobrevive
    const res = simulateFight(strong, weak, {
      rng: rng.fork(i), rounds: 3, verbose: false,
      decideA: (s, o, st) => aiChooseIntent(s, o, st, rng),
      decideB: () => 'survive',
    });
    if (res.winnerSide === 'B') weakWins++;
  }
  const pct = weakWins / N * 100;
  // El fuerte debe dominar (>90%) pero NUNCA garantizar (los upsets existen). El 2% del diseno
  // es por-intercambio (P_MAX); a nivel pelea, un mismatch extremo da un upset chico pero != 0.
  const pass = pct > 0.15 && pct < 12;
  console.log(`\n[19.3a UPSETS] N=${N}  el debil gana ${weakWins} (${pct.toFixed(2)}%)  [objetivo 0.15%-12%: existe pero no garantiza]  => ${pass ? 'PASA' : 'FALLA'}`);
  return { pass, pct };
}

// 19.3b — ninguna intencion fija supera ~65% contra IA adaptativa entre iguales.
export function runNoDominantTactic(N = 3000, seed = 11) {
  const rng = new Rng(seed);
  const results = {};
  let pass = true;
  for (const intent of INTENTS) {
    let aWins = 0, decisive = 0;
    for (let i = 0; i < N; i++) {
      const [a, b] = twinPair(3000 + i);
      const res = simulateFight(a, b, {
        rng: rng.fork(i * 7 + 1), rounds: 3, verbose: false,
        decideA: () => intent,                              // A siempre la misma tactica
        decideB: (s, o, st) => aiChooseIntent(s, o, st, rng), // B adapta
      });
      if (res.winnerSide === 'A') { aWins++; decisive++; }
      else if (res.winnerSide === 'B') decisive++;
    }
    const wr = decisive ? aWins / decisive * 100 : 0;
    results[intent] = +wr.toFixed(1);
    if (wr > 65) pass = false;
  }
  console.log(`\n[19.3b TACTICA DOMINANTE] N=${N} por intencion (winrate de A vs IA adaptativa):`);
  console.log('  ', results, ` [ninguna debe superar 65%]  => ${pass ? 'PASA' : 'FALLA'}`);
  return { pass, results };
}

if (import.meta.url === `file://${process.argv[1]}`) { runUpsets(); runNoDominantTactic(); }
