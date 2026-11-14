import { useState } from 'react';
import {
  CONCEPTOS_ADICIONALES,
  ETIQUETA_CONCEPTO,
  ETIQUETA_TIPO_HAB,
  disponibilidad,
  agregarCargo,
  anular,
  checkIn,
  checkOut,
  diffDias,
  formatearRut,
  formatoCLP,
  formatoFecha,
  hoyISO,
  ingreso,
  marcarNoShow,
  multiplicar,
  nochesReservadas,
  salida,
  tarifaVigente,
  tramoVigente,
} from '../../domain';
import type { AccionRegistro, CargoAdicional, ModalidadNoShow, Registro, Resultado } from '../../domain';
import { nuevoId, useStore } from '../store';
import { Campo, InputCLP, Mensajes, Modal } from './ui';

type Dialogo = 'checkin' | 'checkout' | 'noshow' | 'cargo' | 'anular';

/** Botonera contextual según estado (flujo de recepción). */
export function AccionesRegistro({ r, compacto = false }: { r: Registro; compacto?: boolean }) {
  const [d, setD] = useState<Dialogo | null>(null);
  const b = (k: Dialogo, txt: string, cls = '') => (
    <button className={`btn ${compacto ? 'mini' : ''} ${cls}`} onClick={(e) => { e.stopPropagation(); setD(k); }}>{txt}</button>
  );
  return (
    <span className="acciones-fila" onClick={(e) => e.stopPropagation()}>
      {r.estado === 'RESERVADO' && <>{b('checkin', 'Check-in', 'primario')}{b('noshow', 'No show')}</>}
      {r.estado === 'IN_HOUSE' && <>{b('cargo', '+ Cargo')}{b('checkout', 'Check-out', 'primario')}</>}
      {!compacto && (r.estado === 'RESERVADO' || r.estado === 'IN_HOUSE') && b('anular', 'Anular', 'peligro')}
      {d && <DialogoAccion r={r} tipo={d} onClose={() => setD(null)} />}
    </span>
  );
}

