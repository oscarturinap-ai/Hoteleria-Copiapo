import { describe, expect, it } from "vitest";
import { calcularLineas, totalLineas } from "@/domain";
import { registro, tarifario } from "./fixtures";

describe("calcularLineas", () => {
  it("cobra noches × tarifa del hotel y comidas por cantidad", () => {
    const lineas = calcularLineas(registro(), tarifario);
    expect(lineas).toEqual([
      { concepto: "ALOJAMIENTO", cantidad: 3, tarifa: 45_000, subtotal: 135_000 },
      { concepto: "ALMUERZO", cantidad: 3, tarifa: 9_500, subtotal: 28_500 },
      { concepto: "CENA", cantidad: 3, tarifa: 11_000, subtotal: 33_000 },
    ]);
    expect(totalLineas(lineas)).toBe(196_500);
  });

  it("usa la tarifa del hotel del registro", () => {
    const [aloj] = calcularLineas(registro({ hotel: "MURAY" }), tarifario);
    expect(aloj.subtotal).toBe(3 * 38_000);
  });

  it("sin alojamiento solo cobra comidas", () => {
    const lineas = calcularLineas(
      registro({ servicios: { alojamiento: false, almuerzos: 2, cenas: 0 } }),
      tarifario,
    );
    expect(lineas).toEqual([{ concepto: "ALMUERZO", cantidad: 2, tarifa: 9_500, subtotal: 19_000 }]);
  });

  it("falla si falta tarifa o la cantidad es inválida", () => {
    const incompleto = { ...tarifario, MURAY: { ...tarifario.MURAY, CENA: NaN } };
    expect(() => calcularLineas(registro({ hotel: "MURAY" }), incompleto)).toThrow(/tarifa/);
    expect(() =>
      calcularLineas(registro({ servicios: { alojamiento: true, almuerzos: 1.5, cenas: 0 } }), tarifario),
    ).toThrow(/Cantidad/);
  });
});
