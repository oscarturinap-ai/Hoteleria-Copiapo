import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { ETIQUETA_ESTADO, formatoFecha, hoyISO, ingreso, limpiarRut, noches, salida, sumarDias } from '../../domain';
import type { Id, ISODate, Registro } from '../../domain';
import { useStore } from '../store';
import { RegistroForm, type Prellenado } from './RegistroForm';

const DIAS_SEMANA = ['do', 'lu', 'ma', 'mi', 'ju', 'vi', 'sá'];

interface Fila {
  r: Registro;
  noches: Set<ISODate>;
  habitacion: string;
}

export function CalendarioPage() {
  const s = useStore();
  const hoy = hoyISO();
  const [inicio, setInicio] = useState(sumarDias(hoy, -2));
  const [dias, setDias] = useState(14);
  const [hotelF, setHotelF] = useState('');
  const [q, setQ] = useState('');
  const [verNoShow, setVerNoShow] = useState(true);
  const [abierto, setAbierto] = useState<{ r: Registro | null; pre?: Prellenado } | null>(null);

  const fin = sumarDias(inicio, dias); // exclusivo
  const columnas = useMemo(() => noches(inicio, fin), [inicio, fin]);

  const grupos = useMemo(() => {
    const texto = q.trim().toLowerCase();
    const rutQ = limpiarRut(q);
    const porHotel = new Map<Id, Fila[]>();
    for (const r of s.registros) {
      if (r.estado === 'ANULADO' || r.tramos.length === 0) continue;
      if (r.estado === 'NO_SHOW' && !verNoShow) continue;
      if (ingreso(r) >= fin || salida(r) <= inicio) continue;
      if (texto && !r.huesped.nombre.toLowerCase().includes(texto) && !(rutQ.length >= 3 && limpiarRut(r.huesped.rut).includes(rutQ)) && String(r.folio) !== texto) continue;
      // Una fila por (registro × hotel): una derivación aparece en ambos hoteles.
      const porH = new Map<Id, Fila>();
      for (const t of r.tramos) {
        if (hotelF && t.hotelId !== hotelF) continue;
        const f = porH.get(t.hotelId) ?? { r, noches: new Set<ISODate>(), habitacion: '' };
        for (const n of noches(t.desde, t.hasta)) if (n >= inicio && n < fin) f.noches.add(n);
        if (t.habitacion) f.habitacion = t.habitacion;
        porH.set(t.hotelId, f);
      }
      for (const [h, f] of porH) {
        if (f.noches.size === 0) continue;
        const arr = porHotel.get(h) ?? [];
        arr.push(f);
        porHotel.set(h, arr);
      }
    }
    return s.hoteles
      .filter((h) => (hotelF ? h.id === hotelF : h.activo || porHotel.has(h.id)))
      .map((h) => ({
        hotel: h,
        filas: (porHotel.get(h.id) ?? []).sort((a, b) => [...a.noches][0]!.localeCompare([...b.noches][0]!) || a.r.folio - b.r.folio),
      }));
  }, [s.registros, s.hoteles, inicio, fin, hotelF, q, verNoShow]);

  const ocupacion = (filas: Fila[], d: ISODate) => filas.filter((f) => f.noches.has(d) && f.r.estado !== 'NO_SHOW').length;

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

  return (
    <div className="pagina">
      <div className="barra">
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
              <th className="col-fija">Huésped</th>
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
            {grupos.map(({ hotel, filas }) => (
              <Fragment key={hotel.id}>
                <tr className="fila-hotel">
                  <td className="col-fija">
                    <b>{hotel.nombre}</b> <span className="tag">{hotel.tipo === 'MADRE' ? 'madre' : 'convenio'}</span>
                  </td>
                  {columnas.map((d) => (
                    <td
                      key={d}
                      className={`ocup ${claseDia(d, hoy)}`}
                      title={`Nuevo registro en ${hotel.nombre} con ingreso ${formatoFecha(d)}`}
                      onClick={() => hotel.activo && setAbierto({ r: null, pre: { hotelId: hotel.id, fecha: d } })}
                    >
                      {ocupacion(filas, d) || ''}
                    </td>
                  ))}
                </tr>
                {filas.length === 0 && (
                  <tr><td className="col-fija hint">Sin estadías en el rango</td><td colSpan={columnas.length} /></tr>
                )}
                {filas.map((f) => (
                  <tr key={`${f.r.id}-${hotel.id}`} className="clic" onClick={() => setAbierto({ r: f.r })}>
                    <td className="col-fija">
                      <span className="folio">{f.r.folio}</span> {f.r.huesped.nombre}
                      {f.habitacion && <span className="tag">hab. {f.habitacion}</span>}
                    </td>
                    {celdas(f)}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="hint">Clic en la fila del hotel (cifra de ocupación) para crear un registro con ese hotel e ingreso. Clic en un huésped para abrir su registro.</div>

      {abierto && <RegistroForm inicial={abierto.r} prellenado={abierto.pre} onClose={() => setAbierto(null)} />}
    </div>
  );
}

function claseDia(d: ISODate, hoy: ISODate): string {
  const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
  return [d === hoy ? 'hoy' : '', dow === 0 || dow === 6 ? 'finde' : ''].join(' ');
}
