import { CONCEPTOS_ADICIONALES, ETIQUETA_CONCEPTO, ETIQUETA_ESTADO } from './types';
import type { Id, LineaEDP, ResultadoEDP } from './types';
import { formatearRut } from './rut';

export interface Nombres {
  hotel: (id: Id) => string;
  empresa: (id: Id) => string;
  solicitante: (id: Id) => string;
}

export function etiquetaEstado(l: Pick<LineaEDP, 'estado' | 'noShow'>): string {
  if (l.estado !== 'NO_SHOW' || !l.noShow) return ETIQUETA_ESTADO[l.estado];
  const m = l.noShow.modalidad;
  return m === 'TOTAL' ? 'No show (cobro total)' : m === 'PARCIAL' ? `No show (cobro parcial ${l.noShow.nochesCobradas}n)` : 'No show (sin cargo)';
}

function celda(v: string | number): string {
  const s = String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV con separador ';' y BOM UTF-8 (Excel en configuración regional es-CL lo abre directo).
 * Montos como enteros sin formato para que sean sumables en planilla.
 */
export function edpACSV(r: ResultadoEDP, n: Nombres): string {
  const conceptos = CONCEPTOS_ADICIONALES.filter((c) => r.adicionalesPorConcepto[c]);
  const cab = [
    'Folio', 'RUT', 'Nombre', 'Empresa', 'Solicitante', 'Fecha solicitud', 'Hotel',
    'IN', 'OUT', 'Primera noche', 'Última noche', 'Estado', 'Derivado', 'Noches', 'Detalle tarifa',
    'Alojamiento', ...conceptos.map((c) => ETIQUETA_CONCEPTO[c]), 'Total adicionales', 'Total neto',
  ];
  const filas = r.lineas.map((l) => [
    l.folio, formatearRut(l.rut), l.nombre, n.empresa(l.empresaId), n.solicitante(l.solicitanteId), l.fechaSolicitud,
    n.hotel(l.hotelId), l.ingreso, l.salida, l.primeraNoche ?? '', l.ultimaNoche ?? '', etiquetaEstado(l),
    l.derivado ? 'Sí' : 'No', l.noches, l.detalleTarifas.map((d) => `${d.noches}x${d.tarifa}`).join(' + '),
    l.alojamiento, ...conceptos.map((c) => l.adicionalesPorConcepto[c] ?? 0), l.adicionales, l.total,
  ]);
  const t = r.totales;
  const pie = [
    'TOTAL', `${t.pasajeros} pasajeros`, '', '', '', '', '', '', '', '', '', '', '', t.noches, '',
    t.alojamiento, ...conceptos.map((c) => r.adicionalesPorConcepto[c] ?? 0), t.adicionales, t.total,
  ];
  return '﻿' + [cab, ...filas, pie].map((f) => f.map(celda).join(';')).join('\r\n');
}
