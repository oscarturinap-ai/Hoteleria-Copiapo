import { describe, expect, it } from 'vitest';
import { agregarCargo, anular, checkIn, checkOut, describirCambios, marcarNoShow, panelDia, perfilHuesped, tramoVigente } from './operaciones';
import { ingreso, resumenRegistro, salida } from './registro';
import { MUR, TAB, adic, reg, tramo } from './fixtures';
import type { Registro } from './types';

const valor = <T>(r: { ok: true; valor: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.valor;
};
const reservado = (p: Partial<Registro> = {}) => reg({ estado: 'RESERVADO', ...p });

describe('check-in', () => {
  it('en la fecha programada pasa a in-house sin tocar fechas', () => {
    const r = valor(checkIn(reservado(), '2026-11-09', { ajustarIngreso: false }));
    expect(r.estado).toBe('IN_HOUSE');
    expect(ingreso(r)).toBe('2026-11-09');
  });
  it('llegada tardía con ajuste libera las noches no usadas', () => {
    const r = valor(checkIn(reservado(), '2026-11-10', { ajustarIngreso: true }));
    expect(ingreso(r)).toBe('2026-11-10');
    expect(resumenRegistro(r).noches).toBe(2);
  });
  it('llegada tardía sin ajuste mantiene el cobro desde la reserva', () => {
    const r = valor(checkIn(reservado(), '2026-11-10', { ajustarIngreso: false }));
    expect(resumenRegistro(r).noches).toBe(3);
  });
  it('llegada tardía que cae en el segundo tramo descarta el primero', () => {
    const base = reservado({ tramos: [tramo(TAB, '2026-11-09', '2026-11-10', 80_000), tramo(MUR, '2026-11-10', '2026-11-13', 65_000)] });
    const r = valor(checkIn(base, '2026-11-11', { ajustarIngreso: true }));
    expect(r.tramos).toHaveLength(1);
    expect(r.tramos[0]).toMatchObject({ hotelId: MUR, desde: '2026-11-11', hasta: '2026-11-13' });
  });
  it('asigna habitación al llegar y la exige si el hotel tiene inventario', () => {
    expect(checkIn(reservado(), '2026-11-09', { ajustarIngreso: false, requiereHabitacion: true }).ok).toBe(false);
    const r = valor(checkIn(reservado(), '2026-11-09', { ajustarIngreso: false, requiereHabitacion: true, habitacionId: 'h101' }));
    expect(r.tramos[0]!.habitacionId).toBe('h101');
  });
  it('rechaza check-in anticipado, en la salida o de un estado no reservado', () => {
    expect(checkIn(reservado(), '2026-11-08', { ajustarIngreso: false }).ok).toBe(false);
    expect(checkIn(reservado(), '2026-11-12', { ajustarIngreso: true }).ok).toBe(false);
    expect(checkIn(reg({ estado: 'IN_HOUSE' }), '2026-11-09', { ajustarIngreso: false }).ok).toBe(false);
  });
});

describe('check-out', () => {
  const inHouse = () => reg({ estado: 'IN_HOUSE' });
  it('en la fecha programada', () => {
    const r = valor(checkOut(inHouse(), '2026-11-12', { ajustarSalida: false }));
    expect(r.estado).toBe('CHECK_OUT');
    expect(salida(r)).toBe('2026-11-12');
  });
  it('salida anticipada con ajuste reduce noches', () => {
    const r = valor(checkOut(inHouse(), '2026-11-11', { ajustarSalida: true }));
    expect(resumenRegistro(r).noches).toBe(2);
  });
  it('extensión con ajuste mantiene la última tarifa', () => {
    const r = valor(checkOut(inHouse(), '2026-11-14', { ajustarSalida: true }));
    expect(resumenRegistro(r)).toMatchObject({ noches: 5, alojamiento: 400_000 });
  });
  it('salida anticipada que elimina un tramo completo de derivación', () => {
    const base = reg({ estado: 'IN_HOUSE', tramos: [tramo(TAB, '2026-11-09', '2026-11-11', 80_000), tramo(MUR, '2026-11-11', '2026-11-13', 65_000)] });
    const r = valor(checkOut(base, '2026-11-11', { ajustarSalida: true }));
    expect(r.tramos.map((t) => t.hotelId)).toEqual([TAB]);
    expect(resumenRegistro(r).alojamiento).toBe(160_000);
  });
  it('bloquea si quedan cargos posteriores a la nueva salida', () => {
    const base = reg({ estado: 'IN_HOUSE', adicionales: [adic({ fecha: '2026-11-12', hotelId: TAB })] });
    expect(checkOut(base, '2026-11-11', { ajustarSalida: true }).ok).toBe(false);
  });
  it('rechaza salida en o antes del ingreso', () => {
    expect(checkOut(inHouse(), '2026-11-09', { ajustarSalida: true }).ok).toBe(false);
  });
});

describe('no show, anulación y cargos', () => {
  it('no show sólo desde reservado', () => {
    expect(valor(marcarNoShow(reservado(), { modalidad: 'TOTAL', nochesCobradas: 0 })).estado).toBe('NO_SHOW');
    expect(marcarNoShow(reg({ estado: 'IN_HOUSE' }), { modalidad: 'TOTAL', nochesCobradas: 0 }).ok).toBe(false);
  });
  it('anular exige motivo y no aplica a check-out', () => {
    expect(anular(reservado(), ' ').ok).toBe(false);
    expect(anular(reg({ estado: 'CHECK_OUT' }), 'x').ok).toBe(false);
    expect(valor(anular(reservado(), 'duplicado')).estado).toBe('ANULADO');
  });
  it('agregar cargo suma al folio', () => {
    const r = valor(agregarCargo(reg({ estado: 'IN_HOUSE' }), adic({ fecha: '2026-11-10', hotelId: TAB, cantidad: 3, precioUnitario: 1_500, concepto: 'AGUA' })));
    expect(resumenRegistro(r).adicionales).toBe(4_500);
  });
  it('tramo vigente incluye el día de salida en el último tramo', () => {
    const r = reg({ tramos: [tramo(TAB, '2026-11-09', '2026-11-10', 1), tramo(MUR, '2026-11-10', '2026-11-12', 1)] });
    expect(tramoVigente(r, '2026-11-09')?.hotelId).toBe(TAB);
    expect(tramoVigente(r, '2026-11-12')?.hotelId).toBe(MUR);
    expect(tramoVigente(r, '2026-11-13')).toBeNull();
  });
});

describe('panel del día', () => {
  it('clasifica llegadas, salidas, in-house, pendientes y ocupación', () => {
    const d = '2026-11-10';
    const llega = reservado({ tramos: [tramo(TAB, d, '2026-11-12', 1)] });
    const atrasado = reservado({ tramos: [tramo(TAB, '2026-11-08', '2026-11-12', 1)] });
    const sale = reg({ estado: 'IN_HOUSE', tramos: [tramo(MUR, '2026-11-07', d, 1)] });
    const vencido = reg({ estado: 'IN_HOUSE', tramos: [tramo(MUR, '2026-11-05', '2026-11-08', 1)] });
    const aloja = reg({ estado: 'IN_HOUSE', tramos: [tramo(MUR, '2026-11-09', '2026-11-11', 1)] });
    const anulado = reg({ estado: 'ANULADO', tramos: [tramo(TAB, d, '2026-11-11', 1)] });
    const p = panelDia([llega, atrasado, sale, vencido, aloja, anulado], d);
    expect(p.llegadas).toEqual([llega]);
    expect(p.llegadasPendientes).toEqual([atrasado]);
    expect(p.salidas).toEqual([sale]);
    expect(p.salidasVencidas).toEqual([vencido]);
    expect(p.inHouse).toHaveLength(3);
    expect(p.ocupacion.get(TAB)).toBe(2); // llega + atrasado (reservado), no el anulado
    expect(p.ocupacion.get(MUR)).toBe(1); // sólo "aloja"; "sale" no pernocta el día de salida
  });
});

describe('perfil de huésped e historial', () => {
  it('recupera estadías previas por RUT normalizado', () => {
    const a = reg({ huesped: { rut: '11111111-1', nombre: 'Juan P.' }, empresaId: 'e2' });
    const p = perfilHuesped([a, reg({ estado: 'ANULADO' })], '11.111.111-1');
    expect(p).toMatchObject({ estadias: 1, ultimaEmpresaId: 'e2', nombre: 'Juan P.' });
    expect(perfilHuesped([a], '11.111.111-1', a.id)).toBeNull();
  });
  it('describe cambios relevantes', () => {
    const a = reg();
    const b = { ...a, estado: 'IN_HOUSE' as const, tramos: [{ ...a.tramos[0]!, hasta: '2026-11-13', habitacionId: 'hab-204' }], adicionales: [adic({ fecha: '2026-11-10', hotelId: TAB })] };
    const n = { hotel: () => 'Tab', empresa: () => 'E', solicitante: () => 'S', habitacion: (id: string) => id.replace('hab-', '') };
    const d = describirCambios(a, b, n);
    expect(d).toMatch(/estado Check-out → In-house/);
    expect(d).toMatch(/OUT 12-11-2026 → 13-11-2026/);
    expect(d).toMatch(/hab\. 204/);
    expect(d).toMatch(/1 cargo\(s\) agregado/);
    expect(describirCambios(a, a, n)).toBe('');
  });
});
