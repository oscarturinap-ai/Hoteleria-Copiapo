import type { FechaISO } from "./tipos";

const FORMATO = /^\d{4}-\d{2}-\d{2}$/;
const MS_POR_DIA = 86_400_000;

/** Convierte `YYYY-MM-DD` a epoch UTC, rechazando fechas inexistentes (p. ej. 2026-02-30). */
export function parsearFecha(fecha: FechaISO): number {
  if (!FORMATO.test(fecha)) {
    throw new Error(`Fecha inválida: "${fecha}". Formato esperado YYYY-MM-DD.`);
  }
  const [a, m, d] = fecha.split("-").map(Number);
  const ms = Date.UTC(a, m - 1, d);
  const f = new Date(ms);
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) {
    throw new Error(`Fecha inexistente: "${fecha}".`);
  }
  return ms;
}

/**
 * Pernoctaciones entre ingreso y salida. Se calcula en UTC para que
 * los cambios de horario de verano en Chile no alteren el conteo.
 * Ingreso y salida el mismo día = 0 noches.
 */
export function contarNoches(ingreso: FechaISO, salida: FechaISO): number {
  const desde = parsearFecha(ingreso);
  const hasta = parsearFecha(salida);
  if (hasta < desde) {
    throw new Error(`La salida (${salida}) es anterior al ingreso (${ingreso}).`);
  }
  return Math.round((hasta - desde) / MS_POR_DIA);
}
