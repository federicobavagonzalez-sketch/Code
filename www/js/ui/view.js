// view.js — helpers de render cualitativo. El jugador NUNCA ve numeros.

import { PHYS_KEYS, TECH_KEYS, MENT_KEYS, ATTR_LABELS, qualitative, tierIndex } from '../engine/attributes.js';
import { ageYears } from '../engine/fighter.js';

const ARCH_LABEL = { striker: 'Striker', wrestler: 'Wrestler', grappler: 'Grappler', complete: 'Completo' };
export function archLabel(a) { return ARCH_LABEL[a] || a; }

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function trendGlyph(t) {
  if (t === 'up') return '<span class="trend up">▲</span>';
  if (t === 'down') return '<span class="trend down">▼</span>';
  return '<span class="trend flat">▬</span>';
}

// Filas de un grupo de atributos con tier + tendencia.
export function attrGroupHTML(fighter, keys, layer, showTrend) {
  let out = '';
  for (const k of keys) {
    const v = fighter[layer][k];
    const q = qualitative(v, fighter.id, k);
    const tr = showTrend && fighter._trend ? trendGlyph(fighter._trend[k]) : '';
    out += `<div class="attr-row"><span class="attr-name">${esc(ATTR_LABELS[k])}</span>`
      + `<span class="attr-val">${esc(q)} ${tr}</span></div>`;
  }
  return out;
}

// Grupo de mentales (sin tendencia; se mueven por eventos).
export function mentalGroupHTML(fighter) {
  let out = '';
  for (const k of MENT_KEYS) {
    const v = fighter[k !== 'fightIQ' && MENT_KEYS.includes(k) ? 'ment' : 'ment'][k];
    const q = qualitative(fighter.ment[k], fighter.id, k);
    out += `<div class="attr-row"><span class="attr-name">${esc(ATTR_LABELS[k])}</span><span class="attr-val">${esc(q)}</span></div>`;
  }
  return out;
}

export function recordStr(f) { return `${f.record.wins}-${f.record.losses}-${f.record.draws}`; }

// Scouting de un rival: pocos rasgos cualitativos + record + ranking, sin numeros.
export function scoutHTML(opp, world, currentWeek) {
  const rankIdx = world.divisions[opp.divisionId]?.ranking.indexOf(opp.id);
  const rank = rankIdx >= 0 ? `#${rankIdx + 1}` : 'sin ranking';
  const age = Math.round(ageYears(opp, currentWeek));
  // 3 rasgos destacados (los tiers mas altos)
  const keys = [...TECH_KEYS, 'power', 'chin', 'cardio'];
  const scored = keys.map(k => {
    const layer = PHYS_KEYS.includes(k) ? 'phys' : 'tech';
    return { k, t: tierIndex(opp[layer][k], opp.id, k), layer };
  }).sort((a, b) => b.t - a.t).slice(0, 3);
  const traits = scored.map(s => qualitative(opp[s.layer][s.k], opp.id, s.k)).join(' · ');
  return `<div class="fighter-corner" style="text-align:left">
    <div class="nm">${esc(opp.name)}</div>
    <div class="cond">${recordStr(opp)} · ${age} años · ${rank} · ${archLabel(opp.archetype)}</div>
    <div class="faint" style="margin-top:4px">${esc(traits)}</div>
  </div>`;
}

export function moneyStr(n) {
  const v = Math.round(n);
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US');
}

export { esc, PHYS_KEYS, TECH_KEYS, MENT_KEYS };
