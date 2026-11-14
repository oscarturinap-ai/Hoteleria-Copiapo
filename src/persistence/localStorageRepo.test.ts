import { describe, expect, it } from 'vitest';
import { LocalStorageRepository, VERSION_ESQUEMA } from './localStorageRepo';
import { HOTEL_ID } from './semilla';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

describe('LocalStorageRepository', () => {
  it('siembra hoteles del contrato en almacenamiento vacío', async () => {
    const repo = new LocalStorageRepository(new MemStorage() as unknown as Storage);
    const h = await repo.hoteles.list();
    expect(h.map((x) => x.nombre)).toEqual(['Hotel Tabancura', 'Hotel Alto Atacama', 'Hotel Muray']);
    expect(h.filter((x) => x.tipo === 'MADRE')).toHaveLength(1);
  });

  it('migra datos v1 sin pérdida (habitación + historial)', async () => {
    const st = new MemStorage();
    const v1 = {
      version: 1, hoteles: [], tarifas: [], empresas: [], solicitantes: [], estadosPago: [],
      contadores: { folioRegistro: 7, correlativoEDP: 2 },
      registros: [{ id: 'r1', folio: 7, creadoEn: '2026-11-01T10:00:00Z', tramos: [{ id: 't1', hotelId: 'h', desde: '2026-11-01', hasta: '2026-11-02', tarifaNoche: 1, motivo: '' }], adicionales: [] }],
    };
    st.setItem('hoteleria-copiapo:db', JSON.stringify(v1));
    const repo = new LocalStorageRepository(st as unknown as Storage);
    const [r] = await repo.registros.list();
    expect(r!.tramos[0]!.habitacionId).toBeNull();
    expect(r!.historial[0]).toMatchObject({ accion: 'CREADO', en: '2026-11-01T10:00:00Z' });
    expect((await repo.exportar()).version).toBe(VERSION_ESQUEMA);
    expect(await repo.siguiente('folioRegistro')).toBe(8);
  });

  it('migra v2 → v3: N° de habitación en texto pasa a inventario sin duplicar', async () => {
    const st = new MemStorage();
    const t = (id: string, hab: string, hotelId = 'h1') => ({ id, hotelId, desde: '2026-11-01', hasta: '2026-11-02', tarifaNoche: 1, motivo: '', habitacion: hab });
    const v2 = {
      version: 2, hoteles: [], tarifas: [], empresas: [], solicitantes: [], estadosPago: [],
      contadores: { folioRegistro: 2, correlativoEDP: 0 },
      registros: [
        { id: 'r1', folio: 1, historial: [], adicionales: [], tramos: [t('t1', '101'), t('t2', '')] },
        { id: 'r2', folio: 2, historial: [], adicionales: [], tramos: [t('t3', ' 101 '), t('t4', '101', 'h2')] },
      ],
    };
    st.setItem('hoteleria-copiapo:db', JSON.stringify(v2));
    const repo = new LocalStorageRepository(st as unknown as Storage);
    const habs = await repo.habitaciones.list();
    expect(habs.map((h) => `${h.hotelId}:${h.numero}`).sort()).toEqual(['h1:101', 'h2:101']);
    const [r1, r2] = await repo.registros.list();
    const h1 = habs.find((h) => h.hotelId === 'h1')!.id;
    expect(r1!.tramos.map((x) => x.habitacionId)).toEqual([h1, null]);
    expect(r2!.tramos[0]!.habitacionId).toBe(h1);
    expect('habitacion' in r1!.tramos[0]!).toBe(false);
  });

  it('migra v3 → v4: hoteles semilla a UUID estables en todo el snapshot', async () => {
    const st = new MemStorage();
    const v3 = {
      version: 3, tarifas: [{ id: 't1', hotelId: 'hotel-muray', concepto: 'ALOJAMIENTO', monto: 1, vigenteDesde: '2026-01-01', vigenteHasta: null }],
      hoteles: [{ id: 'hotel-tabancura', nombre: 'Hotel Tabancura', tipo: 'MADRE', activo: true }],
      habitaciones: [], empresas: [], solicitantes: [],
      registros: [{ id: 'r1', folio: 1, historial: [], adicionales: [], tramos: [{ id: 'x', hotelId: 'hotel-tabancura', desde: '2026-11-01', hasta: '2026-11-02', tarifaNoche: 1, habitacionId: null, motivo: '' }] }],
      estadosPago: [{ id: 'p1', filtro: { hotelId: 'hotel-muray' }, etiquetas: { 'hotel-muray': 'Hotel Muray' }, resultado: { porHotel: [{ clave: 'hotel-muray' }] } }],
      contadores: { folioRegistro: 1, correlativoEDP: 1 },
    };
    st.setItem('hoteleria-copiapo:db', JSON.stringify(v3));
    const repo = new LocalStorageRepository(st as unknown as Storage);
    const snap = await repo.exportar();
    expect(snap.version).toBe(4);
    expect(snap.hoteles[0]!.id).toBe(HOTEL_ID.TABANCURA);
    expect(snap.tarifas[0]!.hotelId).toBe(HOTEL_ID.MURAY);
    expect(snap.registros[0]!.tramos[0]!.hotelId).toBe(HOTEL_ID.TABANCURA);
    expect(snap.estadosPago[0]!.filtro.hotelId).toBe(HOTEL_ID.MURAY);
    expect(Object.keys(snap.estadosPago[0]!.etiquetas)).toEqual([HOTEL_ID.MURAY]);
    expect(JSON.stringify(snap)).not.toContain('hotel-');
  });

  it('upsert/remove persisten y devuelven copias aisladas', async () => {
    const st = new MemStorage();
    const repo = new LocalStorageRepository(st as unknown as Storage);
    const e = await repo.empresas.upsert({ id: 'e1', rut: '', razonSocial: 'A', activo: true });
    e.razonSocial = 'mutado';
    expect((await repo.empresas.list())[0]!.razonSocial).toBe('A');
    const repo2 = new LocalStorageRepository(st as unknown as Storage);
    expect(await repo2.empresas.list()).toHaveLength(1);
    await repo2.empresas.remove('e1');
    expect(await repo2.empresas.list()).toHaveLength(0);
  });
});
