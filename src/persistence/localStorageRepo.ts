import type { Id } from '../domain/types';
import { HOTEL_ID, semilla } from './semilla';
import type { Collection, Repository, Snapshot } from './repository';

export const VERSION_ESQUEMA = 4;
const CLAVE = 'hoteleria-copiapo:db';

type Tablas = Exclude<keyof Snapshot, 'version' | 'contadores'>;

/** Migraciones de esquema local: índice = versión de origen. Nunca editar una ya publicada. */
const MIGRACIONES: Record<number, (s: Snapshot) => Snapshot> = {
  // v1 → v2: N° de habitación en tramos + historial operativo por registro.
  1: (s) => ({
    ...s,
    version: 2,
    registros: s.registros.map((r) => ({
      ...r,
      tramos: r.tramos.map((t) => ({ ...t, habitacion: (t as { habitacion?: string }).habitacion ?? '' })),
      historial: r.historial ?? [
        { en: r.creadoEn || new Date().toISOString(), usuario: '(migración)', accion: 'CREADO' as const, detalle: 'Registro anterior a la bitácora operativa' },
      ],
    })),
  }),
  // v2 → v3: inventario de habitaciones. El N° en texto libre de cada tramo se convierte en una
  // habitación del inventario de su hotel (capacidad 1, revisable) y el tramo pasa a referenciarla.
  2: (s) => {
    type TramoV2 = Snapshot['registros'][number]['tramos'][number] & { habitacion?: string };
    const habitaciones: Snapshot['habitaciones'] = [...(s.habitaciones ?? [])];
    const clave = (hotelId: string, numero: string) => `${hotelId}::${numero.trim().toLowerCase()}`;
    const porClave = new Map(habitaciones.map((h) => [clave(h.hotelId, h.numero), h.id]));
    const registros = s.registros.map((r) => ({
      ...r,
      tramos: r.tramos.map((t: TramoV2) => {
        const { habitacion, ...resto } = t;
        const numero = (habitacion ?? '').trim();
        let habitacionId: string | null = resto.habitacionId ?? null;
        if (!habitacionId && numero) {
          const k = clave(t.hotelId, numero);
          habitacionId = porClave.get(k) ?? null;
          if (!habitacionId) {
            habitacionId = crypto.randomUUID();
            habitaciones.push({ id: habitacionId, hotelId: t.hotelId, numero, tipo: 'SINGLE', capacidad: 1, activa: true, notas: 'Creada por migración desde N° ingresado manualmente' });
            porClave.set(k, habitacionId);
          }
        }
        return { ...resto, habitacionId };
      }),
    }));
    return { ...s, version: 3, habitaciones, registros };
  },
  // v3 → v4: IDs de hoteles semilla a UUID estables (compatibles con PostgreSQL/Supabase).
  // Los IDs antiguos son únicos y distintivos: se reemplazan en todo el snapshot, incluidos
  // los EDP emitidos (filtros, líneas, subtotales y etiquetas).
  3: (s) => {
    const mapa: Record<string, string> = {
      'hotel-tabancura': HOTEL_ID.TABANCURA,
      'hotel-alto-atacama': HOTEL_ID.ALTO_ATACAMA,
      'hotel-muray': HOTEL_ID.MURAY,
    };
    let json = JSON.stringify({ ...s, version: 4 });
    for (const [viejo, nuevo] of Object.entries(mapa)) json = json.split(`"${viejo}"`).join(`"${nuevo}"`);
    return JSON.parse(json) as Snapshot;
  },
};

export function migrar(s: Snapshot): Snapshot {
  let actual = s;
  while (actual.version < VERSION_ESQUEMA) {
    const m = MIGRACIONES[actual.version];
    if (!m) throw new Error(`Sin migración desde versión ${actual.version}`);
    actual = m(actual);
  }
  return actual;
}

export function validarSnapshot(x: unknown): asserts x is Snapshot {
  const s = x as Snapshot;
  const tablas: Tablas[] = ['hoteles', 'tarifas', 'empresas', 'solicitantes', 'registros', 'estadosPago'];
  if (s && typeof s.version === 'number' && s.version >= 3) tablas.push('habitaciones');
  if (!s || typeof s !== 'object' || typeof s.version !== 'number') throw new Error('Respaldo inválido: falta versión.');
  for (const t of tablas) if (!Array.isArray(s[t])) throw new Error(`Respaldo inválido: falta tabla "${t}".`);
  if (!s.contadores || typeof s.contadores.folioRegistro !== 'number') throw new Error('Respaldo inválido: faltan contadores.');
  if (s.version > VERSION_ESQUEMA) throw new Error('Respaldo generado por una versión más nueva de la aplicación.');
}

export class LocalStorageRepository implements Repository {
  private db: Snapshot;

  constructor(private readonly storage: Storage = window.localStorage) {
    const raw = storage.getItem(CLAVE);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      validarSnapshot(parsed);
      this.db = migrar(parsed);
    } else {
      this.db = semilla();
    }
    this.flush();
  }

  private flush() {
    this.storage.setItem(CLAVE, JSON.stringify(this.db));
  }

  private coleccion<K extends Tablas>(tabla: K): Collection<Snapshot[K][number]> {
    type T = Snapshot[K][number];
    return {
      list: async () => structuredClone(this.db[tabla]) as T[],
      upsert: async (item: T) => {
        const arr = this.db[tabla] as T[];
        const i = arr.findIndex((x) => x.id === item.id);
        const copia = structuredClone(item);
        if (i >= 0) arr[i] = copia;
        else arr.push(copia);
        this.flush();
        return structuredClone(copia);
      },
      remove: async (id: Id) => {
        (this.db[tabla] as T[]) = (this.db[tabla] as T[]).filter((x) => x.id !== id);
        this.flush();
      },
    };
  }

  hoteles = this.coleccion('hoteles');
  habitaciones = this.coleccion('habitaciones');
  tarifas = this.coleccion('tarifas');
  empresas = this.coleccion('empresas');
  solicitantes = this.coleccion('solicitantes');
  registros = this.coleccion('registros');
  estadosPago = this.coleccion('estadosPago');

  async siguiente(c: keyof Snapshot['contadores']): Promise<number> {
    this.db.contadores[c] += 1;
    this.flush();
    return this.db.contadores[c];
  }

  async exportar(): Promise<Snapshot> {
    return structuredClone(this.db);
  }

  async importar(s: Snapshot): Promise<void> {
    validarSnapshot(s);
    this.db = migrar(structuredClone(s));
    this.flush();
  }
}
