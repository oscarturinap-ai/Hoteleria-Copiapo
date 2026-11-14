import { useMemo, useState } from 'react';
import {
  ETIQUETA_ESTADO,
  esDerivado,
  formatearRut,
  formatoCLP,
  formatoFecha,
  ingreso,
  limpiarRut,
  resumenRegistro,
  salida,
} from '../../domain';
import type { EstadoRegistro, Registro } from '../../domain';
import { Vacio } from '../components/ui';
import { useStore } from '../store';
import { RegistroForm } from './RegistroForm';

export function RegistrosPage() {
  const s = useStore();
  const [editando, setEditando] = useState<Registro | null | 'nuevo'>(null);
  const [q, setQ] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [hotel, setHotel] = useState('');
  const [estado, setEstado] = useState<EstadoRegistro | ''>('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const filas = useMemo(() => {
    const texto = q.trim().toLowerCase();
    const rutQ = limpiarRut(q);
    return s.registros
      .filter((r) => {
        if (empresa && r.empresaId !== empresa) return false;
        if (hotel && !r.tramos.some((t) => t.hotelId === hotel)) return false;
        if (estado && r.estado !== estado) return false;
        // Rango: estadías que se superponen con [desde, hasta]
        if (desde && salida(r) <= desde) return false;
        if (hasta && ingreso(r) > hasta) return false;
        if (texto) {
          const hit =
            r.huesped.nombre.toLowerCase().includes(texto) ||
            (rutQ.length >= 3 && limpiarRut(r.huesped.rut).includes(rutQ)) ||
            String(r.folio) === texto;
          if (!hit) return false;
        }
        return true;
      })
      .map((r) => ({ r, res: resumenRegistro(r) }))
      .sort((a, b) => ingreso(b.r).localeCompare(ingreso(a.r)) || b.r.folio - a.r.folio);
  }, [s.registros, q, empresa, hotel, estado, desde, hasta]);

  const tot = filas.reduce(
    (acc, { res }) => ({ noches: acc.noches + res.noches, adic: acc.adic + res.adicionales, total: acc.total + res.total }),
    { noches: 0, adic: 0, total: 0 },
  );

  const faltantes = [
    s.empresas.length === 0 && 'empresas',
    s.solicitantes.length === 0 && 'solicitantes',
    s.tarifas.length === 0 && 'tarifas',
  ].filter(Boolean);

  return (
    <div className="pagina">
      <div className="barra">
        <input className="buscar" placeholder="Buscar RUT, nombre o folio…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
          <option value="">Todas las empresas</option>
          {s.empresas.map((e) => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
        </select>
        <select value={hotel} onChange={(e) => setHotel(e.target.value)}>
          <option value="">Todos los hoteles</option>
          {s.hoteles.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoRegistro | '')}>
          <option value="">Todos los estados</option>
          {(Object.keys(ETIQUETA_ESTADO) as EstadoRegistro[]).map((x) => <option key={x} value={x}>{ETIQUETA_ESTADO[x]}</option>)}
        </select>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} title="Estadías desde" />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} title="Estadías hasta" />
        <div className="espaciador" />
        <button className="btn primario" onClick={() => setEditando('nuevo')}>+ Nuevo registro</button>
      </div>

      {faltantes.length > 0 && (
        <div className="msg warn">! Configure {faltantes.join(', ')} antes de registrar (menús Maestros y Hoteles y tarifas).</div>
      )}

      {filas.length === 0 ? (
        <Vacio>Sin registros para los filtros aplicados.</Vacio>
      ) : (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th className="num">Folio</th><th>RUT</th><th>Nombre</th><th>Empresa</th><th>Solicitante</th><th>Hotel</th>
                <th>IN</th><th>OUT</th><th className="num">Noches</th><th>Estado</th><th className="num">Adicionales</th><th className="num">Neto</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ r, res }) => (
                <tr key={r.id} className={`clic ${r.estado === 'ANULADO' ? 'anulado' : ''}`} onClick={() => setEditando(r)}>
                  <td className="num">{r.folio}</td>
                  <td className="mono">{formatearRut(r.huesped.rut)}</td>
                  <td>{r.huesped.nombre}</td>
                  <td>{s.nombreEmpresa(r.empresaId)}</td>
                  <td>{s.nombreSolicitante(r.solicitanteId)}</td>
                  <td>
                    {r.tramos.map((t) => s.nombreHotel(t.hotelId).replace(/^Hotel /, '')).filter((n, i, a) => a.indexOf(n) === i).join(' → ')}
                    {esDerivado(r) && <span className="tag">deriv.</span>}
                  </td>
                  <td>{formatoFecha(ingreso(r))}</td>
                  <td>{formatoFecha(salida(r))}</td>
                  <td className="num">{res.noches}</td>
                  <td><span className={`estado e-${r.estado}`}>{ETIQUETA_ESTADO[r.estado]}{r.noShow ? ` · ${r.noShow.modalidad.toLowerCase().replace('_', ' ')}` : ''}</span></td>
                  <td className="num">{res.adicionales ? formatoCLP(res.adicionales) : '—'}</td>
                  <td className="num"><b>{formatoCLP(res.total)}</b></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={8}>{filas.length} registros</td>
                <td className="num">{tot.noches}</td>
                <td />
                <td className="num">{formatoCLP(tot.adic)}</td>
                <td className="num">{formatoCLP(tot.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {editando && <RegistroForm inicial={editando === 'nuevo' ? null : editando} onClose={() => setEditando(null)} />}
    </div>
  );
}
