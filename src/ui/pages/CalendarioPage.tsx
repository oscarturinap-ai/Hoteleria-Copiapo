import { Fragment, useMemo, useState, type ReactNode } from 'react';
import {
  ETIQUETA_ESTADO,
  ETIQUETA_TIPO_HAB,
  compararHabitacion,
  formatoFecha,
  hoyISO,
  ingreso,
  limpiarRut,
  noches,
  ocupaInventario,
  salida,
  sumarDias,
} from '../../domain';
import type { Habitacion, Hotel, Id, ISODate, Registro } from '../../domain';
import { useStore } from '../store';
import { RegistroForm, type Prellenado } from './RegistroForm';

const DIAS_SEMANA = ['do', 'lu', 'ma', 'mi', 'ju', 'vi', 'sá'];
type Vista = 'habitacion' | 'huesped';

interface Fila {
  r: Registro;
  noches: Set<ISODate>;
  habitacionId: Id | null;
}

interface GrupoHotel {
  hotel: Hotel;
  /** Una fila por (registro × hotel), sin importar la habitación. */
  filas: Fila[];
  /** Una fila por (registro × habitación); clave '' = sin asignar. */
  porHabitacion: Map<Id | '', Fila[]>;
  habitaciones: Habitacion[];
}

export function CalendarioPage() {
  const s = useStore();
  const hoy = hoyISO();
  const [inicio, setInicio] = useState(sumarDias(hoy, -2));
  const [dias, setDias] = useState(14);
  const [hotelF, setHotelF] = useState('');
  const [q, setQ] = useState('');
  const [verNoShow, setVerNoShow] = useState(true);
  const [vista, setVista] = useState<Vista>('habitacion');
  const [abierto, setAbierto] = useState<{ r: Registro | null; pre?: Prellenado } | null>(null);

  const fin = sumarDias(inicio, dias); // exclusivo
  const columnas = useMemo(() => noches(inicio, fin), [inicio, fin]);

  const grupos = useMemo((): GrupoHotel[] => {
    const texto = q.trim().toLowerCase();
    const rutQ = limpiarRut(q);
    const mapa = new Map<Id, { filas: Map<Id, Fila>; porHab: Map<Id | '', Map<Id, Fila>> }>();
    const grupo = (h: Id) => {
      let g = mapa.get(h);
      if (!g) mapa.set(h, (g = { filas: new Map(), porHab: new Map() }));
      return g;
    };
    for (const r of s.registros) {
      if (r.estado === 'ANULADO' || r.tramos.length === 0) continue;
      if (r.estado === 'NO_SHOW' && !verNoShow) continue;
      if (ingreso(r) >= fin || salida(r) <= inicio) continue;
      if (texto && !r.huesped.nombre.toLowerCase().includes(texto) && !(rutQ.length >= 3 && limpiarRut(r.huesped.rut).includes(rutQ)) && String(r.folio) !== texto) continue;
      for (const t of r.tramos) {
        if (hotelF && t.hotelId !== hotelF) continue;
        const ns = noches(t.desde, t.hasta).filter((n) => n >= inicio && n < fin);
        if (ns.length === 0) continue;
        const g = grupo(t.hotelId);
        const f = g.filas.get(r.id) ?? { r, noches: new Set<ISODate>(), habitacionId: t.habitacionId };
        ns.forEach((n) => f.noches.add(n));
        g.filas.set(r.id, f);
        const k = t.habitacionId ?? '';
        const porReg = g.porHab.get(k) ?? new Map<Id, Fila>();
        const fh = porReg.get(r.id) ?? { r, noches: new Set<ISODate>(), habitacionId: t.habitacionId };
        ns.forEach((n) => fh.noches.add(n));
        porReg.set(r.id, fh);
        g.porHab.set(k, porReg);
      }
    }
    const orden = (a: Fila, b: Fila) => [...a.noches].sort()[0]!.localeCompare([...b.noches].sort()[0]!) || a.r.folio - b.r.folio;
    return s.hoteles
      .filter((h) => (hotelF ? h.id === hotelF : h.activo || mapa.has(h.id)))
      .map((hotel) => {
        const g = mapa.get(hotel.id);
        const porHabitacion = new Map<Id | '', Fila[]>();
        for (const [k, m] of g?.porHab ?? []) porHabitacion.set(k, [...m.values()].sort(orden));
        const habitaciones = s.habitaciones
          .filter((h) => h.hotelId === hotel.id && (h.activa || porHabitacion.has(h.id)))
          .sort(compararHabitacion);
        return { hotel, filas: [...(g?.filas.values() ?? [])].sort(orden), porHabitacion, habitaciones };
      });
  }, [s.registros, s.hoteles, s.habitaciones, inicio, fin, hotelF, q, verNoShow]);

  const ocupacion = (filas: Fila[], d: ISODate) => filas.filter((f) => f.noches.has(d) && ocupaInventario(f.r)).length;

  /** Celdas con barras continuas (colSpan) por cada tramo de noches consecutivas. */
  const celdas = (f: Fila): ReactNode[] => {
    const out: ReactNode[] = [];
    let i = 0;
    while (i < columnas.length) {
      const d = columnas[i]!;
      if (!f.noches.has(d)) {
        out.push(<td key={d} className={claseDia(d, hoy)} />);
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < columnas.length && f.noches.has(columnas[j + 1]!)) j++;
      const empiezaAntes = i === 0 && ingreso(f.r) < d;
      const sigueDespues = j === columnas.length - 1 && salida(f.r) > sumarDias(columnas[j]!, 1);
      out.push(
        <td key={d} colSpan={j - i + 1} className="celda-barra">
          <div
            className={`barra-est e-${f.r.estado} ${empiezaAntes ? 'corta-ini' : ''} ${sigueDespues ? 'corta-fin' : ''}`}
            title={`Folio ${f.r.folio} · ${f.r.huesped.nombre}\n${ETIQUETA_ESTADO[f.r.estado]} · IN ${formatoFecha(ingreso(f.r))} · OUT ${formatoFecha(salida(f.r))}`}
          >
            {f.r.huesped.nombre}
          </div>
        </td>,
      );
      i = j + 1;
    }
    return out;
  };

  const filaHuesped = (f: Fila, clave: string, etiquetaHab: boolean) => (
    <tr key={clave} className="clic" onClick={() => setAbierto({ r: f.r })}>
      <td className="col-fija sangria">
        <span className="folio">{f.r.folio}</span> {f.r.huesped.nombre}
        {etiquetaHab && f.habitacionId && <span className="tag">hab. {s.nombreHabitacion(f.habitacionId)}</span>}
      </td>
      {celdas(f)}
    </tr>
  );

  const nuevo = (pre: Prellenado) => setAbierto({ r: null, pre });

  return (
    <div className="pagina">
      <div className="barra">
        <div className="segmentado">
          <button className={vista === 'habitacion' ? 'activo' : ''} onClick={() => setVista('habitacion')}>Por habitación</button>
          <button className={vista === 'huesped' ? 'activo' : ''} onClick={() => setVista('huesped')}>Por huésped</button>
        </div>
        <button className="btn" onClick={() => setInicio(sumarDias(inicio, -7))}>‹ 7 días</button>
        <input type="date" value={inicio} onChange={(e) => e.target.value && setInicio(e.target.value)} />
        <button className="btn" onClick={() => setInicio(sumarDias(inicio, 7))}>7 días ›</button>
        <button className="btn" onClick={() => setInicio(sumarDias(hoy, -2))}>Hoy</button>
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
          <option value={7}>7 días</option>
          <option value={14}>14 días</option>
          <option value={21}>21 días</option>
          <option value={31}>31 días</option>
        </select>
        <select value={hotelF} onChange={(e) => setHotelF(e.target.value)}>
          <option value="">Todos los hoteles</option>
          {s.hoteles.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
        </select>
        <input className="buscar" placeholder="Buscar huésped, RUT o folio…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check"><input type="checkbox" checked={verNoShow} onChange={(e) => setVerNoShow(e.target.checked)} /> No show</label>
        <div className="espaciador" />
        <div className="leyenda">
          {(['RESERVADO', 'IN_HOUSE', 'CHECK_OUT', 'NO_SHOW'] as const).map((e) => <span key={e} className={`barra-est e-${e}`}>{ETIQUETA_ESTADO[e]}</span>)}
        </div>
      </div>

      <div className="tabla-scroll calendario">
        <table className="tabla cal">
          <thead>
            <tr>
              <th className="col-fija">{vista === 'habitacion' ? 'Habitación / huésped' : 'Huésped'}</th>
              {columnas.map((d) => {
                const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
                return (
                  <th key={d} className={`dia ${claseDia(d, hoy)}`}>
                    <div>{DIAS_SEMANA[dow]}</div>
                    <div className="num-dia">{d.slice(8)}</div>
                    {d.slice(8) === '01' || d === columnas[0] ? <div className="mes">{new Date(`${d}T12:00:00Z`).toLocaleDateString('es-CL', { month: 'short' })}</div> : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {grupos.map(({ hotel, filas, porHabitacion, habitaciones }) => {
              const camas = habitaciones.filter((h) => h.activa).reduce((a, h) => a + h.capacidad, 0);
              const sinAsignar = porHabitacion.get('') ?? [];
              const porRoom = vista === 'habitacion' && habitaciones.length > 0;
              return (
                <Fragment key={hotel.id}>
                  <tr className="fila-hotel">
                    <td className="col-fija">
                      <b>{hotel.nombre}</b> <span className="tag">{hotel.tipo === 'MADRE' ? 'madre' : 'convenio'}</span>
                      {camas > 0 && <span className="hint"> · {habitaciones.filter((h) => h.activa).length} hab. / {camas} camas</span>}
                    </td>
                    {columnas.map((d) => {
                      const o = ocupacion(filas, d);
                      const lleno = camas > 0 && o >= camas;
                      return (
                        <td
                          key={d}
                          className={`ocup ${claseDia(d, hoy)} ${lleno ? 'lleno' : ''}`}
                          title={`${hotel.nombre} · ${formatoFecha(d)}: ${o}${camas ? ` de ${camas} camas` : ' pernoctan'}\nClic: nuevo registro con ingreso este día`}
                          onClick={() => hotel.activo && nuevo({ hotelId: hotel.id, fecha: d })}
                        >
                          {camas ? `${o}/${camas}` : o || ''}
                        </td>
                      );
                    })}
                  </tr>

                  {porRoom ? (
                    <>
                      {habitaciones.map((h) => {
                        const ocup = porHabitacion.get(h.id) ?? [];
                        return (
                          <Fragment key={h.id}>
                            <tr className={`fila-hab ${h.activa ? '' : 'tenue'}`}>
                              <td className="col-fija">
                                <b>{h.numero}</b> <span className="hint">{ETIQUETA_TIPO_HAB[h.tipo]} · {h.capacidad} {h.capacidad === 1 ? 'cama' : 'camas'}{h.activa ? '' : ' · inactiva'}</span>
                              </td>
                              {columnas.map((d) => {
                                const o = ocupacion(ocup, d);
                                const estado = o === 0 ? 'libre' : o >= h.capacidad ? 'llena' : 'parcial';
                                return (
                                  <td
                                    key={d}
                                    className={`hab-dia ${estado} ${claseDia(d, hoy)}`}
                                    title={`Hab. ${h.numero} · ${formatoFecha(d)}: ${o}/${h.capacidad}${estado !== 'llena' && h.activa ? '\nClic: nuevo registro en esta habitación' : ''}`}
                                    onClick={() => estado !== 'llena' && h.activa && hotel.activo && nuevo({ hotelId: hotel.id, fecha: d, habitacionId: h.id })}
                                  >
                                    {h.capacidad > 1 && o > 0 ? `${o}/${h.capacidad}` : ''}
                                  </td>
                                );
                              })}
                            </tr>
                            {ocup.map((f) => filaHuesped(f, `${f.r.id}-${h.id}`, false))}
                          </Fragment>
                        );
                      })}
                      {sinAsignar.length > 0 && (
                        <>
                          <tr className="fila-hab sin-asignar">
                            <td className="col-fija"><b>Sin habitación asignada</b> <span className="tag rojo">{sinAsignar.length}</span></td>
                            <td colSpan={columnas.length} />
                          </tr>
                          {sinAsignar.map((f) => filaHuesped(f, `${f.r.id}-sin`, false))}
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      {filas.length === 0 && (
                        <tr><td className="col-fija hint">Sin estadías en el rango{vista === 'habitacion' ? ' · sin inventario cargado' : ''}</td><td colSpan={columnas.length} /></tr>
                      )}
                      {filas.map((f) => filaHuesped(f, `${f.r.id}-${hotel.id}`, true))}
                    </>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="hint">
        Clic en la fila del hotel para crear un registro con ese hotel e ingreso; en la vista por habitación, clic en una celda libre lo crea con esa habitación asignada. Clic en un huésped abre su registro.
      </div>

      {abierto && <RegistroForm inicial={abierto.r} prellenado={abierto.pre} onClose={() => setAbierto(null)} />}
    </div>
  );
}

function claseDia(d: ISODate, hoy: ISODate): string {
  const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
  return [d === hoy ? 'hoy' : '', dow === 0 || dow === 6 ? 'finde' : ''].join(' ');
}
