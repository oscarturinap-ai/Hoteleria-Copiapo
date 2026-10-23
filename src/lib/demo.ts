import type { Registro, Tarifario } from "@/domain";

/** Datos de demostración hasta conectar Supabase. Tarifas ficticias. */
export const tarifarioDemo: Tarifario = {
  TABANCURA: { ALOJAMIENTO: 45_000, ALMUERZO: 9_500, CENA: 11_000 },
  ALTO_ATACAMA: { ALOJAMIENTO: 52_000, ALMUERZO: 10_000, CENA: 12_500 },
  MURAY: { ALOJAMIENTO: 38_000, ALMUERZO: 8_000, CENA: 9_000 },
};

export const registrosDemo: Registro[] = [
  {
    id: "d1", empresa: "Empresa A", solicitante: "Solicitante 1", rut: "11111111-1", nombre: "Trabajador 1",
    hotel: "TABANCURA", fechaIngreso: "2026-10-01", fechaSalida: "2026-10-05",
    servicios: { alojamiento: true, almuerzos: 4, cenas: 4 },
  },
  {
    id: "d2", empresa: "Empresa A", solicitante: "Solicitante 1", rut: "12345678-5", nombre: "Trabajador 2",
    hotel: "ALTO_ATACAMA", fechaIngreso: "2026-10-02", fechaSalida: "2026-10-04",
    servicios: { alojamiento: true, almuerzos: 0, cenas: 2 },
  },
  {
    id: "d3", empresa: "Empresa B", solicitante: "Solicitante 2", rut: "10000013-K", nombre: "Trabajador 3",
    hotel: "MURAY", fechaIngreso: "2026-10-03", fechaSalida: "2026-10-06",
    servicios: { alojamiento: true, almuerzos: 3, cenas: 3 },
  },
];
