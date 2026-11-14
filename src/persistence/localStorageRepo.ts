import type { Id } from '../domain/types';
import { semilla } from './semilla';
import type { Collection, Repository, Snapshot } from './repository';

export const VERSION_ESQUEMA = 1;
const CLAVE = 'hoteleria-copiapo:db';

type Tablas = Exclude<keyof Snapshot, 'version' | 'contadores'>;

/** Migraciones de esquema local: índice = versión de origen. */
const MIGRACIONES: Record<number, (s: Snapshot) => Snapshot> = {};

function migrar(s: Snapshot): Snapshot {
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
