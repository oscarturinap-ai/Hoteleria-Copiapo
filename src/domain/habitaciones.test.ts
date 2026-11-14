import { describe, expect, it } from 'vitest';
import { compararHabitacion, disponibilidad, erroresInventario, expandirRango, ocupacionDia } from './habitaciones';
import { validarRegistro } from './registro';
import { MUR, TAB, hoteles, reg, tramo } from './fixtures';
import type { Habitacion, Registro } from './types';

const hab = (id: string, hotelId: string, numero: string, capacidad = 1, activa = true): Habitacion => ({
  id, hotelId, numero, tipo: capacidad > 1 ? 'TWIN' : 'SINGLE', capacidad, activa, notas: '',
});
const H101 = hab('h101', TAB, '101');
const H102 = hab('h102', TAB, '102', 2); // twin compartida
const H201 = hab('h201', MUR, '201');
const inv = [H101, H102, H201];

const enHab = (habitacionId: string, desde: string, hasta: string, p: Partial<Registro> = {}, rut = '11.111.111-1') =>
  reg({ estado: 'RESERVADO', huesped: { rut, nombre: 'X' }, tramos: [{ ...tramo(TAB, desde, hasta, 80_000), habitacionId }], ...p });

describe('inventario de habitaciones', () => {
  it('bloquea sobreventa en habitación single con detalle de noches y folio', () => {
    const a = enHab('h101', '2026-11-09', '2026-11-12');
    const b = enHab('h101', '2026-11-11', '2026-11-13', {}, '10.000.013-K');
    const e = erroresInventario(b, [a], inv);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/habitación 101 sin cupo \(capacidad 1\) la\(s\) noche\(s\) 11-11-2026 — ocupada por folio\(s\) \d+/);
  });
  it('salida 11:00: quien sale el 12 libera la habitación para quien entra el 12', () => {
    const a = enHab('h101', '2026-11-09', '2026-11-12');
    const b = enHab('h101', '2026-11-12', '2026-11-14', {}, '10.000.013-K');
    expect(erroresInventario(b, [a], inv)).toEqual([]);
  });
  it('twin admite 2 personas y rechaza la tercera', () => {
    const a = enHab('h102', '2026-11-09', '2026-11-12');
    const b = enHab('h102', '2026-11-09', '2026-11-12', {}, '10.000.013-K');
    const c = enHab('h102', '2026-11-10', '2026-11-11', {}, '12.345.678-5');
    expect(erroresInventario(b, [a], inv)).toEqual([]);
    expect(erroresInventario(c, [a, b], inv)[0]).toMatch(/capacidad 2/);
  });
  it('no show y anulado liberan la habitación', () => {
    const ns = enHab('h101', '2026-11-09', '2026-11-12', { estado: 'NO_SHOW', noShow: { modalidad: 'TOTAL', nochesCobradas: 0 } });
    const an = enHab('h101', '2026-11-09', '2026-11-12', { estado: 'ANULADO' });
    const b = enHab('h101', '2026-11-09', '2026-11-12', {}, '10.000.013-K');
    expect(erroresInventario(b, [ns, an], inv)).toEqual([]);
  });
  it('rechaza habitación de otro hotel o inactiva (salvo si ya estaba asignada)', () => {
    expect(erroresInventario(enHab('h201', '2026-11-09', '2026-11-10'), [], inv)[0]).toMatch(/no pertenece al hotel/);
    const inactiva = [{ ...H101, activa: false }];
    const r = enHab('h101', '2026-11-09', '2026-11-10');
    expect(erroresInventario(r, [], inactiva)[0]).toMatch(/inactiva/);
    expect(erroresInventario(r, [], inactiva, r)).toEqual([]);
  });
  it('validarRegistro integra el control de sobreventa', () => {
    const a = enHab('h101', '2026-11-09', '2026-11-12');
    const b = enHab('h101', '2026-11-10', '2026-11-11', {}, '10.000.013-K');
    const ctx = { hoteles, empresaIds: new Set(['e1']), solicitanteIds: new Set(['s1']), otrosRegistros: [a], habitaciones: inv };
    expect(validarRegistro(b, ctx).errores.join()).toMatch(/sin cupo/);
  });
  it('disponibilidad informa camas libres en la noche más cargada', () => {
    const a = enHab('h102', '2026-11-09', '2026-11-11');
    const d = disponibilidad([a], inv, TAB, '2026-11-10', '2026-11-12');
    expect(d.map((x) => [x.habitacion.numero, x.libres, x.folios])).toEqual([['101', 1, []], ['102', 1, [a.folio]]]);
    expect(disponibilidad([a], inv, TAB, '2026-11-10', '2026-11-12', a.id).find((x) => x.habitacion.id === 'h102')!.libres).toBe(2);
  });
  it('ocupación del día por hotel: habitaciones, camas y sin asignar', () => {
    const a = enHab('h102', '2026-11-09', '2026-11-11');
    const b = enHab('h102', '2026-11-10', '2026-11-12', {}, '10.000.013-K');
    const c = reg({ estado: 'IN_HOUSE', tramos: [tramo(TAB, '2026-11-10', '2026-11-11', 1)] });
    const o = ocupacionDia([a, b, c], inv, '2026-11-10').get(TAB)!;
    expect(o).toMatchObject({ habitaciones: 2, habitacionesOcupadas: 1, camas: 3, camasOcupadas: 2, sinAsignar: 1 });
  });
  it('orden natural y expansión de rangos', () => {
    expect(['101', '10', '2'].map((numero) => ({ numero })).sort(compararHabitacion).map((x) => x.numero)).toEqual(['2', '10', '101']);
    expect(expandirRango('101-104')).toEqual(['101', '102', '103', '104']);
    expect(expandirRango('08-10')).toEqual(['08', '09', '10']);
    expect(expandirRango('A1')).toEqual(['A1']);
    expect(expandirRango('110-101')).toBeNull();
  });
});
