// smoke test: generar mundo, correr 5 anos, ver que no explote y que el mundo evolucione.
import { generateWorld, worldTick, activeCount } from '../www/js/engine/world.js';
import { ageYears } from '../www/js/engine/fighter.js';
import { TUNING } from '../www/js/engine/tuning.js';

export function runWorldSmoke(seed = 7, weeks = 260) {
  const t0 = Date.now();
  const world = generateWorld(seed);
  const startCount = world.fighters.size;
  for (let w = 0; w < weeks; w++) worldTick(world);
  const dt = Date.now() - t0;

  let retired = 0, fights = 0, maxDmg = 0, champChanges = world.eventsLog.length;
  const ages = [];
  for (const f of world.fighters.values()) {
    if (f.retired) retired++;
    fights += f.record.wins + f.record.losses + f.record.draws;
    maxDmg = Math.max(maxDmg, f.careerDamage);
    if (!f.retired) ages.push(ageYears(f, world.week));
  }
  const active = activeCount(world);
  console.log(`\n[SMOKE MUNDO] seed=${seed} ${weeks} semanas (${(weeks/52).toFixed(1)} anos) en ${dt}ms`);
  console.log(`  peleadores total: ${world.fighters.size} (arranque ${startCount})  activos: ${active}  retirados: ${retired}`);
  console.log(`  peleas totales acumuladas: ${fights}  dano max: ${maxDmg.toFixed(0)}  cambios de titulo: ${champChanges}`);
  console.log(`  edad promedio activos: ${(ages.reduce((a,b)=>a+b,0)/ages.length).toFixed(1)}`);
  // campeones actuales
  for (const d of TUNING.DIVISIONS) {
    const champ = world.fighters.get(world.divisions[d.id].champId);
    if (champ) console.log(`  campeon ${d.name}: ${champ.name} (${champ.record.wins}-${champ.record.losses}), elo ${Math.round(champ.ratingElo)}`);
  }
  const pass = active > startCount * 0.5 && retired > 0 && champChanges >= 0;
  console.log(`  => ${pass ? 'PASA' : 'FALLA'}`);
  return { pass, active, retired, dt };
}

if (import.meta.url === `file://${process.argv[1]}`) runWorldSmoke();
