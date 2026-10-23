import { z } from "zod";
import { parsearFecha } from "./fechas";
import { esRutValido, normalizarRut } from "./rut";
import { HOTELES } from "./tipos";

const fecha = z.string().refine((v) => {
  try {
    parsearFecha(v);
    return true;
  } catch {
    return false;
  }
}, "Fecha inválida (YYYY-MM-DD)");

const cantidad = z.number().int().min(0);

/** Validación de entrada de un registro desde formularios o importaciones. */
export const registroSchema = z
  .object({
    empresa: z.string().trim().min(1, "Empresa requerida"),
    solicitante: z.string().trim().min(1, "Solicitante requerido"),
    rut: z.string().refine(esRutValido, "RUT inválido").transform(normalizarRut),
    nombre: z.string().trim().min(1, "Nombre requerido"),
    hotel: z.enum(HOTELES),
    fechaIngreso: fecha,
    fechaSalida: fecha,
    servicios: z.object({ alojamiento: z.boolean(), almuerzos: cantidad, cenas: cantidad }),
  })
  .refine((r) => r.fechaSalida >= r.fechaIngreso, {
    message: "La salida no puede ser anterior al ingreso",
    path: ["fechaSalida"],
  });

export type RegistroInput = z.input<typeof registroSchema>;
