/** Montos siempre en pesos chilenos enteros (CLP no usa decimales). */
export type CLP = number;

/** Fecha calendario sin hora, formato ISO `YYYY-MM-DD`. */
export type FechaISO = string;

export const HOTELES = ["TABANCURA", "ALTO_ATACAMA", "MURAY"] as const;
export type Hotel = (typeof HOTELES)[number];

/** Tabancura es el hotel madre; el resto opera por convenio. */
export const HOTEL_MADRE: Hotel = "TABANCURA";

export const CONCEPTOS = ["ALOJAMIENTO", "ALMUERZO", "CENA"] as const;
export type Concepto = (typeof CONCEPTOS)[number];

/** Tarifa unitaria por hotel y concepto. */
export type Tarifario = Record<Hotel, Record<Concepto, CLP>>;

export interface Servicios {
  /** Si true, se cobran todas las noches entre ingreso y salida. */
  alojamiento: boolean;
  /** Cantidad de almuerzos consumidos. */
  almuerzos: number;
  /** Cantidad de cenas consumidas. */
  cenas: number;
}

export interface Registro {
  id: string;
  empresa: string;
  solicitante: string;
  rut: string;
  nombre: string;
  hotel: Hotel;
  fechaIngreso: FechaISO;
  fechaSalida: FechaISO;
  servicios: Servicios;
}

export interface LineaCobro {
  concepto: Concepto;
  cantidad: number;
  tarifa: CLP;
  subtotal: CLP;
}
