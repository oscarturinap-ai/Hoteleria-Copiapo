import { describe, expect, it } from "vitest";
import { generarEstadoDePago } from "@/domain";
import { registro, tarifario } from "./fixtures";

describe("generarEstadoDePago", () => {
  const registros = [
    registro({ id: "1" }), // Minera Norte / Tabancura: 196.500
    registro({ id: "2", hotel: "ALTO_ATACAMA", servicios: { alojamiento: true, almuerzos: 0, cenas: 2 } }), // 156.000 + 25.000
    registro({ id: "3", empresa: "Constructora Sur", fechaSalida: "2026-10-02", servicios: { alojamiento: true, almuerzos: 1, cenas: 1 } }), // 45.000 + 9.500 + 11.000
  ];

  const estado = generarEstadoDePago(registros, tarifario);

  it("agrupa por empresa (orden alfabético) y hotel", () => {
    expect(estado.empresas.map((e) => e.empresa)).toEqual(["Constructora Sur", "Minera Norte"]);
    const minera = estado.empresas[1];
    expect(minera.hoteles.map((h) => h.hotel)).toEqual(["ALTO_ATACAMA", "TABANCURA"]);
    expect(minera.hoteles.map((h) => h.total)).toEqual([181_000, 196_500]);
    expect(minera.total).toBe(377_500);
  });

  it("acumula cantidades y montos por concepto", () => {
    const tab = estado.empresas[1].hoteles[1];
    expect(tab.porConcepto.ALOJAMIENTO).toEqual({ cantidad: 3, monto: 135_000 });
  });

  it("el total general cuadra con la suma de subtotales", () => {
    expect(estado.empresas[0].total).toBe(65_500);
    expect(estado.total).toBe(443_000);
  });

  it("sin registros devuelve total 0", () => {
    expect(generarEstadoDePago([], tarifario)).toEqual({ empresas: [], total: 0 });
  });
});
