/**
 * Inventario de habitaciones, disponibilidad y control de sobreventa.
 *
 * Una habitación aloja hasta `capacidad` personas por noche (twin compartida = 2).
 * Ocupan inventario los registros RESERVADO, IN_HOUSE y CHECK_OUT. NO_SHOW y ANULADO
 * liberan la habitación (el cobro del no show es independiente del inventario).
 */
import { formatoFecha, noches } from './fechas';
import type { Habitacion, Id, ISODate, Registro } from './types';

export function ocupaInventario(r: Pick<Registro, 'estado'>): boolean {
  return r.estado === 'RESERVADO' || r.estado === 'IN_HOUSE' || r.estado === 'CHECK_OUT';
}

/** Registros que ocupan la habitación la noche `fecha`. */
export function ocupantes(registros: readonly Registro[], habitacionId: Id, fecha: ISODate, excluirId?: Id): Registro[] {
  return registros.filter(
    (r) =>
      r.id !== excluirId &&
      ocupaInventario(r) &&
      r.tramos.some((t) => t.habitacionId === habitacionId && fecha >= t.desde && fecha < t.hasta),
  );
}

/** Índice noche → ocupantes por habitación, para consultas repetidas (calendario, disponibilidad). */
export function indiceOcupacion(registros: readonly Registro[], excluirId?: Id): Map<Id, Map<ISODate, Registro[]>> {
  const idx = new Map<Id, Map<ISODate, Registro[]>>();
  for (const r of registros) {
    if (r.id === excluirId || !ocupaInventario(r)) continue;
    for (const t of r.tramos) {
      if (!t.habitacionId) continue;
      let porNoche = idx.get(t.habitacionId);
      if (!porNoche) idx.set(t.habitacionId, (porNoche = new Map()));
      for (const n of noches(t.desde, t.hasta)) {
        const arr = porNoche.get(n);
        if (arr) arr.push(r);
        else porNoche.set(n, [r]);
      }
    }
  }
  return idx;
}

export interface Disponibilidad {
  habitacion: Habitacion;
  /** Camas libres en la noche más cargada del rango (0 = no disponible). */
  libres: number;
  /** Folios que ocupan alguna noche del rango. */
  folios: number[];
}

/** Disponibilidad de las habitaciones activas de un hotel para las noches [desde, hasta). */
export function disponibilidad(
  registros: readonly Registro[],
  habitaciones: readonly Habitacion[],
  hotelId: Id,
  desde: ISODate,
  hasta: ISODate,
  excluirId?: Id,
): Disponibilidad[] {
  const idx = indiceOcupacion(registros, excluirId);
  const ns = hasta > desde ? noches(desde, hasta) : [];
  return habitaciones
    .filter((h) => h.hotelId === hotelId && h.activa)
    .sort(compararHabitacion)
    .map((h) => {
      const porNoche = idx.get(h.id);
      let max = 0;
      const folios = new Set<number>();
      for (const n of ns) {
        const occ = porNoche?.get(n) ?? [];
        max = Math.max(max, occ.length);
        occ.forEach((r) => folios.add(r.folio));
      }
      return { habitacion: h, libres: Math.max(0, h.capacidad - max), folios: [...folios].sort((a, b) => a - b) };
    });
}

/** Orden natural: '2' < '10' < '101' < 'A1'. */
export function compararHabitacion(a: Pick<Habitacion, 'numero'>, b: Pick<Habitacion, 'numero'>): number {
  return a.numero.localeCompare(b.numero, 'es', { numeric: true });
}

/**
 * Errores de inventario de un registro: habitación de otro hotel, inexistente o inactiva,
 * y sobreventa (ocupantes > capacidad en alguna noche).
 */
export function erroresInventario(
  r: Registro,
  registros: readonly Registro[],
  habitaciones: readonly Habitacion[],
  /** Versión guardada del registro: permite conservar una habitación que luego se desactivó. */
  anterior?: Registro | null,
): string[] {
  if (!ocupaInventario(r)) return [];
  const errores: string[] = [];
  const porId = new Map(habitaciones.map((h) => [h.id, h]));
  const idx = indiceOcupacion(registros, r.id);
  r.tramos.forEach((t, i) => {
    if (!t.habitacionId) return;
    const n = `Tramo ${i + 1}`;
    const h = porId.get(t.habitacionId);
    if (!h) return void errores.push(`${n}: habitación inexistente.`);
    if (h.hotelId !== t.hotelId) return void errores.push(`${n}: la habitación ${h.numero} no pertenece al hotel del tramo.`);
    const yaAsignada = anterior?.tramos.some((x) => x.habitacionId === h.id);
    if (!h.activa && !yaAsignada) errores.push(`${n}: la habitación ${h.numero} está inactiva.`);
    if (t.hasta <= t.desde) return;
    const llenas: ISODate[] = [];
    const folios = new Set<number>();
    for (const noche of noches(t.desde, t.hasta)) {
      const occ = idx.get(h.id)?.get(noche) ?? [];
      if (occ.length + 1 > h.capacidad) {
        llenas.push(noche);
        occ.forEach((o) => folios.add(o.folio));
      }
    }
    if (llenas.length) {
      const rango = llenas.length === 1 ? formatoFecha(llenas[0]) : `${formatoFecha(llenas[0])} a ${formatoFecha(llenas[llenas.length - 1])}`;
      errores.push(
        `${n}: habitación ${h.numero} sin cupo (capacidad ${h.capacidad}) la(s) noche(s) ${rango} — ocupada por folio(s) ${[...folios].sort((a, b) => a - b).join(', ')}.`,
      );
    }
  });
  return errores;
}

export interface OcupacionHotelDia {
  hotelId: Id;
  habitaciones: number;
  habitacionesOcupadas: number;
  camas: number;
  camasOcupadas: number;
  /** Pernoctan sin habitación asignada. */
  sinAsignar: number;
}

/** Ocupación de la noche `fecha` por hotel (sólo registros que ocupan inventario). */
export function ocupacionDia(registros: readonly Registro[], habitaciones: readonly Habitacion[], fecha: ISODate): Map<Id, OcupacionHotelDia> {
  const out = new Map<Id, OcupacionHotelDia>();
  const get = (hotelId: Id) => {
    let o = out.get(hotelId);
    if (!o) out.set(hotelId, (o = { hotelId, habitaciones: 0, habitacionesOcupadas: 0, camas: 0, camasOcupadas: 0, sinAsignar: 0 }));
    return o;
  };
  for (const h of habitaciones) {
    if (!h.activa) continue;
    const o = get(h.hotelId);
    o.habitaciones++;
    o.camas += h.capacidad;
  }
  const ocupadas = new Set<Id>();
  for (const r of registros) {
    if (!ocupaInventario(r)) continue;
    const t = r.tramos.find((x) => fecha >= x.desde && fecha < x.hasta);
    if (!t) continue;
    const o = get(t.hotelId);
    if (t.habitacionId) {
      o.camasOcupadas++;
      if (!ocupadas.has(t.habitacionId)) {
        ocupadas.add(t.habitacionId);
        o.habitacionesOcupadas++;
      }
    } else o.sinAsignar++;
  }
  return out;
}

/** Interpreta un rango de numeración: '101-110' → ['101', …, '110']; '201' → ['201']. */
export function expandirRango(texto: string): string[] | null {
  const t = texto.trim();
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(t);
  if (!m) return t ? [t] : null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (b < a || b - a > 200) return null;
  const ancho = m[1]!.length;
  return Array.from({ length: b - a + 1 }, (_, i) => String(a + i).padStart(ancho, '0'));
}
