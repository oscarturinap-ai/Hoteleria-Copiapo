/**
 * Modelo de dominio. Sin dependencias de UI ni de persistencia.
 *
 * Convenciones:
 *  - Fechas de calendario: `ISODate` ('YYYY-MM-DD'), sin hora ni zona horaria.
 *  - Montos: `CLP` = entero en pesos chilenos, NETO (sin IVA). Nunca decimales.
 *  - Una "noche" se identifica por la fecha en que comienza (noche del 9 = 9→10).
 */

export type ISODate = string;
export type CLP = number;
export type Id = string;

// ───────────────────────── Maestros ─────────────────────────

export type TipoHotel = 'MADRE' | 'CONVENIO';

export interface Hotel {
  id: Id;
  nombre: string;
  tipo: TipoHotel;
  activo: boolean;
}

export type TipoHabitacion = 'SINGLE' | 'DOBLE' | 'TWIN' | 'TRIPLE' | 'SUITE';

export const ETIQUETA_TIPO_HAB: Record<TipoHabitacion, string> = {
  SINGLE: 'Single',
  DOBLE: 'Doble (matrimonial)',
  TWIN: 'Twin (2 camas)',
  TRIPLE: 'Triple',
  SUITE: 'Suite',
};

/** Capacidad sugerida en camas/personas por tipo (editable por habitación). */
export const CAPACIDAD_TIPO: Record<TipoHabitacion, number> = { SINGLE: 1, DOBLE: 1, TWIN: 2, TRIPLE: 3, SUITE: 1 };

export interface Habitacion {
  id: Id;
  hotelId: Id;
  numero: string;
  tipo: TipoHabitacion;
  /** Personas del contrato que puede alojar simultáneamente (habitación compartida si > 1). */
  capacidad: number;
  activa: boolean;
  notas: string;
}

/** Conceptos facturables. ALOJAMIENTO incluye desayuno; el resto es adicional. */
export type Concepto =
  | 'ALOJAMIENTO'
  | 'ALMUERZO'
  | 'CENA'
  | 'COLACION'
  | 'BEBIDA'
  | 'AGUA'
  | 'LAVANDERIA'
  | 'OTRO';

export const CONCEPTOS_ADICIONALES: readonly Exclude<Concepto, 'ALOJAMIENTO'>[] = [
  'ALMUERZO',
  'CENA',
  'COLACION',
  'BEBIDA',
  'AGUA',
  'LAVANDERIA',
  'OTRO',
];

export const ETIQUETA_CONCEPTO: Record<Concepto, string> = {
  ALOJAMIENTO: 'Alojamiento (c/desayuno)',
  ALMUERZO: 'Almuerzo',
  CENA: 'Cena',
  COLACION: 'Colación',
  BEBIDA: 'Bebida',
  AGUA: 'Agua',
  LAVANDERIA: 'Lavandería',
  OTRO: 'Otro',
};

/** Tarifa unitaria neta por hotel y concepto, con vigencia [desde, hasta] inclusiva. */
export interface Tarifa {
  id: Id;
  hotelId: Id;
  concepto: Concepto;
  monto: CLP;
  vigenteDesde: ISODate;
  vigenteHasta: ISODate | null;
}

export interface Empresa {
  id: Id;
  rut: string;
  razonSocial: string;
  activo: boolean;
}

/** Persona/área que deriva al huésped. */
export interface Solicitante {
  id: Id;
  nombre: string;
  empresaId: Id | null;
  cargo: string;
  email: string;
  activo: boolean;
}

// ───────────────────────── Registros ─────────────────────────

export type EstadoRegistro = 'RESERVADO' | 'IN_HOUSE' | 'CHECK_OUT' | 'NO_SHOW' | 'ANULADO';

export const ETIQUETA_ESTADO: Record<EstadoRegistro, string> = {
  RESERVADO: 'Reservado',
  IN_HOUSE: 'In-house',
  CHECK_OUT: 'Check-out',
  NO_SHOW: 'No show',
  ANULADO: 'Anulado',
};

export type ModalidadNoShow = 'TOTAL' | 'PARCIAL' | 'SIN_CARGO';

export interface NoShow {
  modalidad: ModalidadNoShow;
  /** Sólo para PARCIAL: se cobran las primeras N noches reservadas. */
  nochesCobradas: number;
}

/**
 * Tramo de estadía en un hotel con una tarifa fija. [desde, hasta) — `hasta` es el día de salida
 * del tramo (no se cobra esa noche). Un cambio de hotel o de tarifa genera un tramo nuevo
 * dentro del mismo registro (derivación).
 */
