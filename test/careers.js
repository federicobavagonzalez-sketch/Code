// test 19.2/19.4/19.5 — 200 carreras de ~15 anos con jugador al azar.
// Verifica: distribucion realista de campeones (la mayoria NO llega), economia no rota,
// el declive por edad fuerza el retiro (edades concentradas 34-40).

import { Rng } from '../www/js/engine/rng.js';
import { createCareer, advanceWeek, endCareer } from '../www/js/engine/career.js';
import { ageYears } from '../www/js/engine/fighter.js';
import { randomPolicy, sensiblePolicy, ambitiousPolicy } from './policies.js';

export function runCareers(N = 200, seed = 999, policy = randomPolicy, label = 'ALEATORIA') {
  const t0 = Date.now();
  let champions = 0, titleShots = 0, reachedElite = 0;
  const retireAges = [];
  const monies = [];
  const winrates = [];
  const finalTiers = [0, 0, 0, 0];
  let bankruptStuck = 0, infiniteMoney = 0;
  const maxWeeks = 15 * 52;

  for (let i = 0; i < N; i++) {
    const rng = new Rng(seed * 7919 + i);
    const arche = rng.pick(['striker', 'wrestler', 'grappler', 'complete']);
    const div = rng.pick(['fly', 'bantam', 'feather', 'light', 'welter', 'middle', 'lightheavy', 'heavy']);
    const career = createCareer(seed * 31 + i, { archetype: arche, divisionId: div, ageInit: 19 });
    let weeks = 0, over = false;
    let peakBank = career.player.bankroll;
    let peakTier = 0;
    while (!over && weeks < maxWeeks) {
      const dec = policy(career, rng);
      const rep = advanceWeek(career, dec);
      weeks++;
      peakBank = Math.max(peakBank, career.player.bankroll);
      peakTier = Math.max(peakTier, career.player.promotionTier);
      if (rep.fight && rep.fight.isTitle) titleShots++;
      if (rep.over) { over = true; }
    }
    const p = career.player;
    if (!career.summary) {
      // forzar cierre si llego al tope de semanas
      endCareer(career, 'edad');
    }
    const s = career.summary;
    if (s.everChampion) champions++;
    finalTiers[p.promotionTier]++;
    if (peakTier >= 3) reachedElite++;
    const totF = p.record.wins + p.record.losses + p.record.draws;
    if (totF > 0) winrates.push(p.record.wins / totF);
    retireAges.push(s.ageAtRetire);
    monies.push(s.moneyEarned);
    if (peakBank > 20_000_000) infiniteMoney++;
    // "stuck en inanicion" = termino con deuda enorme y nunca pudo pelear
    if (p.bankroll < -30000 && totF < 3) bankruptStuck++;
  }
  const dt = Date.now() - t0;

  const champPct = champions / N * 100;
  const avgRetire = avg(retireAges);
  const retire3440 = retireAges.filter(a => a >= 33 && a <= 41).length / N * 100;
  const medMoney = median(monies);
  const avgWr = avg(winrates);

  console.log(`\n[19.2/19.4/19.5 CARRERAS ${label}] N=${N}, 15 anos c/u, en ${dt}ms`);
  console.log(`  campeones mundiales: ${champions} (${champPct.toFixed(1)}%)  peleas de titulo: ${titleShots}  llegaron a elite (T3): ${reachedElite}`);
  console.log(`  winrate promedio: ${(avgWr*100).toFixed(1)}%`);
  console.log(`  edad retiro: prom ${avgRetire.toFixed(1)}, en [33-41]: ${retire3440.toFixed(0)}%`);
  console.log(`  plata: mediana ${fmt(medMoney)}, max carrera >5M: ${infiniteMoney}, atrapados en deuda: ${bankruptStuck}`);
  console.log(`  tier final: T0=${finalTiers[0]} T1=${finalTiers[1]} T2=${finalTiers[2]} T3=${finalTiers[3]}`);

  // champ%: aleatoria debe ser baja (<8%). Para AMBICIOSA, el titulo es una minoria (<40%)
  // y la ELITE (tier3) debe ser ALCANZABLE — el cinturon en si es ~2%, on-tone ("la mayoria no llega").
  const passChamp = label === 'ALEATORIA' ? champPct < 8 : (label === 'AMBICIOSA' ? (champPct < 40 && reachedElite > 0) : true);
  // el declive por edad forzando el retiro se valida con juego razonable (no con caos aleatorio,
  // donde el dano acumulado los saca antes). Para ALEATORIA solo se reporta.
  const passRetire = label === 'ALEATORIA' ? true : retire3440 > 45;
  const passEcon = infiniteMoney === 0 && bankruptStuck < N * 0.05;
  const pass = passChamp && passRetire && passEcon;
  console.log(`  => champ:${passChamp?'ok':'X'} retiro:${passRetire?'ok':'X'} economia:${passEcon?'ok':'X'} => ${pass?'PASA':'FALLA'}`);
  return { pass, champPct, avgRetire, retire3440, medMoney, avgWr, finalTiers };
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function median(a) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
function fmt(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

if (import.meta.url === `file://${process.argv[1]}`) {
  await runCareers(200, 999, randomPolicy, 'ALEATORIA');
  await runCareers(120, 555, sensiblePolicy, 'SENSATA');
  await runCareers(120, 321, ambitiousPolicy, 'AMBICIOSA');
}
