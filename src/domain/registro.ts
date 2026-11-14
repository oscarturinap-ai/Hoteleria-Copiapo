import { diffDias, enRango, esFechaValida, noches } from './fechas';
import { multiplicar, sumar } from './dinero';
import { normalizarRut, validarRut } from './rut';
import type { CLP, Concepto, Hotel, Id, ISODate, Registro, Tarifa, Tramo } from './types';

// ───────────────────────── Derivados ─────────────────────────

export function ingreso(r: Pick<Registro, 'tramos'>): ISODate {
  return r.tramos[0]?.desde ?? '';
}

export function salida(r: Pick<Registro, 'tramos'>): ISODate {
  return r.tramos[r.tramos.length - 1]?.hasta ?? '';
}

/** Noches reservadas (IN→OUT), independiente del estado. */
export function nochesReservadas(r: Pick<Registro, 'tramos'>): number {
  return r.tramos.reduce((acc, t) => acc + diffDias(t.desde, t.hasta), 0);
}

export function esDerivado(r: Pick<Registro, 'tramos'>): boolean {
  return new Set(r.tramos.map((t) => t.hotelId)).size > 1;
}

export interface NocheCobrable {
  fecha: ISODate;
  hotelId: Id;
  tarifa: CLP;
}

/**
 * Noches que generan cobro según el estado del registro.
 *  - ANULADO / NO_SHOW SIN_CARGO: ninguna.
 *  - NO_SHOW TOTAL: todas las reservadas.
 *  - NO_SHOW PARCIAL: las primeras N reservadas.
 *  - Resto: todas las reservadas.
 */
export function nochesCobrables(r: Registro): NocheCobrable[] {
  if (r.estado === 'ANULADO') return [];
  const todas: NocheCobrable[] = r.tramos.flatMap((t) =>
    noches(t.desde, t.hasta).map((fecha) => ({ fecha, hotelId: t.hotelId, tarifa: t.tarifaNoche })),
  );
  if (r.estado !== 'NO_SHOW') return todas;
  const ns = r.noShow;
  if (!ns || ns.modalidad === 'SIN_CARGO') return [];
  if (ns.modalidad === 'TOTAL') return todas;
  return todas.slice(0, Math.max(0, Math.min(ns.nochesCobradas, todas.length)));
}

/** Adicionales que generan cobro (excluye registros anulados). */
export function adicionalesCobrables(r: Registro) {
  return r.estado === 'ANULADO' ? [] : r.adicionales;
}

export interface ResumenRegistro {
  noches: number;
  alojamiento: CLP;
  adicionales: CLP;
  total: CLP;
}

export function resumenRegistro(r: Registro): ResumenRegistro {
  const n = nochesCobrables(r);
  const alojamiento = sumar(n.map((x) => x.tarifa));
  const adicionales = sumar(adicionalesCobrables(r).map((a) => multiplicar(a.precioUnitario, a.cantidad)));
  return { noches: n.length, alojamiento, adicionales, total: alojamiento + adicionales };
}

// ───────────────────────── Tarifas ─────────────────────────

/** Tarifa vigente para (hotel, concepto, fecha). Si hay varias, gana la de inicio más reciente. */
export function tarifaVigente(
  tarifas: readonly Tarifa[],
  hotelId: Id,
  concepto: Concepto,
  fecha: ISODate,
): Tarifa | null {
  let mejor: Tarifa | null = null;
  for (const t of tarifas) {
    if (t.hotelId !== hotelId || t.concepto !== concepto) continue;
    if (fecha < t.vigenteDesde) continue;
    if (t.vigenteHasta && fecha > t.vigenteHasta) continue;
    if (!mejor || t.vigenteDesde > mejor.vigenteDesde) mejor = t;
  }
  return mejor;
}

/** Detecta tarifas del mismo hotel/concepto con vigencias superpuestas (ambigüedad de precio). */
export function solapamientosTarifa(tarifas: readonly Tarifa[]): [Tarifa, Tarifa][] {
  const out: [Tarifa, Tarifa][] = [];
  for (let i = 0; i < tarifas.length; i++) {
    for (let j = i + 1; j < tarifas.length; j++) {
      const a = tarifas[i]!;
      const b = tarifas[j]!;
      if (a.hotelId !== b.hotelId || a.concepto !== b.concepto) continue;
      const aFin = a.vigenteHasta ?? '9999-12-31';
      const bFin = b.vigenteHasta ?? '9999-12-31';
      if (a.vigenteDesde <= bFin && b.vigenteDesde <= aFin) out.push([a, b]);
    }
  }
  return out;
}

// ───────────────────────── Validación ─────────────────────────

export interface ContextoValidacion {
  hoteles: readonly Hotel[];
  empresaIds: ReadonlySet<Id>;
  solicitanteIds: ReadonlySet<Id>;
  /** Otros registros, para detectar doble asignación del mismo RUT. */
  otrosRegistros: readonly Registro[];
}

export interface ResultadoValidacion {
  errores: string[];
  advertencias: string[];
}

function tramoEn(tramos: readonly Tramo[], fecha: ISODate): Tramo | undefined {
  // Un adicional del día de salida se asocia al último tramo.
  return tramos.find((t) => fecha >= t.desde && fecha < t.hasta) ?? (fecha === tramos[tramos.length - 1]?.hasta ? tramos[tramos.length - 1] : undefined);
}

