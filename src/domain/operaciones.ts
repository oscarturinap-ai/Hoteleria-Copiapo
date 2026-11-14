/**
 * Operaciones de recepción (front desk), funciones puras: reciben un registro y devuelven uno
 * nuevo o un error de negocio. La persistencia y el historial los agrega la capa de aplicación.
 */
import { formatoCLP } from './dinero';
import { diffDias, formatoFecha } from './fechas';
import { normalizarRut } from './rut';
import { ingreso, salida } from './registro';
import type { CargoAdicional, Id, ISODate, NoShow, Registro, Tramo } from './types';
import { ETIQUETA_CONCEPTO, ETIQUETA_ESTADO } from './types';
import type { Nombres } from './exportar';

export type Resultado<T> = { ok: true; valor: T; detalle: string } | { ok: false; error: string };

const ok = <T>(valor: T, detalle: string): Resultado<T> => ({ ok: true, valor, detalle });
const err = <T>(error: string): Resultado<T> => ({ ok: false, error });

function clonar(r: Registro): Registro {
  return structuredClone(r);
}

/** Recorta o extiende el inicio de la estadía a `fecha`. */
function moverIngreso(tramos: Tramo[], fecha: ISODate): Tramo[] | null {
  const restantes = tramos.filter((t) => t.hasta > fecha);
  const primero = restantes[0];
  if (!primero) return null;
  return [{ ...primero, desde: fecha }, ...restantes.slice(1)];
}

/** Recorta o extiende el término de la estadía a `fecha` (la última tarifa se mantiene al extender). */
function moverSalida(tramos: Tramo[], fecha: ISODate): Tramo[] | null {
  const restantes = tramos.filter((t) => t.desde < fecha);
  const ultimo = restantes[restantes.length - 1];
  if (!ultimo) return null;
  return [...restantes.slice(0, -1), { ...ultimo, hasta: fecha }];
}

// ───────────────────────── Check-in ─────────────────────────

export interface OpcionesCheckIn {
  /** Llegada tardía: si true, el IN se mueve a la fecha real y no se cobran las noches no usadas. */
  ajustarIngreso: boolean;
  /** Habitación a asignar al tramo de llegada (si se indica). */
  habitacionId?: Id | null;
  /** El hotel de llegada tiene inventario: no se permite check-in sin habitación. */
  requiereHabitacion?: boolean;
}

export function checkIn(r: Registro, fecha: ISODate, op: OpcionesCheckIn): Resultado<Registro> {
  if (r.estado !== 'RESERVADO') return err(`Sólo se puede hacer check-in de registros reservados (estado actual: ${ETIQUETA_ESTADO[r.estado]}).`);
  const inProg = ingreso(r);
  if (fecha < inProg) return err(`Ingreso programado para el ${formatoFecha(inProg)}. Para adelantar la llegada, edite las fechas del registro.`);
  if (fecha >= salida(r)) return err(`La fecha de check-in es igual o posterior a la salida (${formatoFecha(salida(r))}). Marque no show o edite las fechas.`);
  const n = clonar(r);
  n.estado = 'IN_HOUSE';
  let detalle = `Check-in ${formatoFecha(fecha)}`;
  if (fecha > inProg) {
    if (op.ajustarIngreso) {
      const t = moverIngreso(n.tramos, fecha);
      if (!t) return err('No fue posible ajustar el ingreso.');
      n.tramos = t;
      detalle += ` (llegada tardía: IN ajustado de ${formatoFecha(inProg)}; ${diffDias(inProg, fecha)} noche(s) liberada(s))`;
    } else {
      detalle += ` (llegada tardía: se mantienen las noches desde el ${formatoFecha(inProg)})`;
    }
  }
  const llegada = n.tramos.find((t) => fecha >= t.desde && fecha < t.hasta) ?? n.tramos[0]!;
  if (op.habitacionId && op.habitacionId !== llegada.habitacionId) {
    llegada.habitacionId = op.habitacionId;
    detalle += ' · habitación asignada';
  }
  if (op.requiereHabitacion && !llegada.habitacionId) return err('Asigne una habitación para hacer el check-in.');
  return ok(n, detalle);
}

// ───────────────────────── Check-out ─────────────────────────

export interface OpcionesCheckOut {
  /** Si true y la fecha difiere del OUT programado, ajusta la estadía (salida anticipada o extensión). */
  ajustarSalida: boolean;
}

