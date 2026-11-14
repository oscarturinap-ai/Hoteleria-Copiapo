import { useCallback, useEffect, useState } from 'react';
import { mensajeError } from '../../persistence/supabaseMapeo';
import type { Rol } from '../auth';
import { useStore } from '../store';

interface Perfil {
  id: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
}

const DESCRIPCION: Record<Rol, string> = {
  ADMIN: 'Todo, incluidos maestros, tarifas, inventario, usuarios e importación',
  OPERADOR: 'Registros, recepción, cargos y emisión de EDP',
  LECTOR: 'Sólo consulta',
};

/** Gestión de roles (ADMIN). Las cuentas se crean/invitan en Supabase → Authentication. */
export function UsuariosPage() {
  const s = useStore();
  const cliente = s.sesion?.cliente;
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    if (!cliente) return;
    const { data, error } = await cliente.from('perfil').select('id, nombre, rol, activo').order('nombre');
    if (error) setMsg({ tipo: 'err', texto: mensajeError(error) });
    else setPerfiles(data as Perfil[]);
  }, [cliente]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (!cliente) return <div className="vacio">La gestión de usuarios requiere el modo Supabase.</div>;

  const actualizar = async (p: Perfil, patch: Partial<Perfil>) => {
    setMsg(null);
    if (p.id === s.sesion?.userId && (patch.rol && patch.rol !== 'ADMIN' || patch.activo === false)) {
      return setMsg({ tipo: 'err', texto: 'No puede quitarse a sí mismo el rol ADMIN ni desactivarse.' });
    }
    const { error } = await cliente.from('perfil').update(patch).eq('id', p.id);
    if (error) return setMsg({ tipo: 'err', texto: mensajeError(error) });
    setMsg({ tipo: 'ok', texto: `Perfil de ${patch.nombre ?? p.nombre} actualizado.` });
    await cargar();
  };

  return (
    <div className="pagina">
      <div className="panel">
        <h3>Usuarios y roles</h3>
        <p className="hint">
          Las cuentas se crean o invitan desde el panel de Supabase (Authentication → Users). Al primer ingreso se crea el perfil
          como LECTOR; asígnele aquí el rol que corresponda. El nombre es el que queda en la bitácora.
        </p>
        {msg && <div className={`msg ${msg.tipo}`}>{msg.tipo === 'ok' ? '✓' : '✕'} {msg.texto}</div>}
        <table className="tabla compacta">
          <thead><tr><th>Nombre (bitácora)</th><th>Rol</th><th>Permisos</th><th>Activo</th></tr></thead>
          <tbody>
            {perfiles.map((p) => (
              <tr key={p.id} className={p.activo ? '' : 'tenue'}>
                <td>
                  <input defaultValue={p.nombre} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== p.nombre && actualizar(p, { nombre: e.target.value.trim() })} />
                  {p.id === s.sesion?.userId && <span className="tag">usted</span>}
                </td>
                <td>
                  <select value={p.rol} onChange={(e) => actualizar(p, { rol: e.target.value as Rol })}>
                    {(Object.keys(DESCRIPCION) as Rol[]).map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="hint">{DESCRIPCION[p.rol]}</td>
                <td><input type="checkbox" checked={p.activo} onChange={(e) => actualizar(p, { activo: e.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
