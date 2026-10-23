import { contarNoches } from "./fechas";
import type { Concepto, LineaCobro, Registro, Tarifario } from "./tipos";

function tarifaDe(tarifario: Tarifario, registro: Registro, concepto: Concepto) {
  const tarifa = tarifario[registro.hotel]?.[concepto];
  if (!Number.isInteger(tarifa) || tarifa < 0) {
    throw new Error(`Falta tarifa válida para ${registro.hotel} / ${concepto}.`);
  }
  return tarifa;
}

function validarCantidad(cantidad: number, campo: string) {
  if (!Number.isInteger(cantidad) || cantidad < 0) {
    throw new Error(`Cantidad inválida en ${campo}: ${cantidad}.`);
  }
}

/** Líneas de cobro de un registro. Omite conceptos con cantidad 0. */
export function calcularLineas(registro: Registro, tarifario: Tarifario): LineaCobro[] {
  const { servicios } = registro;
  validarCantidad(servicios.almuerzos, "almuerzos");
  validarCantidad(servicios.cenas, "cenas");

  const cantidades: Record<Concepto, number> = {
    ALOJAMIENTO: servicios.alojamiento
      ? contarNoches(registro.fechaIngreso, registro.fechaSalida)
      : 0,
    ALMUERZO: servicios.almuerzos,
    CENA: servicios.cenas,
  };

  return (Object.keys(cantidades) as Concepto[])
    .filter((concepto) => cantidades[concepto] > 0)
    .map((concepto) => {
      const tarifa = tarifaDe(tarifario, registro, concepto);
      const cantidad = cantidades[concepto];
      return { concepto, cantidad, tarifa, subtotal: cantidad * tarifa };
    });
}

export function totalLineas(lineas: LineaCobro[]): number {
  return lineas.reduce((acc, l) => acc + l.subtotal, 0);
}