export function validarRegistro(r: Registro, ctx: ContextoValidacion): ResultadoValidacion {
  const errores: string[] = [];
  const advertencias: string[] = [];
  const hotelIds = new Set(ctx.hoteles.map((h) => h.id));

  // Huésped
  if (!validarRut(r.huesped.rut)) errores.push('RUT del huésped inválido.');
  if (!r.huesped.nombre.trim()) errores.push('Nombre del huésped obligatorio.');

  // Referencias
  if (!ctx.empresaIds.has(r.empresaId)) errores.push('Empresa no seleccionada o inexistente.');
  if (!ctx.solicitanteIds.has(r.solicitanteId)) errores.push('Solicitante (quien deriva) no seleccionado o inexistente.');
  if (!esFechaValida(r.fechaSolicitud)) errores.push('Fecha de solicitud inválida.');

  // Tramos
  if (r.tramos.length === 0) {
    errores.push('Debe existir al menos un tramo de estadía.');
  } else {
    r.tramos.forEach((t, i) => {
      const n = `Tramo ${i + 1}`;
      if (!hotelIds.has(t.hotelId)) errores.push(`${n}: hotel inválido.`);
      if (!esFechaValida(t.desde) || !esFechaValida(t.hasta)) {
        errores.push(`${n}: fechas inválidas.`);
        return;
      }
      if (t.hasta <= t.desde) errores.push(`${n}: la salida debe ser posterior al ingreso (mínimo 1 noche).`);
      if (!Number.isSafeInteger(t.tarifaNoche) || t.tarifaNoche <= 0) errores.push(`${n}: tarifa por noche debe ser un entero > 0.`);
      const prev = r.tramos[i - 1];
      if (prev && prev.hasta !== t.desde) {
        errores.push(`${n}: debe comenzar el ${prev.hasta} (salida del tramo anterior). Los tramos deben ser contiguos.`);
      }
      if (prev && prev.hotelId === t.hotelId && prev.tarifaNoche === t.tarifaNoche) {
        advertencias.push(`${n}: mismo hotel y tarifa que el tramo anterior; podría fusionarse.`);
      }
    });
    if (esFechaValida(r.fechaSolicitud) && esFechaValida(ingreso(r)) && r.fechaSolicitud > ingreso(r)) {
      advertencias.push('Fecha de solicitud posterior al ingreso.');
    }
  }

  const fechasOk = r.tramos.every((t) => esFechaValida(t.desde) && esFechaValida(t.hasta) && t.hasta > t.desde);
  const total = fechasOk ? nochesReservadas(r) : 0;

  // No show
  if (r.estado === 'NO_SHOW') {
    if (!r.noShow) errores.push('No show: debe indicar la modalidad de cobro.');
    else if (r.noShow.modalidad === 'PARCIAL') {
      const n = r.noShow.nochesCobradas;
      if (!Number.isSafeInteger(n) || n < 1 || n >= total) {
        errores.push(`No show parcial: noches cobradas debe estar entre 1 y ${Math.max(1, total - 1)}.`);
      }
    }
    if (r.adicionales.length > 0) advertencias.push('Registro no show con cargos adicionales.');
  }

  // Adicionales
  if (fechasOk && r.tramos.length > 0) {
    const ini = ingreso(r);
    const fin = salida(r);
    r.adicionales.forEach((a, i) => {
      const n = `Adicional ${i + 1}`;
      if (!esFechaValida(a.fecha)) errores.push(`${n}: fecha inválida.`);
      else if (!enRango(a.fecha, ini, fin)) errores.push(`${n}: fecha fuera de la estadía (${ini} a ${fin}).`);
      else {
        const t = tramoEn(r.tramos, a.fecha);
        if (t && t.hotelId !== a.hotelId) advertencias.push(`${n}: el hotel no coincide con el tramo vigente ese día.`);
      }
      if (!hotelIds.has(a.hotelId)) errores.push(`${n}: hotel inválido.`);
      if (!Number.isSafeInteger(a.cantidad) || a.cantidad <= 0) errores.push(`${n}: cantidad debe ser entera > 0.`);
      if (!Number.isSafeInteger(a.precioUnitario) || a.precioUnitario < 0) errores.push(`${n}: precio unitario debe ser entero ≥ 0.`);
      if (a.concepto === 'OTRO' && !a.descripcion.trim()) errores.push(`${n}: concepto "Otro" requiere descripción.`);
    });
  }

  // Doble asignación: mismo RUT con noches superpuestas en otro registro vigente
  if (fechasOk && r.estado !== 'ANULADO' && validarRut(r.huesped.rut)) {
    const rut = normalizarRut(r.huesped.rut);
    const ini = ingreso(r);
    const fin = salida(r);
    for (const o of ctx.otrosRegistros) {
      if (o.id === r.id || o.estado === 'ANULADO' || o.tramos.length === 0) continue;
      if (normalizarRut(o.huesped.rut) !== rut) continue;
      if (ini < salida(o) && ingreso(o) < fin) {
        errores.push(`Superposición con folio ${o.folio} (${ingreso(o)} → ${salida(o)}) para el mismo RUT.`);
      }
    }
  }

  return { errores, advertencias };
}
