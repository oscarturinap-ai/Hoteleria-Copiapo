import { useMemo, useState } from 'react';
import {
  ETIQUETA_ESTADO,
  formatearRut,
  formatoCLP,
  formatoFecha,
  hoyISO,
  ingreso,
  resumenRegistro,
  salida,
  sumarDias,
  tramoVigente,
  panelDia,
} from '../../domain';
import type { Registro } from '../../domain';
import { AccionesRegistro } from '../components/AccionesRegistro';
import { Kpi } from '../components/ui';
import { useStore } from '../store';
import { RegistroForm } from './RegistroForm';

type Pestaña = 'llegadas' | 'salidas' | 'inHouse' | 'pendientes';

export function PanelDiaPage() {
  const s = useStore();
  const hoy = hoyISO();
  const [fecha, setFecha] = useState(hoy);
  const [pestaña, setPestaña] = useState<Pestaña>('llegadas');
  const [abierto, setAbierto] = useState<Registro | 'nuevo' | null>(null);

  const p = useMemo(() => panelDia(s.registros, fecha), [s.registros, fecha]);
  const pendientes = [...p.llegadasPendientes, ...p.salidasVencidas];
  const hotelesActivos = s.hoteles.filter((h) => h.activo);

  const listas: Record<Pestaña, { titulo: string; filas: Registro[]; vacio: string }> = {
    llegadas: { titulo: `Llegadas (${p.llegadas.length})`, filas: p.llegadas, vacio: 'Sin llegadas programadas.' },
    salidas: { titulo: `Salidas (${p.salidas.length})`, filas: p.salidas, vacio: 'Sin salidas programadas.' },
    inHouse: { titulo: `In-house (${p.inHouse.length})`, filas: p.inHouse, vacio: 'Sin huéspedes alojados.' },
    pendientes: { titulo: `Pendientes (${pendientes.length})`, filas: pendientes, vacio: 'Sin pendientes. Operación al día.' },
  };
  const actual = listas[pestaña];

  return (
    <div className="pagina">
      <div className="barra">
        <button className="btn" onClick={() => setFecha(sumarDias(fecha, -1))} aria-label="Día anterior">‹</button>
        <input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} />
        <button className="btn" onClick={() => setFecha(sumarDias(fecha, 1))} aria-label="Día siguiente">›</button>
        {fecha !== hoy && <button className="btn" onClick={() => setFecha(hoy)}>Hoy</button>}
        <b className="titulo-fecha">{new Date(`${fecha}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</b>
        <div className="espaciador" />
        <button className="btn primario" onClick={() => setAbierto('nuevo')}>+ Nuevo registro</button>
      </div>

      <div className="kpis">
        <Kpi label="Llegadas" valor={String(p.llegadas.length)} sub="reservados con IN hoy" />
        <Kpi label="Salidas" valor={String(p.salidas.length)} sub="in-house con OUT hoy (11:00)" />
        <Kpi label="In-house" valor={String(p.inHouse.length)} />
        <Kpi label="Pendientes" valor={String(pendientes.length)} sub={`${p.llegadasPendientes.length} llegadas · ${p.salidasVencidas.length} salidas vencidas`} />
        <div className="kpi">
          <div className="kpi-label">Pernoctan esta noche</div>
          {hotelesActivos.map((h) => (
            <div key={h.id} className="kpi-linea"><span>{h.nombre.replace(/^Hotel /, '')}</span><b>{p.ocupacion.get(h.id) ?? 0}</b></div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="pestañas">
          {(Object.keys(listas) as Pestaña[]).map((k) => (
            <button key={k} className={`${k === pestaña ? 'activo' : ''} ${k === 'pendientes' && pendientes.length ? 'alerta' : ''}`} onClick={() => setPestaña(k)}>
              {listas[k].titulo}
            </button>
          ))}
        </div>
        {actual.filas.length === 0 ? (
          <div className="vacio">{actual.vacio}</div>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th className="num">Folio</th><th>Huésped</th><th>RUT</th><th>Empresa</th><th>Hotel / hab.</th><th>IN</th><th>OUT</th>
                <th>Estado</th><th className="num">Folio neto</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {actual.filas.map((r) => {
                const t = tramoVigente(r, fecha) ?? r.tramos[0]!;
                const atraso = r.estado === 'RESERVADO' && ingreso(r) < fecha ? 'Llegada atrasada' : r.estado === 'IN_HOUSE' && salida(r) < fecha ? 'Salida vencida' : '';
                return (
                  <tr key={r.id} className="clic" onClick={() => setAbierto(r)}>
                    <td className="num">{r.folio}</td>
                    <td><b>{r.huesped.nombre}</b></td>
                    <td className="mono">{formatearRut(r.huesped.rut)}</td>
                    <td>{s.nombreEmpresa(r.empresaId)}</td>
                    <td>{s.nombreHotel(t.hotelId).replace(/^Hotel /, '')}{t.habitacion && <span className="tag">hab. {t.habitacion}</span>}</td>
                    <td>{formatoFecha(ingreso(r))}</td>
                    <td>{formatoFecha(salida(r))}</td>
                    <td>
                      <span className={`estado e-${r.estado}`}>{ETIQUETA_ESTADO[r.estado]}</span>
                      {atraso && <span className="tag rojo">{atraso}</span>}
                    </td>
                    <td className="num">{formatoCLP(resumenRegistro(r).total)}</td>
                    <td><AccionesRegistro r={r} compacto /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {abierto && (
        <RegistroForm
          inicial={abierto === 'nuevo' ? null : abierto}
          prellenado={abierto === 'nuevo' ? { fecha } : undefined}
          onClose={() => setAbierto(null)}
        />
      )}
    </div>
  );
}
