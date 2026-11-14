/**
 * Mapeo entre filas PostgreSQL (snake_case) y entidades del dominio (camelCase).
 * Funciones puras y testeadas: cualquier desajuste de esquema se detecta aquí y no en la UI.
 * Los registros NO pasan por aquí: la vista `registro_dominio` ya los entrega en formato de dominio.
 */
import type { Empresa, EstadoPago, Habitacion, Hotel, ResultadoEDP, Solicitante, Tarifa } from '../domain/types';

export interface Mapeo<T, R> {
  tabla: string;
  aFila: (x: T) => R;
  deFila: (r: R) => T;
}

// ───────── Hotel ─────────
export interface FilaHotel { id: string; nombre: string; tipo: Hotel['tipo']; activo: boolean }
export const mapeoHotel: Mapeo<Hotel, FilaHotel> = {
  tabla: 'hotel',
  aFila: (h) => ({ id: h.id, nombre: h.nombre, tipo: h.tipo, activo: h.activo }),
  deFila: (r) => ({ id: r.id, nombre: r.nombre, tipo: r.tipo, activo: r.activo }),
};

// ───────── Habitación ─────────
export interface FilaHabitacion {
  id: string; hotel_id: string; numero: string; tipo: Habitacion['tipo']; capacidad: number; activa: boolean; notas: string;
}
export const mapeoHabitacion: Mapeo<Habitacion, FilaHabitacion> = {
  tabla: 'habitacion',
  aFila: (h) => ({ id: h.id, hotel_id: h.hotelId, numero: h.numero, tipo: h.tipo, capacidad: h.capacidad, activa: h.activa, notas: h.notas }),
  deFila: (r) => ({ id: r.id, hotelId: r.hotel_id, numero: r.numero, tipo: r.tipo, capacidad: r.capacidad, activa: r.activa, notas: r.notas ?? '' }),
};

// ───────── Tarifa ─────────
export interface FilaTarifa {
  id: string; hotel_id: string; concepto: Tarifa['concepto']; monto: number; vigente_desde: string; vigente_hasta: string | null;
}
export const mapeoTarifa: Mapeo<Tarifa, FilaTarifa> = {
  tabla: 'tarifa',
  aFila: (t) => ({ id: t.id, hotel_id: t.hotelId, concepto: t.concepto, monto: t.monto, vigente_desde: t.vigenteDesde, vigente_hasta: t.vigenteHasta }),
  deFila: (r) => ({
    id: r.id, hotelId: r.hotel_id, concepto: r.concepto, monto: Number(r.monto), vigenteDesde: r.vigente_desde, vigenteHasta: r.vigente_hasta,
  }),
};

// ───────── Empresa ─────────
// rut es UNIQUE en la base: '' (sin RUT) se guarda como NULL para no colisionar.
export interface FilaEmpresa { id: string; rut: string | null; razon_social: string; activo: boolean }
export const mapeoEmpresa: Mapeo<Empresa, FilaEmpresa> = {
  tabla: 'empresa',
  aFila: (e) => ({ id: e.id, rut: e.rut.trim() || null, razon_social: e.razonSocial, activo: e.activo }),
  deFila: (r) => ({ id: r.id, rut: r.rut ?? '', razonSocial: r.razon_social, activo: r.activo }),
};

// ───────── Solicitante ─────────
export interface FilaSolicitante { id: string; nombre: string; empresa_id: string | null; cargo: string; email: string; activo: boolean }
export const mapeoSolicitante: Mapeo<Solicitante, FilaSolicitante> = {
  tabla: 'solicitante',
  aFila: (s) => ({ id: s.id, nombre: s.nombre, empresa_id: s.empresaId, cargo: s.cargo, email: s.email, activo: s.activo }),
  deFila: (r) => ({ id: r.id, nombre: r.nombre, empresaId: r.empresa_id, cargo: r.cargo ?? '', email: r.email ?? '', activo: r.activo }),
};

// ───────── Estado de pago ─────────
export interface FilaEstadoPago {
  id: string; correlativo: number; desde: string; hasta: string; hotel_id: string | null; empresa_id: string | null;
  estado: EstadoPago['estado']; observaciones: string; resultado: ResultadoEDP; etiquetas: Record<string, string>;
  total_neto: number; emitido_en: string;
}
export const mapeoEstadoPago: Mapeo<EstadoPago, FilaEstadoPago> = {
  tabla: 'estado_pago',
  aFila: (e) => ({
    id: e.id, correlativo: e.correlativo, desde: e.filtro.desde, hasta: e.filtro.hasta, hotel_id: e.filtro.hotelId,
    empresa_id: e.filtro.empresaId, estado: e.estado, observaciones: e.observaciones, resultado: e.resultado,
    etiquetas: e.etiquetas, total_neto: e.resultado.totales.total, emitido_en: e.emitidoEn,
  }),
  deFila: (r) => ({
    id: r.id, correlativo: r.correlativo,
    filtro: { desde: r.desde, hasta: r.hasta, hotelId: r.hotel_id, empresaId: r.empresa_id },
    emitidoEn: r.emitido_en, estado: r.estado, observaciones: r.observaciones ?? '', resultado: r.resultado, etiquetas: r.etiquetas ?? {},
  }),
};

/** Traduce errores de PostgreSQL/PostgREST a mensajes operativos. */
export function mensajeError(e: { message?: string; code?: string; details?: string } | null | undefined): string {
  if (!e) return 'Error desconocido';
  const m = e.message ?? '';
  if (m.startsWith('CONFLICTO:') || m.startsWith('PERMISO:')) return m.replace(/^\w+:\s*/, '');
  if (m.startsWith('Sobreventa')) return `Habitación sin cupo: ${m}`;
  if (e.code === '42501' || /row-level security/i.test(m)) return 'Su rol no tiene permiso para esta operación.';
  if (e.code === '23P01') return 'Conflicto de vigencias o fechas superpuestas (restricción de exclusión).';
  if (e.code === '23505') return 'Registro duplicado: ya existe un elemento con esos datos.';
  if (e.code === '23503') return 'Referencia inválida: el elemento está en uso o depende de otro inexistente.';
  return m || 'Error de base de datos';
}
