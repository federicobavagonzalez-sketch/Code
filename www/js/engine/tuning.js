// tuning.js — Bloque TUNING. UNICA fuente de constantes de balance.
// Ningun modulo hardcodea un numero que aparezca aca.
// Valores iniciales del documento de diseno §16; se ajustan con datos del testing §19.

export const TUNING = {
  // ---- Atributos / caps ----
  CAP_SPREAD: 12,
  CAP_FLOOR: 35,
  CAP_HARD_MAX: 99,
  PLAYER_TALENT_FLOOR: 50,
  CAP_APPROACH: 25,
  TALENT_TRI: { min: 40, mode: 58, max: 96 },

  // ---- Progresion ----
  K_TECH: 2.4,
  K_PHYS: 1.6,
  COACH_RANGE: [0.8, 1.3],
  FATIGUE_ADD: { train: 18, sparring: 25, conditioning: 20, grindwork: 15, personal: 5, rest: -35 },
  REST_BASE: 8,
  SPARRING_TECH_MULT: 1.3,

  // ---- Edad ----
  AGE_BANDS: [
    { maxAge: 27, growth: 1.0, decay: {} },
    { maxAge: 31, growth: 0.5, decay: {} },
    { maxAge: 35, growth: 0.2, decay: { speed: 2.5, recovery: 2.0, cardio: 1.5, power: 1.0, strength: 1.0, chin: 1.0 } },
    { maxAge: 999, growth: 0.05, decay: { speed: 5.0, recovery: 4.0, cardio: 3.0, power: 2.5, strength: 2.5, chin: 2.5 } },
  ],
  AGE_PHYS_FLOOR: 20,
  AGE_RECOV_MULT: [ { maxAge: 31, m: 1.0 }, { maxAge: 35, m: 0.85 }, { maxAge: 999, m: 0.7 } ],

  // ---- Lesiones / dano ----
  BASE_RISK: { train: 0.005, sparring: 0.045, conditioning: 0.010, grindwork: 0.003, rest: 0, personal: 0 },
  INJ_FATIGUE_K: 2.0,
  DMG_KO_MULT: 2.5,
  CAREER_DMG_SCALE: 0.40, // fraccion del dano de pelea que se vuelve dano permanente de carrera
  DMG_THRESHOLDS: [ { d: 600, pen: 8 }, { d: 1000, pen: 18 }, { d: 1500, pen: 32 } ],
  INJURY_TYPES: {
    cut:       { weeks: [1, 2],  label: 'corte' },
    hand:      { weeks: [4, 8],  label: 'mano rota' },
    knee:      { weeks: [6, 14], label: 'rodilla' },
    shoulder:  { weeks: [5, 10], label: 'hombro' },
    concussion:{ weeks: [3, 6],  label: 'conmocion' },
  },

  // ---- Corte de peso ----
  SAFE_FRAC: 0.06,
  MAX_FRAC: 0.11,
  CUT_CARDIO_K: 320,
  CUT_CHIN_K: 240,
  SIZE_EDGE_K: 60,
  MISS_PURSE_PCT: 0.25,
  MISS_FATIGUE: 15,

  // ---- Motor de pelea ----
  T_TURNS: 10,
  ROUNDS_NORMAL: 3,
  ROUNDS_TITLE: 5,
  K_LAND: 0.09,
  K_POS: 0.08,
  K_SUB: 0.08,
  NOISE_SPAN: 8,
  P_MIN: 0.02,
  P_MAX: 0.98,
  KO_BASE: 0.048,
  KO_DMG_REF: 18,
  KO_ACCUM_REF: 120,
  KO_PMAX: 0.35,
  TKO_DAMAGE_THRESHOLD: 200,
  TKO_STOP_RANGE: 120,
  CUT_STOP: 0.75,
  CTRL_DMG_K: 0.8,
  ACTION_DMG: { jab: 5, cross: 12, hook: 13, legkick: 7, knee: 14, elbow: 13, gnp: 9 },
  STAMINA_DRAIN: { base: 3.0, pressure: 2.5, gamble: 3.5, counter: -0.8, survive: -2.0, ground: 1.0 },
  DOM_GAP: 2.5,
  EVEN_GAP: 0.3,
  JUDGE_NOISE: 0.6,

  // ---- Mundo ----
  WORLD_SIZE: 400,
  ROOKIES_PER_YEAR: 50,
  ELO_K_BY_TIER: [24, 20, 16, 12],
  ELO_START: 1200,
  CUT_LOSS_STREAK: 3,
  OFFER_DROUGHT: 52,
  RANK_SIZE: 15,
  PROMOTE_RATING: [1180, 1320, 1480, 1650], // rating minimo aprox por tier
  PROMOTE_WINS: [5, 10, 18, 999],           // victorias de carrera acumuladas para graduar cada tier

  // Divisiones (limite en kg)
  DIVISIONS: [
    { id: 'fly', name: 'Mosca', limit: 57 },
    { id: 'bantam', name: 'Gallo', limit: 61 },
    { id: 'feather', name: 'Pluma', limit: 66 },
    { id: 'light', name: 'Ligero', limit: 70 },
    { id: 'welter', name: 'Wélter', limit: 77 },
    { id: 'middle', name: 'Medio', limit: 84 },
    { id: 'lightheavy', name: 'Semipesado', limit: 93 },
    { id: 'heavy', name: 'Pesado', limit: 120 },
  ],

  // ---- Economia ----
  TIER_PURSE_BASE: [0, 400, 3500, 40000],
  WIN_BONUS_PCT: 1.0,
  PURSE_RATING_K: 1.5,
  FINISH_BONUS: [0, 200, 2000, 25000],
  PERF_BONUS: [0, 150, 1500, 20000],
  MANAGER_PCT: 0.15,
  LIVING_COST: 220,
  GRIND_PAY: 180,
  GYM_FEE: [80, 150, 300, 600],
  NUTRITIONIST_FEE: 120,

  // ---- Mentales (eventos) ----
  CONF_STEP: 4,
  MENTAL: { iqPerFight: 0.6, gritSurvive: 1.2, gritWarWin: 2.0 },
};

// Sesgo de arquetipo a los caps (puntos antes del spread).
export const ARCHETYPE_BIAS = {
  striker:  { power: 8, speed: 6, cardio: 0, strength: 0, chin: 2, recovery: 0, boxing: 10, kickboxing: 8, muayThai: 8, wrestling: -4, bjj: -6, tdd: 4, clinch: 2, gnp: -2, subs: -6, subDefense: 0 },
  wrestler: { power: 0, speed: 2, cardio: 6, strength: 8, chin: 2, recovery: 2, boxing: -4, kickboxing: -4, muayThai: -2, wrestling: 12, bjj: 0, tdd: 8, clinch: 6, gnp: 8, subs: 2, subDefense: 6 },
  grappler: { power: -2, speed: 0, cardio: 4, strength: 2, chin: 0, recovery: 2, boxing: -4, kickboxing: -4, muayThai: -2, wrestling: 2, bjj: 12, tdd: 2, clinch: 4, gnp: 4, subs: 12, subDefense: 8 },
  complete: { power: 2, speed: 3, cardio: 3, strength: 2, chin: 3, recovery: 2, boxing: 2, kickboxing: 2, muayThai: 2, wrestling: 2, bjj: 2, tdd: 3, clinch: 3, gnp: 2, subs: 2, subDefense: 3 },
};
