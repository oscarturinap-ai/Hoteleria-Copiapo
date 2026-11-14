import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseRepository } from './supabaseRepo';
import { mapeoEmpresa, mapeoEstadoPago, mapeoHabitacion, mapeoTarifa, mensajeError } from './supabaseMapeo';
import { HOTEL_ID } from './semilla';
import type { EstadoPago, Registro } from '../domain/types';

type Fila = Record<string, unknown> & { id: string };
interface Llamada { tipo: string; tabla?: string; args?: unknown }

/** Doble de prueba con la forma del query builder de supabase-js (subconjunto usado). */
function clienteFalso(opciones: { error?: { message: string; code?: string } } = {}) {
  const tablas = new Map<string, Fila[]>();
  const llamadas: Llamada[] = [];
  const t = (n: string) => tablas.get(n) ?? (tablas.set(n, []), tablas.get(n)!);
  const resp = <T>(data: T) => Promise.resolve(opciones.error ? { data: null, error: opciones.error } : { data, error: null });
  const cliente = {
    from(tabla: string) {
      return {
        select: (cols: string) => ({
          order: () => ({
            range: (a: number, b: number) => {
              llamadas.push({ tipo: 'select', tabla, args: [cols, a, b] });
              return resp(t(tabla).slice(a, b + 1));
            },
          }),
        }),
        upsert: (fila: Fila, op?: { ignoreDuplicates?: boolean }) => {
          llamadas.push({ tipo: 'upsert', tabla, args: fila });
          const arr = t(tabla);
          const i = arr.findIndex((x) => x.id === fila.id);
          if (i >= 0 && !op?.ignoreDuplicates) arr[i] = fila;
          else if (i < 0) arr.push(fila);
          const p = resp(null);
          return Object.assign(p, { select: () => ({ single: () => resp(fila) }) });
        },
        delete: () => ({
          eq: (_c: string, id: string) => {
            llamadas.push({ tipo: 'delete', tabla, args: id });
            tablas.set(tabla, t(tabla).filter((x) => x.id !== id));
            return resp(null);
          },
        }),
      };
    },
    rpc(nombre: string, args?: Record<string, unknown>) {
      llamadas.push({ tipo: 'rpc', args: { nombre, ...args } });
      if (nombre === 'guardar_registro') return resp(args!.p_doc);
      if (nombre === 'siguiente_correlativo') return resp(42);
      return resp(null);
    },
  };
  return { cliente: cliente as unknown as SupabaseClient, tablas, llamadas };
}

describe('mapeo filas ↔ dominio', () => {
  it('empresa sin RUT se guarda como NULL (columna UNIQUE) y vuelve como ""', () => {
    const fila = mapeoEmpresa.aFila({ id: 'e', rut: '  ', razonSocial: 'A', activo: true });
    expect(fila.rut).toBeNull();
    expect(mapeoEmpresa.deFila(fila).rut).toBe('');
  });
  it('ida y vuelta sin pérdida: tarifa (bigint como string) y habitación', () => {
    const t = { id: 't', hotelId: 'h', concepto: 'CENA' as const, monto: 15000, vigenteDesde: '2026-01-01', vigenteHasta: null };
    expect(mapeoTarifa.deFila({ ...mapeoTarifa.aFila(t), monto: '15000' as unknown as number })).toEqual(t);
    const h = { id: 'x', hotelId: 'h', numero: '101', tipo: 'TWIN' as const, capacidad: 2, activa: true, notas: '' };
    expect(mapeoHabitacion.deFila(mapeoHabitacion.aFila(h))).toEqual(h);
  });
  it('estado de pago: filtro en columnas y total_neto desde el snapshot', () => {
    const e = {
      id: 'p', correlativo: 3, emitidoEn: '2026-11-30T12:00:00Z', estado: 'EMITIDO', observaciones: '', etiquetas: {},
      filtro: { desde: '2026-11-01', hasta: '2026-11-30', hotelId: null, empresaId: 'e1' },
      resultado: { totales: { total: 400000 } },
    } as unknown as EstadoPago;
    const f = mapeoEstadoPago.aFila(e);
    expect(f).toMatchObject({ desde: '2026-11-01', hasta: '2026-11-30', empresa_id: 'e1', total_neto: 400000 });
    expect(mapeoEstadoPago.deFila(f)).toEqual(e);
  });
  it('traduce errores de base de datos a mensajes operativos', () => {
    expect(mensajeError({ message: 'CONFLICTO: el folio 1 fue modificado' })).toBe('el folio 1 fue modificado');
    expect(mensajeError({ message: 'new row violates row-level security policy for table "empresa"' })).toMatch(/permiso/);
    expect(mensajeError({ message: 'x', code: '23P01' })).toMatch(/vigencias/);
    expect(mensajeError({ message: 'Sobreventa: habitación …' })).toMatch(/sin cupo/);
  });
});

