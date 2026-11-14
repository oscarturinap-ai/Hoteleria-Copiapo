import { enRango } from './fechas';
import { multiplicar, sumar } from './dinero';
import { normalizarRut } from './rut';
import { adicionalesCobrables, esDerivado, ingreso, nochesCobrables, salida } from './registro';
import type {
  Advertencia,
  Concepto,
  DetalleTarifa,
  FiltroEDP,
  Id,
  LineaEDP,
  Registro,
  ResultadoEDP,
  Subtotal,
} from './types';

/**
 * Estado de Pago.
 *
 *   Monto neto = Σ (noches × tarifa del hotel) + Σ (cantidad × precio adicional)
 *
 * Imputación al período:
 *  - Una noche pertenece al período si su fecha de inicio ∈ [desde, hasta].
 *    (Estadía 30-oct → 02-nov: noches 30 y 31 van a octubre, la del 1 a noviembre.)
 *  - Un adicional pertenece al período si su fecha ∈ [desde, hasta].
 *
 * Granularidad: una línea por (registro × hotel). Un registro derivado entre hoteles
 * genera una línea por hotel; los cambios de tarifa quedan en `detalleTarifas`.
 */
export function calcularEDP(registros: readonly Registro[], filtro: FiltroEDP): ResultadoEDP {
  if (filtro.hasta < filtro.desde) throw new Error('Período inválido: "hasta" es anterior a "desde".');

  const lineas: LineaEDP[] = [];
  const advertencias: Advertencia[] = [];

  for (const r of registros) {
    if (r.estado === 'ANULADO' || r.tramos.length === 0) continue;
    if (filtro.empresaId && r.empresaId !== filtro.empresaId) continue;

    const nochesP = nochesCobrables(r).filter(
      (n) => enRango(n.fecha, filtro.desde, filtro.hasta) && (!filtro.hotelId || n.hotelId === filtro.hotelId),
    );
    const adicP = adicionalesCobrables(r).filter(
      (a) => enRango(a.fecha, filtro.desde, filtro.hasta) && (!filtro.hotelId || a.hotelId === filtro.hotelId),
    );
    if (nochesP.length === 0 && adicP.length === 0) continue;

    if (r.estado === 'RESERVADO' || r.estado === 'IN_HOUSE') {
      advertencias.push({
        registroId: r.id,
        folio: r.folio,
        mensaje: `Estado "${r.estado === 'RESERVADO' ? 'Reservado' : 'In-house'}": registro no cerrado, montos sujetos a cambio.`,
      });
    }

    const hoteles = new Set<Id>([...nochesP.map((n) => n.hotelId), ...adicP.map((a) => a.hotelId)]);
    for (const hotelId of hoteles) {
      const nh = nochesP.filter((n) => n.hotelId === hotelId);
      const ah = adicP.filter((a) => a.hotelId === hotelId);

      const porTarifa = new Map<number, number>();
      for (const n of nh) porTarifa.set(n.tarifa, (porTarifa.get(n.tarifa) ?? 0) + 1);
      const detalleTarifas: DetalleTarifa[] = [...porTarifa.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([tarifa, noches]) => ({ tarifa, noches, subtotal: multiplicar(tarifa, noches) }));

      const adicionalesPorConcepto: Partial<Record<Concepto, number>> = {};
      for (const a of ah) {
        adicionalesPorConcepto[a.concepto] = (adicionalesPorConcepto[a.concepto] ?? 0) + multiplicar(a.precioUnitario, a.cantidad);
      }

      const alojamiento = sumar(detalleTarifas.map((d) => d.subtotal));
      const adicionales = sumar(Object.values(adicionalesPorConcepto));
      const fechas = nh.map((n) => n.fecha).sort();

      lineas.push({
        registroId: r.id,
        folio: r.folio,
        rut: normalizarRut(r.huesped.rut),
        nombre: r.huesped.nombre.trim(),
        empresaId: r.empresaId,
        solicitanteId: r.solicitanteId,
        fechaSolicitud: r.fechaSolicitud,
        hotelId,
        ingreso: ingreso(r),
        salida: salida(r),
        primeraNoche: fechas[0] ?? null,
        ultimaNoche: fechas[fechas.length - 1] ?? null,
        estado: r.estado,
        noShow: r.estado === 'NO_SHOW' ? r.noShow : null,
        derivado: esDerivado(r),
        noches: nh.length,
        detalleTarifas,
        alojamiento,
        adicionalesPorConcepto,
        adicionales,
        total: alojamiento + adicionales,
      });
    }
  }

  // Orden: cronológico por IN, luego folio, luego tramo (primera noche; líneas sólo-adicionales al final).
  lineas.sort(
    (a, b) =>
      a.ingreso.localeCompare(b.ingreso) ||
      a.folio - b.folio ||
      (a.primeraNoche ?? '9999').localeCompare(b.primeraNoche ?? '9999') ||
      a.hotelId.localeCompare(b.hotelId),
  );

  const adicionalesPorConcepto: Partial<Record<Concepto, number>> = {};
  for (const l of lineas) {
    for (const [c, v] of Object.entries(l.adicionalesPorConcepto) as [Concepto, number][]) {
      adicionalesPorConcepto[c] = (adicionalesPorConcepto[c] ?? 0) + v;
    }
  }

  const resultado: ResultadoEDP = {
    filtro: { ...filtro },
    lineas,
    totales: (({ clave: _c, ...t }) => t)(agregar('total', lineas)),
    porHotel: agrupar(lineas, (l) => l.hotelId),
    porEmpresa: agrupar(lineas, (l) => l.empresaId),
    adicionalesPorConcepto,
    advertencias,
  };
  verificarCuadratura(resultado);
  return resultado;
}

