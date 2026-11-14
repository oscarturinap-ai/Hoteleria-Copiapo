/** Fixtures compartidos por los tests de dominio. */
import type { CargoAdicional, Registro, Tramo } from './types';

// ───────── Fixtures ─────────
export const TAB = 'h-tab';
export const ALTO = 'h-alto';
export const MUR = 'h-mur';
export const hoteles = [
  { id: TAB, nombre: 'Hotel Tabancura', tipo: 'MADRE' as const, activo: true },
  { id: ALTO, nombre: 'Hotel Alto Atacama', tipo: 'CONVENIO' as const, activo: true },
  { id: MUR, nombre: 'Hotel Muray', tipo: 'CONVENIO' as const, activo: true },
];

let seq = 0;
export const tramo = (hotelId: string, desde: string, hasta: string, tarifaNoche: number): Tramo => ({
  id: `t${++seq}`, hotelId, desde, hasta, tarifaNoche, habitacion: '', motivo: '',
});
export const adic = (p: Partial<CargoAdicional> & Pick<CargoAdicional, 'fecha' | 'hotelId'>): CargoAdicional => ({
  id: `a${++seq}`, concepto: 'ALMUERZO', descripcion: '', cantidad: 1, precioUnitario: 12_000, ...p,
});
export const reg = (p: Partial<Registro> = {}): Registro => ({
  id: `r${++seq}`,
  folio: seq,
  huesped: { rut: '11.111.111-1', nombre: 'Juan Pérez' },
  empresaId: 'e1',
  solicitanteId: 's1',
  fechaSolicitud: '2026-11-01',
  tramos: [tramo(TAB, '2026-11-09', '2026-11-12', 80_000)],
  adicionales: [],
  estado: 'CHECK_OUT',
  noShow: null,
  observaciones: '',
  historial: [],
  creadoEn: '',
  actualizadoEn: '',
  ...p,
});
