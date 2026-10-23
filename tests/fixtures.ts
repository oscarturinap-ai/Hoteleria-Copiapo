import type { Registro, Tarifario } from "@/domain";

/** Tarifas ficticias solo para tests; las reales viven en la base de datos. */
export const tarifario: Tarifario = {
  TABANCURA: { ALOJAMIENTO: 45_000, ALMUERZO: 9_500, CENA: 11_000 },
  ALTO_ATACAMA: { ALOJAMIENTO: 52_000, ALMUERZO: 10_000, CENA: 12_500 },
  MURAY: { ALOJAMIENTO: 38_000, ALMUERZO: 8_000, CENA: 9_000 },
};

export function registro(parcial: Partial<Registro> = {}): Registro {
  return {
    id: "r1",
    empresa: "Minera Norte",
    solicitante: "J. Pérez",
    rut: "12345678-5",
    nombre: "Ana Soto",
    hotel: "TABANCURA",
    fechaIngreso: "2026-10-01",
    fechaSalida: "2026-10-04",
    servicios: { alojamiento: true, almuerzos: 3, cenas: 3 },
    ...parcial,
  };
}