export interface Tramo {
  id: Id;
  hotelId: Id;
  desde: ISODate;
  hasta: ISODate;
  /** Snapshot de la tarifa al momento de asignar; no cambia si el tarifario se actualiza. */
  tarifaNoche: CLP;
  /** Habitación asignada (null = sin asignar; se exige al check-in si el hotel tiene inventario). */
  habitacionId: Id | null;
  motivo: string;
}

export interface CargoAdicional {
  id: Id;
  fecha: ISODate;
  hotelId: Id;
  concepto: Exclude<Concepto, 'ALOJAMIENTO'>;
  descripcion: string;
  cantidad: number;
  /** Snapshot del precio unitario neto. */
  precioUnitario: CLP;
}

export interface Huesped {
  rut: string;
  nombre: string;
}

export interface Registro {
  id: Id;
  folio: number;
  huesped: Huesped;
  empresaId: Id;
  solicitanteId: Id;
  fechaSolicitud: ISODate;
  /** Contiguos y ordenados. IN = tramos[0].desde, OUT = último.hasta. */
  tramos: Tramo[];
  adicionales: CargoAdicional[];
  estado: EstadoRegistro;
  noShow: NoShow | null;
  observaciones: string;
  /** Bitácora operativa append-only (quién, cuándo, qué). */
  historial: EventoRegistro[];
  creadoEn: string;
  actualizadoEn: string;
}

export type AccionRegistro = 'CREADO' | 'EDITADO' | 'CHECK_IN' | 'CHECK_OUT' | 'NO_SHOW' | 'ANULADO' | 'CARGO';

export const ETIQUETA_ACCION: Record<AccionRegistro, string> = {
  CREADO: 'Creado',
  EDITADO: 'Editado',
  CHECK_IN: 'Check-in',
  CHECK_OUT: 'Check-out',
  NO_SHOW: 'No show',
  ANULADO: 'Anulado',
  CARGO: 'Cargo',
};

export interface EventoRegistro {
  en: string;
  usuario: string;
  accion: AccionRegistro;
  detalle: string;
}

// ───────────────────────── Estados de pago ─────────────────────────

export interface FiltroEDP {
  /** Primera noche/fecha incluida. */
  desde: ISODate;
  /** Última noche/fecha incluida (inclusive). */
  hasta: ISODate;
  hotelId: Id | null;
  empresaId: Id | null;
}

export interface DetalleTarifa {
  tarifa: CLP;
  noches: number;
  subtotal: CLP;
}

/** Una fila del EDP = un huésped (registro) en un hotel dentro del período. */
export interface LineaEDP {
  registroId: Id;
  folio: number;
  rut: string;
  nombre: string;
  empresaId: Id;
  solicitanteId: Id;
  fechaSolicitud: ISODate;
  hotelId: Id;
  /** IN/OUT completos del registro. */
  ingreso: ISODate;
  salida: ISODate;
  /** Primera y última noche cobrada en este hotel dentro del período (null si sólo hay adicionales). */
  primeraNoche: ISODate | null;
  ultimaNoche: ISODate | null;
  estado: EstadoRegistro;
  noShow: NoShow | null;
  derivado: boolean;
  noches: number;
  detalleTarifas: DetalleTarifa[];
  alojamiento: CLP;
  adicionalesPorConcepto: Partial<Record<Concepto, CLP>>;
  adicionales: CLP;
  total: CLP;
}

export interface Subtotal {
  clave: Id;
  pasajeros: number;
  noches: number;
  alojamiento: CLP;
  adicionales: CLP;
  total: CLP;
}

export interface Advertencia {
  registroId: Id;
  folio: number;
  mensaje: string;
}

export interface ResultadoEDP {
  filtro: FiltroEDP;
  lineas: LineaEDP[];
  totales: Omit<Subtotal, 'clave'>;
  porHotel: Subtotal[];
  porEmpresa: Subtotal[];
  adicionalesPorConcepto: Partial<Record<Concepto, CLP>>;
  advertencias: Advertencia[];
}

export interface EstadoPago {
  id: Id;
  correlativo: number;
  filtro: FiltroEDP;
  emitidoEn: string;
  estado: 'EMITIDO' | 'ANULADO';
  observaciones: string;
  /** Snapshot inmutable del cálculo al emitir. */
  resultado: ResultadoEDP;
  /** Nombres de hoteles/empresas/solicitantes al momento de emitir (id → nombre). */
  etiquetas: Record<Id, string>;
}
