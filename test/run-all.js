// run-all.js — corre toda la suite de testing headless (criterios 19.1-19.6).
import { runSymmetry } from './symmetry.js';
import { runWorldSmoke } from './world-smoke.js';
import { runUpsets, runNoDominantTactic } from './guarantees.js';
import { runAntiExploit } from './anti-exploit.js';
import { runUiGlue } from './ui-glue.js';
import { runCareers } from './careers.js';
import { randomPolicy, sensiblePolicy, ambitiousPolicy } from './policies.js';

const results = [];
function rec(name, r) { results.push({ name, pass: r.pass }); }

console.log('==================== CAGE — SUITE DE TESTING HEADLESS ====================');
rec('19.1 simetria', runSymmetry(10000));
rec('smoke mundo', runWorldSmoke(7, 260));
rec('19.3a upsets', runUpsets(5000));
rec('19.3b sin tactica dominante', runNoDominantTactic(3000));
rec('19.6 anti-exploit', runAntiExploit());
rec('smoke ui-glue (pelea interactiva + save)', runUiGlue());
rec('19.2/4/5 carreras ALEATORIA', await runCareers(150, 999, randomPolicy, 'ALEATORIA'));
rec('19.2/4/5 carreras SENSATA', await runCareers(100, 555, sensiblePolicy, 'SENSATA'));
rec('19.2/4/5 carreras AMBICIOSA', await runCareers(120, 321, ambitiousPolicy, 'AMBICIOSA'));

console.log('\n==================== RESUMEN ====================');
let allPass = true;
for (const r of results) { console.log(`  ${r.pass ? 'PASA' : 'FALLA'}  ${r.name}`); if (!r.pass) allPass = false; }
console.log(`\n${allPass ? '*** TODOS LOS TESTS PASAN ***' : '*** HAY TESTS QUE FALLAN ***'}`);
process.exit(allPass ? 0 : 1);
