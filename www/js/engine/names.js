// names.js — nombres procedurales neutros (evita parecerse a personas reales, 100% offline).

const FIRST = [
  'Marco', 'Dario', 'Kian', 'Rafa', 'Tomas', 'Ivo', 'Nael', 'Bruno', 'Leon', 'Adem',
  'Yuri', 'Sami', 'Noa', 'Reza', 'Kofi', 'Dane', 'Ivan', 'Luca', 'Emre', 'Kato',
  'Nero', 'Vito', 'Aldo', 'Boris', 'Cael', 'Deniz', 'Enzo', 'Fabio', 'Gael', 'Hiro',
  'Ilya', 'Jonas', 'Keir', 'Lars', 'Milo', 'Nuri', 'Omar', 'Pavel', 'Quim', 'Rune',
  'Salo', 'Taro', 'Uzo', 'Vasco', 'Wim', 'Xander', 'Yann', 'Zane', 'Andre', 'Cruz',
];
const LAST = [
  'Vela', 'Roth', 'Nolan', 'Sato', 'Barea', 'Kade', 'Moreno', 'Frost', 'Okoro', 'Reyes',
  'Vance', 'Lund', 'Salas', 'Torok', 'Bauer', 'Nieto', 'Kane', 'Solis', 'Hale', 'Duarte',
  'Marek', 'Osei', 'Prado', 'Voss', 'Ruano', 'Kemal', 'Aria', 'Bello', 'Cano', 'Drago',
  'Eng', 'Falk', 'Gomez', 'Haas', 'Ives', 'Juno', 'Kraft', 'Lima', 'Mata', 'Nash',
  'Oro', 'Pike', 'Rana', 'Sorel', 'Tavo', 'Ureta', 'Vidal', 'Wolf', 'Yates', 'Zamora',
];
const NICK = ['', '', '', ' "el Lobo"', ' "la Roca"', ' "Relámpago"', ' "el Toro"', ' "Fantasma"', ' "Martillo"', ' "el Zurdo"', ' "Acero"'];

export function genName(rng) {
  const f = rng.pick(FIRST), l = rng.pick(LAST), n = rng.pick(NICK);
  return `${f}${n} ${l}`;
}
