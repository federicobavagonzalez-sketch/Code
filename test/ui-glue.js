// smoke test del pegamento UI<->engine: pelea interactiva + serializacion.
import { createCareer, advanceWeek, startFight, finishFight } from '../www/js/engine/career.js';
import { serializeCareer, deserializeCareer } from '../www/js/engine/save.js';
import { INTENTS } from '../www/js/engine/fight-engine.js';

export function runUiGlue() {
  const career = createCareer(4242, { name: 'Test', archetype: 'striker', divisionId: 'light' });
  let fights = 0, weeks = 0, serOk = true, ctrlOk = true;

  // jugar ~4 anos aceptando la primera oferta y avanzando interactivo
  for (let w = 0; w < 4 * 52 && !career.over; w++) {
    const dec = { slots: [{ activity: 'train', attr: 'boxing' }, { activity: 'conditioning', focus: 'cardio' }, { activity: 'rest' }] };
    if (career.phase === 'normal' && career.offers.length) dec.acceptOfferId = career.offers[0].id;
    const rep = advanceWeek(career, dec, { interactive: true });
    weeks++;
    if (rep.fightPending) {
      const ctrl = startFight(career);
      if (!ctrl) { ctrlOk = false; break; }
      let guard = 0;
      while (!ctrl.finished && guard++ < 10) {
        const r = ctrl.playRound(INTENTS[(fights + guard) % INTENTS.length]);
        if (r.finished) break;
      }
      const fr = finishFight(career);
      if (!fr) { ctrlOk = false; break; }
      fights++;
    }
    // serializar/deserializar cada 20 semanas (fuera de pelea)
    if (w % 20 === 0 && !rep.fightPending) {
      const data = serializeCareer(career);
      const round = deserializeCareer(JSON.parse(JSON.stringify(data)));
      if (!round || round.player.id !== career.player.id || round.world.fighters.size !== career.world.fighters.size) serOk = false;
    }
    if (rep.over) break;
  }

  const pass = fights > 0 && ctrlOk && serOk;
  console.log(`\n[SMOKE UI-GLUE] semanas=${weeks} peleas=${fights} controlador=${ctrlOk ? 'ok' : 'X'} serializacion=${serOk ? 'ok' : 'X'} => ${pass ? 'PASA' : 'FALLA'}`);
  return { pass, fights };
}

if (import.meta.url === `file://${process.argv[1]}`) runUiGlue();
