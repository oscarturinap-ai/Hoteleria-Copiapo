import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { describirCambios, normalizarRut, validarRegistro } from '../domain';
import type { AccionRegistro, Empresa, EstadoPago, Hotel, Id, Registro, Solicitante, Tarifa } from '../domain';
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
  /** Operador responsable (queda en la bitácora). Reemplazable por el usuario autenticado. */
  operador: string;
  setOperador: (nombre: string) => void;
  guardarRegistro: (antes: Registro | null, despues: Registro, accion?: AccionRegistro, detalle?: string) => Promise<ResultadoGuardar>;
}

export type ResultadoGuardar = { ok: true; registro: Registro } | { ok: false; errores: string[] };

const CLAVE_OPERADOR = 'hoteleria-copiapo:operador';

const Ctx = createContext<Store | null>(null);

const VACIO: Datos = { hoteles: [], tarifas: [], empresas: [], solicitantes: [], registros: [], estadosPago: [] };

export function StoreProvider({ repo, children }: { repo: Repository; children: ReactNode }) {
  const [datos, setDatos] = useState<Datos>(VACIO);
  const [cargando, setCargando] = useState(true);
  const [operador, setOperadorState] = useState(() => localStorage.getItem(CLAVE_OPERADOR) ?? '');
  const setOperador = useCallback((n: string) => {
    setOperadorState(n);
    localStorage.setItem(CLAVE_OPERADOR, n);
  }, []);

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
    const nombreHotel = idx(datos.hoteles, (h) => h.nombre);
    const nombreEmpresa = idx(datos.empresas, (e) => e.razonSocial);
    const nombreSolicitante = idx(datos.solicitantes, (s) => s.nombre);

    /**
     * Único punto de escritura de registros: valida reglas de negocio, asigna folio,
     * agrega el evento a la bitácora y persiste.
     */
    const guardarRegistro: Store['guardarRegistro'] = async (antes, despues, accion, detalle) => {
      if (!operador.trim()) return { ok: false, errores: ['Indique el operador responsable (barra superior) antes de guardar.'] };
      if (antes) {
        // Concurrencia optimista: no sobrescribir una versión más nueva.
        const vigente = (await repo.registros.list()).find((x) => x.id === antes.id);
        if (vigente && vigente.actualizadoEn !== antes.actualizadoEn) {
          return { ok: false, errores: [`El folio ${antes.folio} fue modificado después de abrirlo (${new Date(vigente.actualizadoEn).toLocaleString('es-CL')}). Cierre y vuelva a abrir el registro.`] };
        }
      }
      const v = validarRegistro(despues, {
        hoteles: datos.hoteles,
        empresaIds: new Set(datos.empresas.map((e) => e.id)),
        solicitanteIds: new Set(datos.solicitantes.map((x) => x.id)),
        otrosRegistros: datos.registros,
      });
      if (v.errores.length) return { ok: false, errores: v.errores };

      const acc: AccionRegistro = accion ?? (antes ? 'EDITADO' : 'CREADO');
      const det = detalle ?? (antes ? describirCambios(antes, despues, { hotel: nombreHotel, empresa: nombreEmpresa, solicitante: nombreSolicitante }) : 'Registro creado');
      if (antes && acc === 'EDITADO' && !det) return { ok: true, registro: antes }; // sin cambios
      const ts = ahora();
      const folio = despues.folio || (await repo.siguiente('folioRegistro'));
      const guardado = await repo.registros.upsert({
        ...despues,
        folio,
        huesped: { rut: normalizarRut(despues.huesped.rut), nombre: despues.huesped.nombre.trim().replace(/\s+/g, ' ') },
        noShow: despues.estado === 'NO_SHOW' ? despues.noShow : null,
        historial: [...(antes?.historial ?? despues.historial ?? []), { en: ts, usuario: operador.trim(), accion: acc, detalle: det }],
        creadoEn: despues.creadoEn || ts,
        actualizadoEn: ts,
      });
      await recargar();
      return { ok: true, registro: guardado };
    };

    return {
      ...datos,
      repo,
      cargando,
      recargar,
      operador,
      setOperador,
      guardarRegistro,
      nombreHotel,
      nombreEmpresa,
      nombreSolicitante,
      importar: async (s) => {
        await repo.importar(s);
        await recargar();
      },
    };
  }, [datos, repo, cargando, recargar, operador, setOperador]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore fuera de StoreProvider');
  return s;
}

export const nuevoId = (): Id => crypto.randomUUID();
export const ahora = (): string => new Date().toISOString();