export function checkOut(r: Registro, fecha: ISODate, op: OpcionesCheckOut): Resultado<Registro> {
  if (r.estado !== 'IN_HOUSE') return err(`Sólo se puede hacer check-out de huéspedes in-house (estado actual: ${ETIQUETA_ESTADO[r.estado]}).`);
  const outProg = salida(r);
  if (fecha <= ingreso(r)) return err('La salida debe ser posterior al ingreso (mínimo 1 noche).');
  const n = clonar(r);
  n.estado = 'CHECK_OUT';
  let detalle = `Check-out ${formatoFecha(fecha)}`;
  if (fecha !== outProg) {
    const tipo = fecha < outProg ? 'salida anticipada' : 'extensión';
    if (op.ajustarSalida) {
      const t = moverSalida(n.tramos, fecha);
      if (!t) return err('No fue posible ajustar la salida.');
      n.tramos = t;
      const fuera = n.adicionales.filter((a) => a.fecha > fecha);
      if (fuera.length) return err(`Hay ${fuera.length} cargo(s) con fecha posterior a ${formatoFecha(fecha)}. Corríjalos antes del check-out.`);
      detalle += ` (${tipo}: OUT ajustado de ${formatoFecha(outProg)}, ${Math.abs(diffDias(outProg, fecha))} noche(s) ${fecha < outProg ? 'menos' : 'más'})`;
    } else {
      detalle += ` (${tipo} sin ajuste: se mantiene OUT ${formatoFecha(outProg)})`;
    }
  }
  return ok(n, detalle);
}

// ───────────────────────── No show / anulación ─────────────────────────

export function marcarNoShow(r: Registro, ns: NoShow): Resultado<Registro> {
  if (r.estado !== 'RESERVADO') return err('Sólo un registro reservado puede marcarse como no show.');
  const n = clonar(r);
  n.estado = 'NO_SHOW';
  n.noShow = { ...ns };
  const txt = ns.modalidad === 'TOTAL' ? 'cobro total' : ns.modalidad === 'PARCIAL' ? `cobro parcial ${ns.nochesCobradas} noche(s)` : 'sin cargo';
  return ok(n, `No show (${txt})`);
}

export function anular(r: Registro, motivo: string): Resultado<Registro> {
  if (!motivo.trim()) return err('Debe indicar el motivo de anulación.');
  if (r.estado === 'ANULADO') return err('El registro ya está anulado.');
  if (r.estado === 'CHECK_OUT') return err('No se puede anular un registro con check-out; corrija su contenido.');
  const n = clonar(r);
  n.estado = 'ANULADO';
  n.noShow = null;
  return ok(n, `Anulado: ${motivo.trim()}`);
}

// ───────────────────────── Cargos ─────────────────────────

export function agregarCargo(r: Registro, c: CargoAdicional): Resultado<Registro> {
  if (r.estado === 'ANULADO') return err('No se pueden agregar cargos a un registro anulado.');
  const n = clonar(r);
  n.adicionales.push({ ...c });
  return ok(
    n,
    `Cargo ${ETIQUETA_CONCEPTO[c.concepto]}${c.descripcion ? ` (${c.descripcion})` : ''} ${c.cantidad} × ${formatoCLP(c.precioUnitario)} el ${formatoFecha(c.fecha)}`,
  );
}

/** Tramo vigente en una fecha (el día de salida corresponde al último tramo). */
export function tramoVigente(r: Pick<Registro, 'tramos'>, fecha: ISODate): Tramo | null {
  const t = r.tramos.find((x) => fecha >= x.desde && fecha < x.hasta);
  if (t) return t;
  const ult = r.tramos[r.tramos.length - 1];
  return ult && fecha === ult.hasta ? ult : null;
}

// ───────────────────────── Panel del día ─────────────────────────

export interface PanelDia {
  llegadas: Registro[];
  salidas: Registro[];
  inHouse: Registro[];
  /** Reservados cuyo ingreso ya pasó: check-in tardío o no show. */
  llegadasPendientes: Registro[];
  /** In-house cuya salida ya pasó: check-out pendiente. */
  salidasVencidas: Registro[];
  /** Pernoctan la noche de `fecha`, por hotel (excluye anulados y no show). */
  ocupacion: Map<Id, number>;
}

export function panelDia(registros: readonly Registro[], fecha: ISODate): PanelDia {
  const p: PanelDia = { llegadas: [], salidas: [], inHouse: [], llegadasPendientes: [], salidasVencidas: [], ocupacion: new Map() };
  for (const r of registros) {
    if (r.tramos.length === 0) continue;
    const ini = ingreso(r);
    const fin = salida(r);
    if (r.estado === 'RESERVADO') {
      if (ini === fecha) p.llegadas.push(r);
      else if (ini < fecha) p.llegadasPendientes.push(r);
    }
    if (r.estado === 'IN_HOUSE') {
      p.inHouse.push(r);
      if (fin === fecha) p.salidas.push(r);
      else if (fin < fecha) p.salidasVencidas.push(r);
    }
    if (r.estado === 'RESERVADO' || r.estado === 'IN_HOUSE' || r.estado === 'CHECK_OUT') {
      const t = r.tramos.find((x) => fecha >= x.desde && fecha < x.hasta);
      if (t) p.ocupacion.set(t.hotelId, (p.ocupacion.get(t.hotelId) ?? 0) + 1);
    }
  }
  const porNombre = (a: Registro, b: Registro) => a.huesped.nombre.localeCompare(b.huesped.nombre);
  p.llegadas.sort(porNombre);
  p.salidas.sort(porNombre);
  p.inHouse.sort(porNombre);
  p.llegadasPendientes.sort((a, b) => ingreso(a).localeCompare(ingreso(b)));
  p.salidasVencidas.sort((a, b) => salida(a).localeCompare(salida(b)));
  return p;
}

