import { describe, expect, it } from "vitest";
import { contarNoches } from "@/domain";

describe("contarNoches", () => {
  it("cuenta noches entre ingreso y salida", () => {
    expect(contarNoches("2026-10-01", "2026-10-04")).toBe(3);
  });

  it("mismo día = 0 noches", () => {
    expect(contarNoches("2026-10-01", "2026-10-01")).toBe(0);
  });

  it("cruza fin de mes y año bisiesto", () => {
    expect(contarNoches("2028-02-27", "2028-03-01")).toBe(3);
    expect(contarNoches("2026-12-30", "2027-01-02")).toBe(3);
  });

  it("no se altera con cambio de horario en Chile (abril y septiembre)", () => {
    expect(contarNoches("2026-04-03", "2026-04-06")).toBe(3);
    expect(contarNoches("2026-09-05", "2026-09-08")).toBe(3);
  });

  it("rechaza salida anterior al ingreso", () => {
    expect(() => contarNoches("2026-10-05", "2026-10-04")).toThrow(/anterior/);
  });

  it("rechaza fechas inexistentes o mal formateadas", () => {
    expect(() => contarNoches("2026-02-30", "2026-03-02")).toThrow(/inexistente/);
    expect(() => contarNoches("01/10/2026", "2026-10-04")).toThrow(/Formato/);
  });
});
