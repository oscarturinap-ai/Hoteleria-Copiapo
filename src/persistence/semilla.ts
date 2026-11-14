import type { Snapshot } from './repository';

/**
 * Datos iniciales: estructura hotelera del contrato. Las tarifas NO se siembran:
 * deben cargarse con sus montos reales y vigencia en "Hoteles y tarifas".
 */
export function semilla(): Snapshot {
  return {
    version: 1,
    hoteles: [
      { id: 'hotel-tabancura', nombre: 'Hotel Tabancura', tipo: 'MADRE', activo: true },
      { id: 'hotel-alto-atacama', nombre: 'Hotel Alto Atacama', tipo: 'CONVENIO', activo: true },
      { id: 'hotel-muray', nombre: 'Hotel Muray', tipo: 'CONVENIO', activo: true },
    ],
    tarifas: [],
    empresas: [],
    solicitantes: [],
    registros: [],
    estadosPago: [],
    contadores: { folioRegistro: 0, correlativoEDP: 0 },
  };
}
