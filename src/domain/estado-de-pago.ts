import { calcularLineas, totalLineas } from "./tarifas";
import type { CLP, Concepto, Hotel, LineaCobro, Registro, Tarifario } from "./tipos";

export interface DetalleRegistro {
  registro: Registro;
  lineas: LineaCobro[];
  total: CLP;
}

export interface SubtotalHotel {
  hotel: Hotel;
  porConcepto: Record<Concepto, { cantidad: number; monto: CLP }>;
  detalles: DetalleRegistro[];
  total: CLP;
}

export interface SubtotalEmpresa {
  empresa: string;
  hoteles: SubtotalHotel[];
  total: CLP;
}

export interface EstadoDePago {
  empresas: SubtotalEmpresa[];
  total: CLP;
}

const conceptoVacio = () => ({
  ALOJAMIENTO: { cantidad: 0, monto: 0 },
  ALMUERZO: { cantidad: 0, monto: 0 },
  CENA: { cantidad: 0, monto: 0 },
});

/**
 * Agrupa registros por empresa y hotel. El total general se suma desde
 * los subtotales para que el documento cuadre línea por línea.
 */
export function generarEstadoDePago(registros: Registro[], tarifario: Tarifario): EstadoDePago {
  const porEmpresa = new Map<string, Map<Hotel, SubtotalHotel>>();

  for (const registro of registros) {
    const lineas = calcularLineas(registro, tarifario);
    const detalle: DetalleRegistro = { registro, lineas, total: totalLineas(lineas) };

    const hoteles = porEmpresa.get(registro.empresa) ?? new Map<Hotel, SubtotalHotel>();
    porEmpresa.set(registro.empresa, hoteles);

    const sub = hoteles.get(registro.hotel) ?? {
      hotel: registro.hotel,
      porConcepto: conceptoVacio(),
      detalles: [],
      total: 0,
    };
    hoteles.set(registro.hotel, sub);

    sub.detalles.push(detalle);
    for (const l of lineas) {
      sub.porConcepto[l.concepto].cantidad += l.cantidad;
      sub.porConcepto[l.concepto].monto += l.subtotal;
    }
    sub.total += detalle.total;
  }

  const empresas = [...porEmpresa.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "es"))
    .map(([empresa, hoteles]) => {
      const lista = [...hoteles.values()].sort((a, b) => a.hotel.localeCompare(b.hotel));
      return { empresa, hoteles: lista, total: lista.reduce((acc, h) => acc + h.total, 0) };
    });

  return { empresas, total: empresas.reduce((acc, e) => acc + e.total, 0) };
}
