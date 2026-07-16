// attributes.js — definicion de atributos y mapeo valor→texto cualitativo.
// El jugador NUNCA ve el numero. Solo tier (6 niveles) con vocabulario por atributo.

export const PHYS_KEYS = ['power', 'speed', 'cardio', 'strength', 'chin', 'recovery'];
export const TECH_KEYS = ['boxing', 'kickboxing', 'muayThai', 'wrestling', 'bjj', 'tdd', 'clinch', 'gnp', 'subs', 'subDefense'];
export const MENT_KEYS = ['fightIQ', 'grit', 'confidence', 'discipline'];

export const ATTR_LABELS = {
  power: 'Potencia', speed: 'Velocidad', cardio: 'Cardio', strength: 'Fuerza',
  chin: 'Resistencia al daño', recovery: 'Recuperación',
  boxing: 'Boxeo', kickboxing: 'Kickboxing', muayThai: 'Muay Thai', wrestling: 'Wrestling',
  bjj: 'Jiu-Jitsu', tdd: 'Defensa de derribo', clinch: 'Clinch', gnp: 'Ground and pound',
  subs: 'Sumisiones', subDefense: 'Escape de sumisión',
  fightIQ: 'Fight IQ', grit: 'Aguante mental', confidence: 'Confianza', discipline: 'Disciplina',
};

// 6 tiers. Bordes base cada ~ [0,25,40,55,70,85].
const TIER_EDGES = [25, 40, 55, 70, 85];

// Vocabulario por atributo (indice 0..5).
const VOCAB = {
  power:    ['sin pegada', 'pegada liviana', 'pega correcto', 'pega fuerte', 'pegada pesada', 'poder de KO'],
  speed:    ['lento', 'pies pesados', 'velocidad normal', 'rápido', 'muy rápido', 'velocidad de élite'],
  cardio:   ['se ahoga enseguida', 'cardio dudoso', 'aguanta un poco', 'buen motor', 'motor de sobra', 'cardio inagotable'],
  strength: ['débil', 'poca fuerza', 'fuerza normal', 'fuerte', 'muy fuerte', 'fuerza bruta'],
  chin:     ['mentón de cristal', 'se lastima fácil', 'mentón correcto', 'mentón sólido', 'muy duro', 'granito'],
  recovery: ['tarda en sanar', 'recupera lento', 'recupera normal', 'recupera bien', 'recupera rápido', 'sana solo'],
  boxing:   ['manos torpes', 'boxeo básico', 'boxeo correcto', 'buen boxeo', 'boxeo fino', 'boxeo de élite'],
  kickboxing:['patadas torpes', 'kickboxing básico', 'kickboxing correcto', 'buen kickboxing', 'kickboxing fino', 'kickboxing de élite'],
  muayThai: ['sin clinch de golpes', 'muay thai básico', 'muay thai correcto', 'buen muay thai', 'muay thai fino', 'muay thai de élite'],
  wrestling:['no derriba', 'wrestling básico', 'wrestling correcto', 'buen wrestling', 'wrestling fino', 'wrestling de élite'],
  bjj:      ['sin suelo', 'jiu-jitsu básico', 'jiu-jitsu correcto', 'buen jiu-jitsu', 'jiu-jitsu fino', 'jiu-jitsu de élite'],
  tdd:      ['lo derriban siempre', 'defensa floja', 'defensa correcta', 'buena defensa', 'muy difícil de derribar', 'no cae nunca'],
  clinch:   ['sin clinch', 'clinch básico', 'clinch correcto', 'buen clinch', 'clinch fino', 'clinch de élite'],
  gnp:      ['sin G&P', 'G&P básico', 'G&P correcto', 'buen G&P', 'G&P pesado', 'G&P demoledor'],
  subs:     ['sin sumisiones', 'sumisiones básicas', 'sumisiones correctas', 'buenas sumisiones', 'sumisiones finas', 'cazador de sumisiones'],
  subDefense:['tap fácil', 'escapa poco', 'escapa correcto', 'buen escape', 'muy difícil de someter', 'no se rinde nunca'],
  fightIQ:  ['sin lectura', 'lectura básica', 'lee correcto', 'buena lectura', 'muy inteligente', 'genio del ring'],
  grit:     ['se quiebra', 'aguante bajo', 'aguante normal', 'aguanta', 'muy aguantador', 'no se rompe'],
  confidence:['inseguro', 'dudas', 'confianza normal', 'confiado', 'muy confiado', 'imparable en su cabeza'],
  discipline:['indisciplinado', 'flojo', 'disciplina normal', 'disciplinado', 'muy disciplinado', 'profesional total'],
};

// Jitter estable por peleador+atributo, para difuminar los bordes ±2 sin parpadear.
function stableJitter(fighterId, attrKey) {
  let h = 2166136261 >>> 0;
  const s = String(fighterId) + ':' + attrKey;
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; }
  return ((h % 5) - 2); // -2..+2
}

export function tierIndex(value, fighterId, attrKey) {
  const v = value + stableJitter(fighterId, attrKey);
  let t = 0;
  for (let i = 0; i < TIER_EDGES.length; i++) { if (v >= TIER_EDGES[i]) t = i + 1; }
  return t; // 0..5
}

export function qualitative(value, fighterId, attrKey) {
  const t = tierIndex(value, fighterId, attrKey);
  const vocab = VOCAB[attrKey] || ['muy bajo', 'bajo', 'medio', 'bueno', 'muy bueno', 'élite'];
  return vocab[t];
}

// Traduce daño acumulado de carrera a una linea honesta (sin numero).
export function damageDescriptor(careerDamage) {
  if (careerDamage < 300) return 'salís entero';
  if (careerDamage < 600) return 'algún golpe te va a quedar';
  if (careerDamage < 1000) return 'vas a sentir esto con los años';
  if (careerDamage < 1500) return 'el cuerpo ya te pasó factura';
  return 'vas a sentir esto el resto de tu vida';
}
