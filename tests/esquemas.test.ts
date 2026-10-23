import { describe, expect, it } from "vitest";
import { registroSchema } from "@/domain";
import { registro } from "./fixtures";

describe("registroSchema", () => {
  const base: Record<string, unknown> = { ...registro() };
  delete base.id;

  it("acepta un registro válido y normaliza el RUT", () => {
    const r = registroSchema.parse({ ...base, rut: "12.345.678-5" });
    expect(r.rut).toBe("12345678-5");
  });

  it("rechaza RUT inválido y salida antes del ingreso", () => {
    expect(registroSchema.safeParse({ ...base, rut: "12.345.678-4" }).success).toBe(false);
    expect(registroSchema.safeParse({ ...base, fechaSalida: "2026-09-30" }).success).toBe(false);
  });
});
