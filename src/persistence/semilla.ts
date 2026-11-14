import type { Snapshot } from './repository';

/** IDs estables de los hoteles del contrato (idénticos en supabase/migrations/0004). */
export const HOTEL_ID = {
  TABANCURA: 'a0000000-0000-4000-8000-000000000001',
  ALTO_ATACAMA: 'a0000000-0000-4000-8000-000000000002',
  MURAY: 'a0000000-0000-4000-8000-000000000003',
} as const;

/**
 * Datos iniciales: estructura hotelera del contrato. Las tarifas NO se siembran:
 * deben cargarse con sus montos reales y vigencia en "Hoteles y tarifas".
 */
export function semilla(): Snapshot {
  return {
    version: 4,
    hoteles: [
      { id: HOTEL_ID.TABANCURA, nombre: 'Hotel Tabancura', tipo: 'MADRE', activo: true },
      { id: HOTEL_ID.ALTO_ATACAMA, nombre: 'Hotel Alto Atacama', tipo: 'CONVENIO', activo: true },
      { id: HOTEL_ID.MURAY, nombre: 'Hotel Muray', tipo: 'CONVENIO', activo: true },
    ],
    habitaciones: [],
    tarifas: [],
    empresas: [],
    solicitantes: [],
    registros: [],
    estadosPago: [],
    contadores: { folioRegistro: 0, correlativoEDP: 0 },
  };
}