function DialogoAccion({ r, tipo, onClose }: { r: Registro; tipo: Dialogo; onClose: () => void }) {
  const s = useStore();
  const hoy = hoyISO();
  const [fecha, setFecha] = useState(hoy);
  const [ajustar, setAjustar] = useState(true);
  const [modalidad, setModalidad] = useState<ModalidadNoShow>('TOTAL');
  const [nochesNS, setNochesNS] = useState(1);
  const [motivo, setMotivo] = useState('');
  const tv = tramoVigente(r, hoy) ?? r.tramos[r.tramos.length - 1]!;
  const [cargo, setCargo] = useState<CargoAdicional>(() => ({
    id: nuevoId(),
    fecha: hoy >= ingreso(r) && hoy <= salida(r) ? hoy : ingreso(r),
    hotelId: tv.hotelId,
    concepto: 'ALMUERZO',
    descripcion: '',
    cantidad: 1,
    precioUnitario: tarifaVigente(s.tarifas, tv.hotelId, 'ALMUERZO', hoy)?.monto ?? 0,
  }));
  const [errores, setErrores] = useState<string[]>([]);
  // Habitación al check-in: tramo de llegada según la fecha real.
  const tLlegada = r.tramos.find((t) => fecha >= t.desde && fecha < t.hasta) ?? r.tramos[0]!;
  const [habId, setHabId] = useState<string>(tLlegada.habitacionId ?? '');
  const requiereHab = tipo === 'checkin' && s.tieneInventario(tLlegada.hotelId);
  const desdeDisp = ajustar && fecha > tLlegada.desde ? fecha : tLlegada.desde;
  const dispLlegada = requiereHab && desdeDisp < tLlegada.hasta
    ? disponibilidad(s.registros, s.habitaciones, tLlegada.hotelId, desdeDisp, tLlegada.hasta, r.id)
    : [];
  const [ocupado, setOcupado] = useState(false);

  const setCargoP = (p: Partial<CargoAdicional>) => {
    const n = { ...cargo, ...p };
    if ('concepto' in p || 'fecha' in p) {
      const t = tramoVigente(r, n.fecha);
      if (t) n.hotelId = t.hotelId;
      const precio = tarifaVigente(s.tarifas, n.hotelId, n.concepto, n.fecha);
      if (precio) n.precioUnitario = precio.monto;
    }
    setCargo(n);
  };

  const ejecutar = async () => {
    // Check-in y check-out registran hechos ocurridos: no se aceptan fechas futuras.
    if ((tipo === 'checkin' || tipo === 'checkout') && fecha > hoy) {
      return setErrores([`La fecha de ${tipo === 'checkin' ? 'llegada' : 'salida'} real no puede ser futura (hoy ${formatoFecha(hoy)}).`]);
    }
    let res: Resultado<Registro>;
    let accion: AccionRegistro;
    switch (tipo) {
      case 'checkin': res = checkIn(r, fecha, { ajustarIngreso: ajustar, habitacionId: habId || null, requiereHabitacion: requiereHab }); accion = 'CHECK_IN'; break;
      case 'checkout': res = checkOut(r, fecha, { ajustarSalida: ajustar }); accion = 'CHECK_OUT'; break;
      case 'noshow': res = marcarNoShow(r, { modalidad, nochesCobradas: modalidad === 'PARCIAL' ? nochesNS : 0 }); accion = 'NO_SHOW'; break;
      case 'cargo': res = agregarCargo(r, cargo); accion = 'CARGO'; break;
      case 'anular': res = anular(r, motivo); accion = 'ANULADO'; break;
    }
    if (!res.ok) return setErrores([res.error]);
    setOcupado(true);
    const g = await s.guardarRegistro(r, res.valor, accion, res.detalle);
    setOcupado(false);
    if (!g.ok) return setErrores(g.errores);
    onClose();
  };

  const inProg = ingreso(r);
  const outProg = salida(r);
  const titulos: Record<Dialogo, string> = { checkin: 'Check-in', checkout: 'Check-out', noshow: 'Marcar no show', cargo: 'Agregar cargo al folio', anular: 'Anular registro' };
  const totalN = nochesReservadas(r);

  return (
    <Modal titulo={`${titulos[tipo]} · Folio ${r.folio}`} onClose={onClose} ancho={560}>
      <div className="ficha">
        <b>{r.huesped.nombre}</b> <span className="mono">{formatearRut(r.huesped.rut)}</span>
        <span>{s.nombreEmpresa(r.empresaId)}</span>
        <span>{r.tramos.map((t) => `${s.nombreHotel(t.hotelId)}${t.habitacionId ? ` (hab. ${s.nombreHabitacion(t.habitacionId)})` : ''}`).join(' → ')}</span>
        <span>IN {formatoFecha(inProg)} · OUT {formatoFecha(outProg)} · {totalN} noche(s)</span>
      </div>

      {(tipo === 'checkin' || tipo === 'checkout') && (
        <>
          <Campo label={tipo === 'checkin' ? 'Fecha de llegada real' : 'Fecha de salida real'} ancho={180}>
            <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          {tipo === 'checkin' && fecha > inProg && fecha < outProg && (
            <div className="opciones">
              <div className="msg warn">! Llegada tardía: {diffDias(inProg, fecha)} noche(s) después del ingreso programado.</div>
              <label><input type="radio" checked={ajustar} onChange={() => setAjustar(true)} /> Ajustar IN al {formatoFecha(fecha)} (no se cobran noches no usadas)</label>
              <label><input type="radio" checked={!ajustar} onChange={() => setAjustar(false)} /> Mantener IN {formatoFecha(inProg)} (se cobran desde la reserva)</label>
            </div>
          )}
          {tipo === 'checkout' && fecha !== outProg && fecha > inProg && (
            <div className="opciones">
              <div className="msg warn">! {fecha < outProg ? 'Salida anticipada' : 'Extensión de estadía'}: OUT programado {formatoFecha(outProg)}.</div>
              <label><input type="radio" checked={ajustar} onChange={() => setAjustar(true)} /> Ajustar OUT al {formatoFecha(fecha)} ({fecha < outProg ? 'se descuentan' : 'se agregan'} {Math.abs(diffDias(outProg, fecha))} noche(s))</label>
              <label><input type="radio" checked={!ajustar} onChange={() => setAjustar(false)} /> Mantener OUT {formatoFecha(outProg)}</label>
            </div>
          )}
        </>
      )}

      {requiereHab && (
        <Campo label={`Habitación en ${s.nombreHotel(tLlegada.hotelId)} (obligatoria)`} ancho={320}>
          <select value={habId} onChange={(e) => { setHabId(e.target.value); setErrores([]); }}>
            <option value="">— Seleccionar —</option>
            {dispLlegada.map((d) => (
              <option key={d.habitacion.id} value={d.habitacion.id} disabled={d.libres === 0 && d.habitacion.id !== tLlegada.habitacionId}>
                {d.habitacion.numero} · {ETIQUETA_TIPO_HAB[d.habitacion.tipo]} · {d.libres === 0 ? 'ocupada' : `${d.libres}/${d.habitacion.capacidad} libre`}
              </option>
            ))}
          </select>
        </Campo>
      )}

      {tipo === 'noshow' && (
        <div className="fila">
          <Campo label="Cobro" ancho={200}>
            <select value={modalidad} onChange={(e) => setModalidad(e.target.value as ModalidadNoShow)}>
              <option value="TOTAL">Total ({totalN} noches)</option>
              {totalN > 1 && <option value="PARCIAL">Parcial</option>}
              <option value="SIN_CARGO">Sin cargo</option>
            </select>
          </Campo>
          {modalidad === 'PARCIAL' && (
            <Campo label="Noches cobradas" ancho={120}>
              <input type="number" min={1} max={totalN - 1} value={nochesNS} onChange={(e) => setNochesNS(Number(e.target.value))} />
            </Campo>
          )}
        </div>
      )}

      {tipo === 'cargo' && (
        <>
          <div className="fila">
            <Campo label="Fecha" ancho={150}><input type="date" value={cargo.fecha} min={inProg} max={outProg} onChange={(e) => setCargoP({ fecha: e.target.value })} /></Campo>
            <Campo label="Concepto" ancho={150}>
              <select value={cargo.concepto} onChange={(e) => setCargoP({ concepto: e.target.value as CargoAdicional['concepto'] })}>
                {CONCEPTOS_ADICIONALES.map((c) => <option key={c} value={c}>{ETIQUETA_CONCEPTO[c]}</option>)}
              </select>
            </Campo>
            <Campo label="Hotel" ancho={170}>
              <select value={cargo.hotelId} onChange={(e) => setCargoP({ hotelId: e.target.value })}>
                {s.hoteles.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
              </select>
            </Campo>
          </div>
          <div className="fila">
            <Campo label="Descripción" ancho={220}><input value={cargo.descripcion} onChange={(e) => setCargoP({ descripcion: e.target.value })} /></Campo>
            <Campo label="Cantidad" ancho={80}><input type="number" min={1} step={1} value={cargo.cantidad} onChange={(e) => setCargoP({ cantidad: Number(e.target.value) })} /></Campo>
            <Campo label="P. unitario neto" ancho={120}><InputCLP value={cargo.precioUnitario} onChange={(v) => setCargoP({ precioUnitario: v })} /></Campo>
            <div className="dato-total">
              {Number.isSafeInteger(cargo.cantidad) && cargo.cantidad > 0 ? formatoCLP(multiplicar(cargo.precioUnitario, cargo.cantidad)) : '—'}
            </div>
          </div>
        </>
      )}

      {tipo === 'anular' && (
        <Campo label="Motivo de anulación (obligatorio)">
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
        </Campo>
      )}

      <Mensajes errores={errores} advertencias={[]} />
      <div className="acciones derecha">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className={`btn ${tipo === 'anular' ? 'peligro' : 'primario'}`} disabled={ocupado} onClick={ejecutar}>
          Confirmar {titulos[tipo].toLowerCase()}
        </button>
      </div>
    </Modal>
  );
}
