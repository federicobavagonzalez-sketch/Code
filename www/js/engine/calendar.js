// calendar.js — semana/fecha real, avance de tiempo.

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// El juego arranca en una fecha base (lunes). Week 0 = esa fecha.
const BASE_YEAR = 2028;
const BASE = Date.UTC(BASE_YEAR, 0, 3); // 3 enero 2028 (lunes)

export function weekToDate(week) {
  return new Date(BASE + week * 7 * 86400000);
}

export function formatWeek(week) {
  const d = weekToDate(week);
  return `Semana del ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}, ${d.getUTCFullYear()}`;
}

export function weekYear(week) { return weekToDate(week).getUTCFullYear(); }

// Cuantas semanas de camp para una pelea.
export const CAMP_WEEKS = 8;
