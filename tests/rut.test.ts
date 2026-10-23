import { describe, expect, it } from "vitest";
import { esRutValido, formatearRut, normalizarRut } from "@/domain";

describe("RUT", () => {
  it("valida dígito verificador", () => {
    expect(esRutValido("12.345.678-5")).toBe(true);
    expect(esRutValido("11.111.111-1")).toBe(true);
    expect(esRutValido("12.345.678-4")).toBe(false);
  });

  it("acepta DV K en minúscula", () => {
    expect(esRutValido("10.000.013-k")).toBe(true);
  });

  it("rechaza basura", () => {
    expect(esRutValido("")).toBe(false);
    expect(esRutValido("abc-1")).toBe(false);
  });

  it("normaliza y formatea", () => {
    expect(normalizarRut("12.345.678-5")).toBe("12345678-5");
    expect(formatearRut("123456785")).toBe("12.345.678-5");
  });
});
