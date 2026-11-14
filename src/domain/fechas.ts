import type { ISODate } from './types';

/**
 * Aritmética de fechas de calendario en UTC puro. Evita desfases por horario de verano
 * (Chile cambia de huso dos veces al año), que con `new Date('2026-04-05')` en hora local
 * pueden sumar o restar un día.
 */

const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_DIA = 86_400_000;

export function esFechaValida(s: string): s is ISODate {
  const m = RE_ISO.exec(s);
  if (!m) return false;
  const [, y, mo, d] = m;
  const t = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  return toISO(t) === s;
}

function toEpoch(d: ISODate): number {
  if (!esFechaValida(d)) throw new Error(`Fecha inválida: "${d}"`);
  const [y, m, dd] = d.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, dd);
}

function toISO(epoch: number): ISODate {
  return new Date(epoch).toISOString().slice(0, 10);
}

/** Días entre dos fechas (b − a). Ej.: diffDias('2026-11-09','2026-11-12') = 3. */
export function diffDias(a: ISODate, b: ISODate): number {
  return Math.round((toEpoch(b) - toEpoch(a)) / MS_DIA);
}

export function sumarDias(d: ISODate, n: number): ISODate {
  return toISO(toEpoch(d) + n * MS_DIA);
}

/** Lista de noches [desde, hasta): cada elemento es la fecha en que comienza la noche. */
export function noches(desde: ISODate, hasta: ISODate): ISODate[] {
  const n = diffDias(desde, hasta);
  const out: ISODate[] = [];
  for (let i = 0; i < n; i++) out.push(sumarDias(desde, i));
  return out;
}

/** a ≤ x ≤ b (comparación lexicográfica válida para ISO). */
export function enRango(x: ISODate, a: ISODate, b: ISODate): boolean {
  return x >= a && x <= b;
}

export function hoyISO(): ISODate {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function primerDiaMes(d: ISODate): ISODate {
  return `${d.slice(0, 7)}-01`;
}

export function ultimoDiaMes(d: ISODate): ISODate {
  const [y, m] = d.split('-').map(Number) as [number, number];
  return toISO(Date.UTC(y, m, 0));
}

export function formatoFecha(d: ISODate | null | undefined): string {
  if (!d) return '—';
  const [y, m, dd] = d.split('-');
  return `${dd}-${m}-${y}`;
}
