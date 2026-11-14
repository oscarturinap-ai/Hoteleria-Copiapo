import { describe, expect, it } from 'vitest';
import {
  calcularEDP,
  calcularDV,
  diffDias,
  edpACSV,
  formatearRut,
  noches,
  nochesCobrables,
  normalizarRut,
  resumenRegistro,
  solapamientosTarifa,
  sumarDias,
  tarifaVigente,
  ultimoDiaMes,
  validarRegistro,
  validarRut,
} from './index';
import type { Registro, Tarifa } from './types';
import { ALTO, MUR, TAB, adic, hoteles, reg, tramo } from './fixtures';

const ctx = (otros: Registro[] = []) => ({
  hoteles,
  empresaIds: new Set(['e1', 'e2']),
  solicitanteIds: new Set(['s1']),
  otrosRegistros: otros,
});
const NOV = { desde: '2026-11-01', hasta: '2026-11-30', hotelId: null, empresaId: null };

// ───────── Fechas ─────────
describe('fechas', () => {
  it('regla de negocio: IN 09-nov / OUT 12-nov = 3 noches (9, 10, 11)', () => {
    expect(diffDias('2026-11-09', '2026-11-12')).toBe(3);
    expect(noches('2026-11-09', '2026-11-12')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11']);
  });
  it('no se desfasa en cambios de horario de verano de Chile', () => {
    expect(diffDias('2026-04-04', '2026-04-06')).toBe(2);
    expect(diffDias('2026-09-05', '2026-09-07')).toBe(2);
    expect(sumarDias('2026-04-04', 1)).toBe('2026-04-05');
  });
  it('cruza meses y años bisiestos', () => {
    expect(diffDias('2028-02-27', '2028-03-01')).toBe(3);
    expect(ultimoDiaMes('2028-02-10')).toBe('2028-02-29');
    expect(diffDias('2026-12-30', '2027-01-02')).toBe(3);
  });
});

// ───────── RUT ─────────
describe('rut', () => {
  it('valida módulo 11 incluyendo K y 0', () => {
    expect(validarRut('11.111.111-1')).toBe(true);
    expect(validarRut('11111111-2')).toBe(false);
    expect(calcularDV('10000013')).toBe('K');
    expect(validarRut('10.000.013-k')).toBe(true);
    expect(validarRut('abc')).toBe(false);
  });
  it('normaliza y formatea', () => {
    expect(normalizarRut('10.000.013-k')).toBe('10000013-K');
    expect(formatearRut('10000013K')).toBe('10.000.013-K');
  });
});

// ───────── Tarifas ─────────
describe('tarifas', () => {
  const tarifas: Tarifa[] = [
    { id: '1', hotelId: TAB, concepto: 'ALOJAMIENTO', monto: 80_000, vigenteDesde: '2026-01-01', vigenteHasta: '2026-11-14' },
    { id: '2', hotelId: TAB, concepto: 'ALOJAMIENTO', monto: 85_000, vigenteDesde: '2026-11-15', vigenteHasta: null },
  ];
  it('elige la tarifa vigente a la fecha', () => {
    expect(tarifaVigente(tarifas, TAB, 'ALOJAMIENTO', '2026-11-14')?.monto).toBe(80_000);
    expect(tarifaVigente(tarifas, TAB, 'ALOJAMIENTO', '2026-11-15')?.monto).toBe(85_000);
    expect(tarifaVigente(tarifas, ALTO, 'ALOJAMIENTO', '2026-11-15')).toBeNull();
  });
  it('detecta vigencias superpuestas', () => {
    expect(solapamientosTarifa(tarifas)).toHaveLength(0);
    const mal = [...tarifas, { ...tarifas[1]!, id: '3', vigenteDesde: '2026-11-10' }];
    expect(solapamientosTarifa(mal).length).toBeGreaterThan(0);
  });
});

// ───────── Noches cobrables / no show ─────────
describe('cobro de noches', () => {
  it('check-out normal: todas las noches', () => {
    const r = reg();
    expect(resumenRegistro(r)).toEqual({ noches: 3, alojamiento: 240_000, adicionales: 0, total: 240_000 });
  });
  it('no show total cobra todo, parcial las primeras N, sin cargo nada', () => {
    expect(nochesCobrables(reg({ estado: 'NO_SHOW', noShow: { modalidad: 'TOTAL', nochesCobradas: 0 } }))).toHaveLength(3);
    const p = nochesCobrables(reg({ estado: 'NO_SHOW', noShow: { modalidad: 'PARCIAL', nochesCobradas: 1 } }));
    expect(p.map((n) => n.fecha)).toEqual(['2026-11-09']);
    expect(nochesCobrables(reg({ estado: 'NO_SHOW', noShow: { modalidad: 'SIN_CARGO', nochesCobradas: 0 } }))).toHaveLength(0);
  });
  it('anulado no cobra nada, ni adicionales', () => {
    const r = reg({ estado: 'ANULADO', adicionales: [adic({ fecha: '2026-11-10', hotelId: TAB })] });
    expect(resumenRegistro(r).total).toBe(0);
  });
  it('derivación con cambio de tarifa: tramos con su propia tarifa', () => {
    const r = reg({
      tramos: [tramo(TAB, '2026-11-09', '2026-11-11', 80_000), tramo(ALTO, '2026-11-11', '2026-11-14', 70_000)],
      adicionales: [adic({ fecha: '2026-11-12', hotelId: ALTO, cantidad: 2, precioUnitario: 9_500 })],
    });
    expect(resumenRegistro(r)).toEqual({ noches: 5, alojamiento: 370_000, adicionales: 19_000, total: 389_000 });
  });
});

// ───────── Validación ─────────
describe('validación', () => {
  it('registro correcto no tiene errores', () => {
    expect(validarRegistro(reg(), ctx()).errores).toEqual([]);
  });
  it('rechaza tramos no contiguos, 0 noches y tarifa no entera', () => {
    const r = reg({
      tramos: [tramo(TAB, '2026-11-09', '2026-11-11', 80_000), tramo(ALTO, '2026-11-12', '2026-11-12', 70_000.5)],
    });
    const e = validarRegistro(r, ctx()).errores.join(' | ');
    expect(e).toMatch(/contiguos/);
    expect(e).toMatch(/mínimo 1 noche/);
    expect(e).toMatch(/entero > 0/);
  });
  it('rechaza adicional fuera de la estadía y acepta el día de salida', () => {
    const fuera = reg({ adicionales: [adic({ fecha: '2026-11-13', hotelId: TAB })] });
    expect(validarRegistro(fuera, ctx()).errores.join()).toMatch(/fuera de la estadía/);
    const salida = reg({ adicionales: [adic({ fecha: '2026-11-12', hotelId: TAB })] });
    expect(validarRegistro(salida, ctx()).errores).toEqual([]);
  });
  it('rechaza doble asignación del mismo RUT con fechas superpuestas', () => {
    const a = reg();
    const b = reg({ tramos: [tramo(MUR, '2026-11-11', '2026-11-13', 60_000)] });
    expect(validarRegistro(b, ctx([a])).errores.join()).toMatch(/Superposición con folio/);
    // Salida 12 e ingreso 12 no se superponen.
    const c = reg({ tramos: [tramo(MUR, '2026-11-12', '2026-11-13', 60_000)] });
    expect(validarRegistro(c, ctx([a])).errores).toEqual([]);
  });
  it('no show parcial exige 1 ≤ N < total', () => {
    const r = reg({ estado: 'NO_SHOW', noShow: { modalidad: 'PARCIAL', nochesCobradas: 3 } });
    expect(validarRegistro(r, ctx()).errores.join()).toMatch(/entre 1 y 2/);
  });
});

// ───────── Estado de pago ─────────
describe('estado de pago', () => {
  it('fórmula: Σ noches × tarifa + adicionales = neto, con pasajeros distintos', () => {
    const r1 = reg({ adicionales: [adic({ fecha: '2026-11-10', hotelId: TAB, concepto: 'CENA', precioUnitario: 15_000 })] });
    const r2 = reg({
      huesped: { rut: '10.000.013-K', nombre: 'Ana Soto' },
      empresaId: 'e2',
      tramos: [tramo(TAB, '2026-11-20', '2026-11-22', 80_000), tramo(MUR, '2026-11-22', '2026-11-25', 65_000)],
    });
    const res = calcularEDP([r1, r2], NOV);
    expect(res.totales).toEqual({ pasajeros: 2, noches: 8, alojamiento: 595_000, adicionales: 15_000, total: 610_000 });
    expect(res.lineas).toHaveLength(3); // r2 derivado = 2 líneas (una por hotel)
    expect(res.lineas.map((l) => l.hotelId)).toEqual([TAB, TAB, MUR]); // orden cronológico de tramos
    expect(res.porHotel.find((h) => h.clave === TAB)).toMatchObject({ pasajeros: 2, noches: 5, total: 415_000 });
    expect(res.porHotel.find((h) => h.clave === MUR)).toMatchObject({ pasajeros: 1, noches: 3, total: 195_000 });
    expect(res.porEmpresa.find((e) => e.clave === 'e2')?.total).toBe(355_000);
    expect(res.adicionalesPorConcepto).toEqual({ CENA: 15_000 });
  });
  it('corta noches por período cuando la estadía cruza meses', () => {
    const r = reg({ tramos: [tramo(TAB, '2026-10-30', '2026-11-02', 80_000)] });
    expect(calcularEDP([r], { ...NOV, desde: '2026-10-01', hasta: '2026-10-31' }).totales.noches).toBe(2);
    const nov = calcularEDP([r], NOV);
    expect(nov.totales.noches).toBe(1);
    expect(nov.lineas[0]).toMatchObject({ primeraNoche: '2026-11-01', ultimaNoche: '2026-11-01', ingreso: '2026-10-30', salida: '2026-11-02' });
  });
  it('agrupa cambios de tarifa en el mismo hotel dentro de una línea', () => {
    const r = reg({ tramos: [tramo(TAB, '2026-11-09', '2026-11-11', 80_000), tramo(TAB, '2026-11-11', '2026-11-12', 85_000)] });
    const res = calcularEDP([r], NOV);
    expect(res.lineas).toHaveLength(1);
    expect(res.lineas[0]!.detalleTarifas).toEqual([
      { tarifa: 80_000, noches: 2, subtotal: 160_000 },
      { tarifa: 85_000, noches: 1, subtotal: 85_000 },
    ]);
  });
  it('filtra por hotel y empresa; excluye anulados; advierte registros no cerrados', () => {
    const r1 = reg({ estado: 'IN_HOUSE' });
    const r2 = reg({ huesped: { rut: '10.000.013-K', nombre: 'Ana' }, tramos: [tramo(MUR, '2026-11-05', '2026-11-06', 60_000)] });
    const r3 = reg({ huesped: { rut: '12.345.678-5', nombre: 'X' }, estado: 'ANULADO' });
    expect(calcularEDP([r1, r2, r3], { ...NOV, hotelId: MUR }).totales.total).toBe(60_000);
    expect(calcularEDP([r1, r2, r3], { ...NOV, empresaId: 'e2' }).lineas).toHaveLength(0);
    const all = calcularEDP([r1, r2, r3], NOV);
    expect(all.totales.pasajeros).toBe(2);
    expect(all.advertencias).toHaveLength(1);
  });
  it('no show parcial cobrado en EDP', () => {
    const r = reg({ estado: 'NO_SHOW', noShow: { modalidad: 'PARCIAL', nochesCobradas: 1 } });
    const res = calcularEDP([r], NOV);
    expect(res.totales).toMatchObject({ noches: 1, total: 80_000 });
    expect(res.lineas[0]!.noShow?.modalidad).toBe('PARCIAL');
  });
  it('exporta CSV con totales que cuadran', () => {
    const res = calcularEDP([reg()], NOV);
    const csv = edpACSV(res, { hotel: () => 'Tabancura', empresa: () => 'Emp', solicitante: () => 'Sol' });
    const filas = csv.slice(1).split('\r\n');
    expect(filas).toHaveLength(3);
    expect(filas[1]).toContain('11.111.111-1');
    expect(filas[2]!.endsWith(';240000;0;240000')).toBe(true);
  });
  it('rechaza período invertido', () => {
    expect(() => calcularEDP([], { ...NOV, desde: '2026-12-01' })).toThrow();
  });
});