// ───────────────────────── Perfil de huésped ─────────────────────────

export interface PerfilHuesped {
  rut: string;
  nombre: string;
  estadias: number;
  ultimaEmpresaId: Id;
  ultimoSolicitanteId: Id;
  ultimaSalida: ISODate;
}

/** Historial por RUT, a partir de registros previos (excluye anulados). */
export function perfilHuesped(registros: readonly Registro[], rut: string, excluirId?: Id): PerfilHuesped | null {
  const clave = normalizarRut(rut);
  const previos = registros
    .filter((r) => r.id !== excluirId && r.estado !== 'ANULADO' && r.tramos.length > 0 && normalizarRut(r.huesped.rut) === clave)
    .sort((a, b) => salida(b).localeCompare(salida(a)));
  const u = previos[0];
  if (!u) return null;
  return {
    rut: clave,
    nombre: u.huesped.nombre,
    estadias: previos.length,
    ultimaEmpresaId: u.empresaId,
    ultimoSolicitanteId: u.solicitanteId,
    ultimaSalida: salida(u),
  };
}

// ───────────────────────── Diferencias (para historial) ─────────────────────────

/** Resumen legible de lo que cambió entre dos versiones de un registro. */
export function describirCambios(a: Registro, b: Registro, n: Nombres): string {
  const c: string[] = [];
  if (normalizarRut(a.huesped.rut) !== normalizarRut(b.huesped.rut)) c.push(`RUT ${a.huesped.rut} → ${b.huesped.rut}`);
  if (a.huesped.nombre.trim() !== b.huesped.nombre.trim()) c.push(`nombre "${a.huesped.nombre}" → "${b.huesped.nombre}"`);
  if (a.empresaId !== b.empresaId) c.push(`empresa ${n.empresa(a.empresaId)} → ${n.empresa(b.empresaId)}`);
  if (a.solicitanteId !== b.solicitanteId) c.push(`solicitante ${n.solicitante(a.solicitanteId)} → ${n.solicitante(b.solicitanteId)}`);
  if (a.fechaSolicitud !== b.fechaSolicitud) c.push(`fecha solicitud ${formatoFecha(a.fechaSolicitud)} → ${formatoFecha(b.fechaSolicitud)}`);
  if (a.estado !== b.estado) c.push(`estado ${ETIQUETA_ESTADO[a.estado]} → ${ETIQUETA_ESTADO[b.estado]}`);
  if (JSON.stringify(a.noShow) !== JSON.stringify(b.noShow) && b.noShow) c.push(`no show ${b.noShow.modalidad.toLowerCase()}`);
  if (ingreso(a) !== ingreso(b)) c.push(`IN ${formatoFecha(ingreso(a))} → ${formatoFecha(ingreso(b))}`);
  if (salida(a) !== salida(b)) c.push(`OUT ${formatoFecha(salida(a))} → ${formatoFecha(salida(b))}`);
  const firmaT = (t: Tramo) => `${n.hotel(t.hotelId)} ${formatoFecha(t.desde)}–${formatoFecha(t.hasta)} ${formatoCLP(t.tarifaNoche)}${t.habitacionId ? ` hab. ${n.habitacion?.(t.habitacionId) ?? '?'}` : ''}`;
  const ta = a.tramos.map(firmaT).join(' | ');
  const tb = b.tramos.map(firmaT).join(' | ');
  if (ta !== tb) c.push(`tramos: ${tb}`);
  const ids = new Set(a.adicionales.map((x) => x.id));
  const idsB = new Set(b.adicionales.map((x) => x.id));
  const nuevos = b.adicionales.filter((x) => !ids.has(x.id)).length;
  const quitados = a.adicionales.filter((x) => !idsB.has(x.id)).length;
  const modificados = b.adicionales.filter((x) => {
    const o = a.adicionales.find((y) => y.id === x.id);
    return o && JSON.stringify(o) !== JSON.stringify(x);
  }).length;
  if (nuevos) c.push(`${nuevos} cargo(s) agregado(s)`);
  if (quitados) c.push(`${quitados} cargo(s) eliminado(s)`);
  if (modificados) c.push(`${modificados} cargo(s) modificado(s)`);
  if (a.observaciones !== b.observaciones) c.push('observaciones');
  return c.join('; ');
}
