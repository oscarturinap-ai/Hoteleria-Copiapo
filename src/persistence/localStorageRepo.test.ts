import { describe, expect, it } from 'vitest';
import { LocalStorageRepository, VERSION_ESQUEMA } from './localStorageRepo';

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
    expect(r!.tramos[0]!.habitacion).toBe('');
    expect(r!.historial[0]).toMatchObject({ accion: 'CREADO', en: '2026-11-01T10:00:00Z' });
    expect((await repo.exportar()).version).toBe(VERSION_ESQUEMA);
    expect(await repo.siguiente('folioRegistro')).toBe(8);
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
