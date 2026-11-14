import { useState } from 'react';
import { formatearRut, normalizarRut, validarRut } from '../../domain';
import type { Empresa, Solicitante } from '../../domain';
import { Campo } from '../components/ui';
import { nuevoId, useStore } from '../store';

export function MaestrosPage() {
  const s = useStore();
  const [emp, setEmp] = useState({ rut: '', razonSocial: '' });
  const [sol, setSol] = useState({ nombre: '', empresaId: '', cargo: '', email: '' });
  const [error, setError] = useState('');

  const usoEmpresa = (id: string) => s.registros.filter((r) => r.empresaId === id).length;
  const usoSolicitante = (id: string) => s.registros.filter((r) => r.solicitanteId === id).length;

  const agregarEmpresa = async () => {
    setError('');
    if (!emp.razonSocial.trim()) return setError('Razón social obligatoria.');
    if (emp.rut && !validarRut(emp.rut)) return setError('RUT de empresa inválido.');
    if (emp.rut && s.empresas.some((e) => e.rut && normalizarRut(e.rut) === normalizarRut(emp.rut))) return setError('Ya existe una empresa con ese RUT.');
    await s.repo.empresas.upsert({ id: nuevoId(), rut: emp.rut ? normalizarRut(emp.rut) : '', razonSocial: emp.razonSocial.trim(), activo: true });
    setEmp({ rut: '', razonSocial: '' });
    await s.recargar();
  };

  const agregarSolicitante = async () => {
    setError('');
    if (!sol.nombre.trim()) return setError('Nombre del solicitante obligatorio.');
    await s.repo.solicitantes.upsert({
      id: nuevoId(),
      nombre: sol.nombre.trim(),
      empresaId: sol.empresaId || null,
      cargo: sol.cargo.trim(),
      email: sol.email.trim(),
      activo: true,
    });
    setSol({ nombre: '', empresaId: '', cargo: '', email: '' });
    await s.recargar();
  };

  const guardarEmpresa = async (e: Empresa) => { await s.repo.empresas.upsert(e); await s.recargar(); };
  const guardarSolicitante = async (x: Solicitante) => { await s.repo.solicitantes.upsert(x); await s.recargar(); };

  /** Sólo se elimina si no tiene registros asociados; si tiene, se desactiva (trazabilidad). */
  const eliminar = async (tipo: 'empresa' | 'solicitante', id: string, uso: number) => {
    if (uso > 0) return setError(`No se puede eliminar: tiene ${uso} registro(s). Desactívelo en su lugar.`);
    if (!window.confirm('¿Eliminar definitivamente?')) return;
    await (tipo === 'empresa' ? s.repo.empresas.remove(id) : s.repo.solicitantes.remove(id));
    await s.recargar();
  };

  return (
    <div className="pagina">
      {error && <div className="msg err">✕ {error}</div>}
      <div className="grid-2">
        <div className="panel">
          <h3>Empresas contratantes</h3>
          <div className="fila">
            <Campo label="RUT" ancho={130}>
              <input value={emp.rut} onChange={(e) => setEmp({ ...emp, rut: e.target.value })} onBlur={() => setEmp({ ...emp, rut: emp.rut && formatearRut(emp.rut) })} />
            </Campo>
            <Campo label="Razón social" ancho={240}>
              <input value={emp.razonSocial} onChange={(e) => setEmp({ ...emp, razonSocial: e.target.value })} />
            </Campo>
            <button className="btn primario" onClick={agregarEmpresa}>+ Agregar</button>
          </div>
          <table className="tabla compacta">
            <thead><tr><th>RUT</th><th>Razón social</th><th className="num">Registros</th><th>Activa</th><th /></tr></thead>
            <tbody>
              {[...s.empresas].sort((a, b) => a.razonSocial.localeCompare(b.razonSocial)).map((e) => (
                <tr key={e.id} className={e.activo ? '' : 'tenue'}>
                  <td className="mono">{e.rut ? formatearRut(e.rut) : '—'}</td>
                  <td><input defaultValue={e.razonSocial} onBlur={(ev) => ev.target.value.trim() && ev.target.value !== e.razonSocial && guardarEmpresa({ ...e, razonSocial: ev.target.value.trim() })} /></td>
                  <td className="num">{usoEmpresa(e.id)}</td>
                  <td><input type="checkbox" checked={e.activo} onChange={(ev) => guardarEmpresa({ ...e, activo: ev.target.checked })} /></td>
                  <td><button className="btn-icono" onClick={() => eliminar('empresa', e.id, usoEmpresa(e.id))} aria-label="Eliminar">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h3>Solicitantes (quien deriva)</h3>
          <div className="fila">
            <Campo label="Nombre" ancho={180}><input value={sol.nombre} onChange={(e) => setSol({ ...sol, nombre: e.target.value })} /></Campo>
            <Campo label="Empresa" ancho={160}>
              <select value={sol.empresaId} onChange={(e) => setSol({ ...sol, empresaId: e.target.value })}>
                <option value="">— Sin empresa —</option>
                {s.empresas.map((e) => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
              </select>
            </Campo>
            <Campo label="Cargo / área" ancho={130}><input value={sol.cargo} onChange={(e) => setSol({ ...sol, cargo: e.target.value })} /></Campo>
            <Campo label="Email" ancho={170}><input type="email" value={sol.email} onChange={(e) => setSol({ ...sol, email: e.target.value })} /></Campo>
            <button className="btn primario" onClick={agregarSolicitante}>+ Agregar</button>
          </div>
          <table className="tabla compacta">
            <thead><tr><th>Nombre</th><th>Empresa</th><th>Cargo</th><th>Email</th><th className="num">Registros</th><th>Activo</th><th /></tr></thead>
            <tbody>
              {[...s.solicitantes].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((x) => (
                <tr key={x.id} className={x.activo ? '' : 'tenue'}>
                  <td>{x.nombre}</td>
                  <td>{x.empresaId ? s.nombreEmpresa(x.empresaId) : '—'}</td>
                  <td>{x.cargo || '—'}</td>
                  <td>{x.email || '—'}</td>
                  <td className="num">{usoSolicitante(x.id)}</td>
                  <td><input type="checkbox" checked={x.activo} onChange={(ev) => guardarSolicitante({ ...x, activo: ev.target.checked })} /></td>
                  <td><button className="btn-icono" onClick={() => eliminar('solicitante', x.id, usoSolicitante(x.id))} aria-label="Eliminar">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
