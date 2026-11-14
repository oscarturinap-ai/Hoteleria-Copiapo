import type { SupabaseClient } from '@supabase/supabase-js';
import type { EstadoPago, Id, Registro } from '../domain/types';
import { migrar, validarSnapshot } from './localStorageRepo';
import type { Collection, Repository, Snapshot } from './repository';
import {
  mapeoEmpresa,
  mapeoEstadoPago,
  mapeoHabitacion,
  mapeoHotel,
  mapeoSolicitante,
  mapeoTarifa,
  mensajeError,
  type Mapeo,
} from './supabaseMapeo';

const PAGINA = 1000; // límite por defecto de filas por respuesta en Supabase

/**
 * Persistencia en Supabase/PostgreSQL. Requiere las migraciones supabase/migrations/0001–0004.
 * La seguridad (roles, RLS, sobreventa, inmutabilidad) la impone la base de datos; este
 * adaptador sólo traduce.
 */
export class SupabaseRepository implements Repository {
  readonly concurrenciaEnServidor = true;

  constructor(private readonly db: SupabaseClient) {}

  private async paginar<R>(tabla: string, columnas = '*', orden = 'id'): Promise<R[]> {
    const out: R[] = [];
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await this.db.from(tabla).select(columnas).order(orden).range(desde, desde + PAGINA - 1);
      if (error) throw new Error(mensajeError(error));
      out.push(...((data ?? []) as R[]));
      if (!data || data.length < PAGINA) return out;
    }
  }

  private coleccion<T extends { id: Id }, R>(m: Mapeo<T, R>, opciones: { borrable?: boolean } = {}): Collection<T> {
    return {
      list: async () => (await this.paginar<R>(m.tabla)).map(m.deFila),
      upsert: async (item: T) => {
        const { data, error } = await this.db.from(m.tabla).upsert(m.aFila(item) as object).select().single();
        if (error) throw new Error(mensajeError(error));
        return m.deFila(data as R);
      },
      remove: async (id: Id) => {
        if (opciones.borrable === false) throw new Error(`Los elementos de ${m.tabla} no se eliminan (trazabilidad).`);
        const { error } = await this.db.from(m.tabla).delete().eq('id', id);
        if (error) throw new Error(mensajeError(error));
      },
    };
  }

  hoteles = this.coleccion(mapeoHotel);
  habitaciones = this.coleccion(mapeoHabitacion);
  tarifas = this.coleccion(mapeoTarifa);
  empresas = this.coleccion(mapeoEmpresa);
  solicitantes = this.coleccion(mapeoSolicitante);
  estadosPago = this.coleccion<EstadoPago, ReturnType<typeof mapeoEstadoPago.aFila>>(mapeoEstadoPago, { borrable: false });

  registros: Collection<Registro> = {
    list: async () => (await this.paginar<{ doc: Registro }>('registro_dominio', 'doc')).map((x) => x.doc),
    upsert: async (r: Registro) => this.guardarRegistro(r, false),
    remove: async () => {
      throw new Error('Los registros no se eliminan: anúlelos (trazabilidad).');
    },
  };

  private async guardarRegistro(r: Registro, importar: boolean): Promise<Registro> {
    const { data, error } = await this.db.rpc('guardar_registro', { p_doc: r, p_importar: importar });
    if (error) throw new Error(mensajeError(error));
    return data as Registro;
  }

  async siguiente(c: keyof Snapshot['contadores']): Promise<number> {
    const { data, error } = await this.db.rpc('siguiente_correlativo', { p_nombre: c });
    if (error) throw new Error(mensajeError(error));
    return Number(data);
  }

  async exportar(): Promise<Snapshot> {
    const [hoteles, habitaciones, tarifas, empresas, solicitantes, registros, estadosPago] = await Promise.all([
      this.hoteles.list(), this.habitaciones.list(), this.tarifas.list(), this.empresas.list(),
      this.solicitantes.list(), this.registros.list(), this.estadosPago.list(),
    ]);
    return {
      version: 4,
      hoteles, habitaciones, tarifas, empresas, solicitantes, registros, estadosPago,
      contadores: {
        folioRegistro: Math.max(0, ...registros.map((r) => r.folio)),
        correlativoEDP: Math.max(0, ...estadosPago.map((e) => e.correlativo)),
      },
    };
  }

  /**
   * Carga un respaldo (p. ej. el JSON exportado de la versión local) respetando dependencias.
   * Idempotente: reimportar el mismo respaldo no duplica (upsert por id; la bitácora sólo
   * agrega eventos faltantes). Requiere rol ADMIN.
   */
  async importar(entrada: Snapshot): Promise<void> {
    validarSnapshot(entrada);
    const s = migrar(structuredClone(entrada));
    for (const x of s.hoteles) await this.hoteles.upsert(x);
    for (const x of s.empresas) await this.empresas.upsert(x);
    for (const x of s.solicitantes) await this.solicitantes.upsert(x);
    for (const x of s.habitaciones) await this.habitaciones.upsert(x);
    for (const x of [...s.tarifas].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde))) await this.tarifas.upsert(x);
    for (const r of [...s.registros].sort((a, b) => a.folio - b.folio)) await this.guardarRegistro(r, true);
    for (const e of s.estadosPago) {
      const { error } = await this.db.from('estado_pago').upsert(mapeoEstadoPago.aFila(e), { ignoreDuplicates: true });
      if (error) throw new Error(mensajeError(error));
    }
    const { error } = await this.db.rpc('ajustar_secuencias');
    if (error) throw new Error(mensajeError(error));
  }
}