describe('SupabaseRepository', () => {
  it('pagina de 1000 en 1000 hasta agotar', async () => {
    const { cliente, tablas, llamadas } = clienteFalso();
    tablas.set('empresa', Array.from({ length: 2345 }, (_, i) => ({ id: `e${i}`, rut: null, razon_social: `E${i}`, activo: true })));
    const lista = await new SupabaseRepository(cliente).empresas.list();
    expect(lista).toHaveLength(2345);
    expect(llamadas.filter((l) => l.tipo === 'select').map((l) => (l.args as number[])[1])).toEqual([0, 1000, 2000]);
  });
  it('registros: lista desde la vista de dominio y guarda vía RPC transaccional', async () => {
    const { cliente, tablas, llamadas } = clienteFalso();
    const doc = { id: 'r1', folio: 1 } as Registro;
    tablas.set('registro_dominio', [{ id: 'r1', doc }]);
    const repo = new SupabaseRepository(cliente);
    expect(await repo.registros.list()).toEqual([doc]);
    await repo.registros.upsert(doc);
    expect(llamadas.at(-1)).toEqual({ tipo: 'rpc', args: { nombre: 'guardar_registro', p_doc: doc, p_importar: false } });
    await expect(repo.registros.remove('r1')).rejects.toThrow(/anúlelos/);
    await expect(repo.estadosPago.remove('p1')).rejects.toThrow(/trazabilidad/);
  });
  it('correlativos desde secuencias del servidor', async () => {
    const { cliente } = clienteFalso();
    expect(await new SupabaseRepository(cliente).siguiente('folioRegistro')).toBe(42);
  });
  it('propaga errores traducidos', async () => {
    const { cliente } = clienteFalso({ error: { message: 'CONFLICTO: el folio 9 fue modificado por otra operación' } });
    await expect(new SupabaseRepository(cliente).registros.upsert({ id: 'r' } as Registro)).rejects.toThrow('el folio 9 fue modificado');
  });
  it('importa un respaldo local antiguo: migra IDs de hotel y respeta dependencias', async () => {
    const { cliente, llamadas } = clienteFalso();
    const v3 = {
      version: 3,
      hoteles: [{ id: 'hotel-tabancura', nombre: 'Hotel Tabancura', tipo: 'MADRE', activo: true }],
      habitaciones: [{ id: 'hab1', hotelId: 'hotel-tabancura', numero: '101', tipo: 'SINGLE', capacidad: 1, activa: true, notas: '' }],
      tarifas: [
        { id: 't2', hotelId: 'hotel-tabancura', concepto: 'ALOJAMIENTO', monto: 2, vigenteDesde: '2026-06-01', vigenteHasta: null },
        { id: 't1', hotelId: 'hotel-tabancura', concepto: 'ALOJAMIENTO', monto: 1, vigenteDesde: '2026-01-01', vigenteHasta: '2026-05-31' },
      ],
      empresas: [{ id: 'e1', rut: '', razonSocial: 'A', activo: true }],
      solicitantes: [{ id: 's1', nombre: 'S', empresaId: 'e1', cargo: '', email: '', activo: true }],
      registros: [
        { id: 'r2', folio: 2, historial: [], adicionales: [], tramos: [{ id: 'x2', hotelId: 'hotel-tabancura', desde: '2026-11-03', hasta: '2026-11-04', tarifaNoche: 1, habitacionId: 'hab1', motivo: '' }] },
        { id: 'r1', folio: 1, historial: [], adicionales: [], tramos: [{ id: 'x1', hotelId: 'hotel-tabancura', desde: '2026-11-01', hasta: '2026-11-02', tarifaNoche: 1, habitacionId: null, motivo: '' }] },
      ],
      estadosPago: [],
      contadores: { folioRegistro: 2, correlativoEDP: 0 },
    };
    await new SupabaseRepository(cliente).importar(v3 as never);
    const orden = llamadas.filter((l) => l.tipo !== 'select').map((l) => l.tabla ?? (l.args as { nombre: string }).nombre);
    expect(orden).toEqual(['hotel', 'empresa', 'solicitante', 'habitacion', 'tarifa', 'tarifa', 'guardar_registro', 'guardar_registro', 'ajustar_secuencias']);
    const hotel = llamadas.find((l) => l.tabla === 'hotel')!.args as { id: string };
    expect(hotel.id).toBe(HOTEL_ID.TABANCURA);
    const tarifas = llamadas.filter((l) => l.tabla === 'tarifa').map((l) => (l.args as { id: string }).id);
    expect(tarifas).toEqual(['t1', 't2']); // por vigencia, evita choques de exclusión
    const regs = llamadas.filter((l) => (l.args as { nombre?: string })?.nombre === 'guardar_registro').map((l) => l.args as { p_doc: Registro; p_importar: boolean });
    expect(regs.map((r) => r.p_doc.folio)).toEqual([1, 2]);
    expect(regs.every((r) => r.p_importar)).toBe(true);
    expect(regs[0]!.p_doc.tramos[0]!.hotelId).toBe(HOTEL_ID.TABANCURA);
  });
});
