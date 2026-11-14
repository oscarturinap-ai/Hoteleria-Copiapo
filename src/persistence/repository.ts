import type { Empresa, EstadoPago, Hotel, Id, Registro, Solicitante, Tarifa } from '../domain/types';

/**
 * Contrato de persistencia. Asíncrono a propósito: la implementación localStorage es síncrona
 * por debajo, pero la UI ya queda preparada para Supabase/PostgreSQL sin cambios.
 */
export interface Collection<T extends { id: Id }> {
  list(): Promise<T[]>;
  upsert(item: T): Promise<T>;
  remove(id: Id): Promise<void>;
}

export interface Snapshot {
  version: number;
  hoteles: Hotel[];
  tarifas: Tarifa[];
  empresas: Empresa[];
  solicitantes: Solicitante[];
  registros: Registro[];
  estadosPago: EstadoPago[];
  contadores: { folioRegistro: number; correlativoEDP: number };
}

export interface Repository {
  hoteles: Collection<Hotel>;
  tarifas: Collection<Tarifa>;
  empresas: Collection<Empresa>;
  solicitantes: Collection<Solicitante>;
  registros: Collection<Registro>;
  estadosPago: Collection<EstadoPago>;
  /** Correlativos atómicos (en Postgres: secuencias). */
  siguiente(contador: keyof Snapshot['contadores']): Promise<number>;
  exportar(): Promise<Snapshot>;
  importar(s: Snapshot): Promise<void>;
}
