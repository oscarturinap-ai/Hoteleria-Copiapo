import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Empresa, EstadoPago, Hotel, Id, Registro, Solicitante, Tarifa } from '../domain/types';
import type { Repository, Snapshot } from '../persistence/repository';

export interface Datos {
  hoteles: Hotel[];
  tarifas: Tarifa[];
  empresas: Empresa[];
  solicitantes: Solicitante[];
  registros: Registro[];
  estadosPago: EstadoPago[];
}

interface Store extends Datos {
  repo: Repository;
  cargando: boolean;
  recargar: () => Promise<void>;
  nombreHotel: (id: Id) => string;
  nombreEmpresa: (id: Id) => string;
  nombreSolicitante: (id: Id) => string;
  importar: (s: Snapshot) => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

const VACIO: Datos = { hoteles: [], tarifas: [], empresas: [], solicitantes: [], registros: [], estadosPago: [] };

export function StoreProvider({ repo, children }: { repo: Repository; children: ReactNode }) {
  const [datos, setDatos] = useState<Datos>(VACIO);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    const [hoteles, tarifas, empresas, solicitantes, registros, estadosPago] = await Promise.all([
      repo.hoteles.list(),
      repo.tarifas.list(),
      repo.empresas.list(),
      repo.solicitantes.list(),
      repo.registros.list(),
      repo.estadosPago.list(),
    ]);
    setDatos({ hoteles, tarifas, empresas, solicitantes, registros, estadosPago });
    setCargando(false);
  }, [repo]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const value = useMemo<Store>(() => {
    const idx = <T extends { id: Id }>(arr: T[], f: (x: T) => string) => {
      const m = new Map(arr.map((x) => [x.id, f(x)]));
      return (id: Id) => m.get(id) ?? '(desconocido)';
    };
    return {
      ...datos,
      repo,
      cargando,
      recargar,
      nombreHotel: idx(datos.hoteles, (h) => h.nombre),
      nombreEmpresa: idx(datos.empresas, (e) => e.razonSocial),
      nombreSolicitante: idx(datos.solicitantes, (s) => s.nombre),
      importar: async (s) => {
        await repo.importar(s);
        await recargar();
      },
    };
  }, [datos, repo, cargando, recargar]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore fuera de StoreProvider');
  return s;
}

export const nuevoId = (): Id => crypto.randomUUID();
export const ahora = (): string => new Date().toISOString();