function agregar(clave: Id, lineas: readonly LineaEDP[]): Subtotal {
  return {
    clave,
    // Pasajeros = personas distintas (RUT), no líneas: un derivado cuenta una vez.
    pasajeros: new Set(lineas.map((l) => l.rut)).size,
    noches: lineas.reduce((s, l) => s + l.noches, 0),
    alojamiento: sumar(lineas.map((l) => l.alojamiento)),
    adicionales: sumar(lineas.map((l) => l.adicionales)),
    total: sumar(lineas.map((l) => l.total)),
  };
}

function agrupar(lineas: readonly LineaEDP[], key: (l: LineaEDP) => Id): Subtotal[] {
  const grupos = new Map<Id, LineaEDP[]>();
  for (const l of lineas) {
    const k = key(l);
    const arr = grupos.get(k);
    if (arr) arr.push(l);
    else grupos.set(k, [l]);
  }
  return [...grupos.entries()].map(([k, ls]) => agregar(k, ls)).sort((a, b) => b.total - a.total);
}

/**
 * Invariantes contables. Si alguna falla es un bug de cálculo: se lanza en vez de emitir
 * un EDP descuadrado.
 */
export function verificarCuadratura(r: ResultadoEDP): void {
  const t = r.totales;
  const fallas: string[] = [];
  if (t.alojamiento + t.adicionales !== t.total) fallas.push('alojamiento + adicionales ≠ total');
  for (const l of r.lineas) {
    if (l.alojamiento + l.adicionales !== l.total) fallas.push(`línea folio ${l.folio}: componentes ≠ total`);
    if (l.detalleTarifas.reduce((s, d) => s + d.noches, 0) !== l.noches) fallas.push(`línea folio ${l.folio}: noches ≠ detalle`);
  }
  for (const [nombre, grupos] of [['hotel', r.porHotel], ['empresa', r.porEmpresa]] as const) {
    const s = grupos.reduce((acc, g) => acc + g.total, 0);
    const n = grupos.reduce((acc, g) => acc + g.noches, 0);
    if (s !== t.total) fallas.push(`Σ por ${nombre} (${s}) ≠ total (${t.total})`);
    if (n !== t.noches) fallas.push(`Σ noches por ${nombre} ≠ total noches`);
  }
  const sc = Object.values(r.adicionalesPorConcepto).reduce((a, b) => a + (b ?? 0), 0);
  if (sc !== t.adicionales) fallas.push('Σ adicionales por concepto ≠ total adicionales');
  if (fallas.length) throw new Error(`Descuadre en EDP: ${fallas.join('; ')}`);
}
