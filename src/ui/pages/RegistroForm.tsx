import { useMemo, useState } from 'react';
import {
  CONCEPTOS_ADICIONALES,
  ETIQUETA_CONCEPTO,
  ETIQUETA_ESTADO,
  diffDias,
  esFechaValida,
  formatearRut,
  formatoCLP,
  hoyISO,
  ingreso,
  multiplicar,
  nochesReservadas,
  formatoFecha,
  resumenRegistro,
  salida,
  sumarDias,
  tarifaVigente,
  validarRegistro,
} from '../../domain';
import { ETIQUETA_ACCION, perfilHuesped, validarRut } from '../../domain';
import type { CargoAdicional, Concepto, EstadoRegistro, ModalidadNoShow, Registro, Tramo } from '../../domain';
import { Campo, InputCLP, Mensajes, Modal } from '../components/ui';
import { nuevoId, useStore } from '../store';

export interface Prellenado {
  hotelId?: string;
  fecha?: string;
}

const ESTADOS: EstadoRegistro[] = ['RESERVADO', 'IN_HOUSE', 'CHECK_OUT', 'NO_SHOW', 'ANULADO'];

function registroVacio(hotelId: string, tarifa: number, fecha?: string): Registro {
  const hoy = fecha && esFechaValida(fecha) ? fecha : hoyISO();
  return {
    id: nuevoId(),
    folio: 0,
    huesped: { rut: '', nombre: '' },
    empresaId: '',
    solicitanteId: '',
    fechaSolicitud: hoyISO() < hoy ? hoyISO() : hoy,
    tramos: [{ id: nuevoId(), hotelId, desde: hoy, hasta: sumarDias(hoy, 1), tarifaNoche: tarifa, habitacion: '', motivo: '' }],
    adicionales: [],
    estado: 'RESERVADO',
    noShow: null,
    observaciones: '',
    historial: [],
    creadoEn: '',
    actualizadoEn: '',
  };
}

export function RegistroForm({ inicial, prellenado, onClose }: { inicial: Registro | null; prellenado?: Prellenado; onClose: () => void }) {
  const s = useStore();
  const hotelesActivos = s.hoteles.filter((h) => h.activo);
  const madre = hotelesActivos.find((h) => h.tipo === 'MADRE') ?? hotelesActivos[0];

  const nuevo = () => {
    const base = registroVacio(prellenado?.hotelId ?? madre?.id ?? '', 0, prellenado?.fecha);
    const t = base.tramos[0]!;
    t.tarifaNoche = tarifaVigente(s.tarifas, t.hotelId, 'ALOJAMIENTO', t.desde)?.monto ?? 0;
    return base;
  };
  const [r, setR] = useState<Registro>(() => (inicial ? structuredClone(inicial) : nuevo()));
  const [guardadoMsg, setGuardadoMsg] = useState('');
  const perfil = useMemo(
    () => (validarRut(r.huesped.rut) ? perfilHuesped(s.registros, r.huesped.rut, r.id) : null),
    [r.huesped.rut, r.id, s.registros],
  );

  /** Al reconocer un RUT con estadías previas, completa los datos vacíos (perfil de huésped). */
  const aplicarPerfil = () => {
    if (!perfil || inicial) return;
    setR((prev) => ({
      ...prev,
      huesped: { rut: formatearRut(prev.huesped.rut), nombre: prev.huesped.nombre.trim() ? prev.huesped.nombre : perfil.nombre },
      empresaId: prev.empresaId || (s.empresas.some((e) => e.id === perfil.ultimaEmpresaId && e.activo) ? perfil.ultimaEmpresaId : ''),
      solicitanteId: prev.solicitanteId || (s.solicitantes.some((x) => x.id === perfil.ultimoSolicitanteId && x.activo) ? perfil.ultimoSolicitanteId : ''),
    }));
  };
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');

  const precio = (hotelId: string, concepto: Concepto, fecha: string) =>
    esFechaValida(fecha) ? tarifaVigente(s.tarifas, hotelId, concepto, fecha)?.monto ?? null : null;

  const validacion = useMemo(
    () =>
      validarRegistro(r, {
        hoteles: s.hoteles,
        empresaIds: new Set(s.empresas.map((e) => e.id)),
        solicitanteIds: new Set(s.solicitantes.map((x) => x.id)),
        otrosRegistros: s.registros,
      }),
    [r, s.hoteles, s.empresas, s.solicitantes, s.registros],
  );
  const resumen = useMemo(() => {
    try {
      return validacion.errores.some((e) => e.includes('Tramo') || e.includes('Adicional')) ? null : resumenRegistro(r);
    } catch {
      return null;
    }
  }, [r, validacion]);

  // ───── Tramos ─────
  const setTramo = (i: number, patch: Partial<Tramo>) =>
    setR((prev) => {
      const tramos = prev.tramos.map((t) => ({ ...t }));
      const t = tramos[i]!;
      Object.assign(t, patch);
      // Al cambiar hotel o fecha de inicio, re-propone la tarifa vigente.
      if ('hotelId' in patch || 'desde' in patch) {
        const p = precio(t.hotelId, 'ALOJAMIENTO', t.desde);
        if (p !== null) t.tarifaNoche = p;
      }
      // Mantiene contigüidad: la salida de un tramo es el inicio del siguiente.
      if ('hasta' in patch && tramos[i + 1]) tramos[i + 1]!.desde = t.hasta;
      if ('desde' in patch && tramos[i - 1]) tramos[i - 1]!.hasta = t.desde;
      return { ...prev, tramos };
    });

  const agregarTramo = () =>
    setR((prev) => {
      const ult = prev.tramos[prev.tramos.length - 1]!;
      const otro = hotelesActivos.find((h) => h.id !== ult.hotelId) ?? hotelesActivos[0]!;
      const desde = ult.hasta;
      const t: Tramo = {
        id: nuevoId(),
        hotelId: otro.id,
        desde,
        hasta: esFechaValida(desde) ? sumarDias(desde, 1) : desde,
        tarifaNoche: precio(otro.id, 'ALOJAMIENTO', desde) ?? 0,
        habitacion: '',
        motivo: 'Derivación',
      };
      return { ...prev, tramos: [...prev.tramos, t] };
    });

  const quitarTramo = (i: number) =>
    setR((prev) => {
      if (prev.tramos.length <= 1) return prev;
      const tramos = prev.tramos.filter((_, j) => j !== i).map((t) => ({ ...t }));
      // Reconecta: el tramo siguiente hereda el inicio del eliminado.
      if (i > 0 && tramos[i]) tramos[i]!.desde = prev.tramos[i]!.desde;
      if (i === 0 && tramos[0]) tramos[0].desde = prev.tramos[0]!.desde;
      return { ...prev, tramos };
    });

  // ───── Adicionales ─────
  const setAdic = (i: number, patch: Partial<CargoAdicional>) =>
    setR((prev) => {
      const adicionales = prev.adicionales.map((a) => ({ ...a }));
      const a = adicionales[i]!;
      Object.assign(a, patch);
      if ('hotelId' in patch || 'concepto' in patch || 'fecha' in patch) {
        const p = precio(a.hotelId, a.concepto, a.fecha);
        if (p !== null) a.precioUnitario = p;
      }
      return { ...prev, adicionales };
    });

  const agregarAdic = () =>
    setR((prev) => {
      const t = prev.tramos[0]!;
      const a: CargoAdicional = {
        id: nuevoId(),
        fecha: t.desde,
        hotelId: t.hotelId,
        concepto: 'ALMUERZO',
        descripcion: '',
        cantidad: 1,
        precioUnitario: precio(t.hotelId, 'ALMUERZO', t.desde) ?? 0,
      };
      return { ...prev, adicionales: [...prev.adicionales, a] };
    });

  // ───── Guardar ─────
  const guardar = async (yNuevo = false) => {
    if (validacion.errores.length) return;
    setGuardando(true);
    setErrorGuardar('');
    try {
      const g = await s.guardarRegistro(inicial, r);
      if (!g.ok) return setErrorGuardar(g.errores.join(' '));
      if (yNuevo) {
        setGuardadoMsg(`Folio ${g.registro.folio} guardado: ${g.registro.huesped.nombre}.`);
        setR(nuevo());
      } else onClose();
    } catch (e) {
      setErrorGuardar(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  const solicitantesOrdenados = [...s.solicitantes.filter((x) => x.activo || x.id === r.solicitanteId)].sort(
    (a, b) => Number(b.empresaId === r.empresaId) - Number(a.empresaId === r.empresaId) || a.nombre.localeCompare(b.nombre),
  );
  const fechasTramosOk = r.tramos.every((t) => esFechaValida(t.desde) && esFechaValida(t.hasta) && t.hasta > t.desde);
  const totalReservadas = fechasTramosOk ? nochesReservadas(r) : 0;

  return (
    <Modal titulo={inicial ? `Registro folio ${inicial.folio}` : 'Nuevo registro'} onClose={onClose}>
      <section className="bloque">
        <h3>Huésped y derivación</h3>
        <div className="fila">
          <Campo label="RUT" ancho={140}>
            <input
              value={r.huesped.rut}
              onChange={(e) => setR({ ...r, huesped: { ...r.huesped, rut: e.target.value } })}
              onBlur={() => {
                setR({ ...r, huesped: { ...r.huesped, rut: formatearRut(r.huesped.rut) } });
                aplicarPerfil();
              }}
              placeholder="12.345.678-9"
              autoFocus
            />
          </Campo>
          <Campo label="Nombre completo" ancho={260}>
            <input value={r.huesped.nombre} onChange={(e) => setR({ ...r, huesped: { ...r.huesped, nombre: e.target.value } })} />
          </Campo>
          <Campo label="Empresa contratante" ancho={220}>
            <select value={r.empresaId} onChange={(e) => setR({ ...r, empresaId: e.target.value })}>
              <option value="">— Seleccionar —</option>
              {s.empresas.filter((x) => x.activo || x.id === r.empresaId).map((x) => (
                <option key={x.id} value={x.id}>{x.razonSocial}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Solicitante (deriva)" ancho={200}>
            <select value={r.solicitanteId} onChange={(e) => setR({ ...r, solicitanteId: e.target.value })}>
              <option value="">— Seleccionar —</option>
              {solicitantesOrdenados.map((x) => (
                <option key={x.id} value={x.id}>{x.nombre}{x.cargo ? ` · ${x.cargo}` : ''}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Fecha solicitud" ancho={140}>
            <input type="date" value={r.fechaSolicitud} onChange={(e) => setR({ ...r, fechaSolicitud: e.target.value })} />
          </Campo>
        </div>
        {perfil && (
          <div className="msg info">
            Huésped conocido: {perfil.estadias} estadía(s) previa(s), última salida {formatoFecha(perfil.ultimaSalida)} · {s.nombreEmpresa(perfil.ultimaEmpresaId)}
            {perfil.nombre.trim().toLowerCase() !== r.huesped.nombre.trim().toLowerCase() && r.huesped.nombre.trim() && (
              <b> · Nombre registrado previamente: "{perfil.nombre}"</b>
            )}
          </div>
        )}
        <div className="fila">
          <Campo label={inicial ? 'Estado (corrección manual)' : 'Estado'} ancho={170}>
            <select
              value={r.estado}
              onChange={(e) => {
                const estado = e.target.value as EstadoRegistro;
                setR({ ...r, estado, noShow: estado === 'NO_SHOW' ? r.noShow ?? { modalidad: 'TOTAL', nochesCobradas: 0 } : null });
              }}
            >
              {ESTADOS.map((x) => <option key={x} value={x}>{ETIQUETA_ESTADO[x]}</option>)}
            </select>
          </Campo>
          {r.estado === 'NO_SHOW' && r.noShow && (
            <>
              <Campo label="Cobro no show" ancho={160}>
                <select
                  value={r.noShow.modalidad}
                  onChange={(e) => setR({ ...r, noShow: { modalidad: e.target.value as ModalidadNoShow, nochesCobradas: r.noShow!.nochesCobradas || 1 } })}
                >
                  <option value="TOTAL">Total ({totalReservadas} n)</option>
                  <option value="PARCIAL">Parcial</option>
                  <option value="SIN_CARGO">Sin cargo</option>
                </select>
              </Campo>
              {r.noShow.modalidad === 'PARCIAL' && (
                <Campo label="Noches cobradas" ancho={110}>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, totalReservadas - 1)}
                    value={r.noShow.nochesCobradas}
                    onChange={(e) => setR({ ...r, noShow: { ...r.noShow!, nochesCobradas: Number(e.target.value) } })}
                  />
                </Campo>
              )}
            </>
          )}
          <div className="dato-calc">
            <span>IN</span><b>{ingreso(r) || '—'}</b>
            <span>OUT (11:00)</span><b>{salida(r) || '—'}</b>
            <span>Noches reservadas</span><b>{totalReservadas}</b>
          </div>
        </div>
      </section>

      <section className="bloque">
        <div className="bloque-cab">
          <h3>Tramos de alojamiento <small>(tarifa neta, incluye desayuno)</small></h3>
          <button className="btn" onClick={agregarTramo} disabled={hotelesActivos.length === 0}>+ Derivación / cambio de tarifa</button>
        </div>
        <table className="tabla compacta">
          <thead>
            <tr><th>#</th><th>Hotel</th><th>Ingreso</th><th>Salida</th><th className="num">Noches</th><th className="num">Tarifa/noche</th><th className="num">Subtotal</th><th>Hab.</th><th>Motivo</th><th /></tr>
          </thead>
          <tbody>
            {r.tramos.map((t, i) => {
              const n = esFechaValida(t.desde) && esFechaValida(t.hasta) ? diffDias(t.desde, t.hasta) : 0;
              const sugerida = precio(t.hotelId, 'ALOJAMIENTO', t.desde);
              return (
                <tr key={t.id}>
                  <td>{i + 1}</td>
                  <td>
                    <select value={t.hotelId} onChange={(e) => setTramo(i, { hotelId: e.target.value })}>
                      {s.hoteles.filter((h) => h.activo || h.id === t.hotelId).map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
                    </select>
                  </td>
                  <td><input type="date" value={t.desde} onChange={(e) => setTramo(i, { desde: e.target.value })} /></td>
                  <td><input type="date" value={t.hasta} onChange={(e) => setTramo(i, { hasta: e.target.value })} /></td>
                  <td className="num">{n > 0 ? n : '—'}</td>
                  <td className="num">
                    <InputCLP value={t.tarifaNoche} onChange={(v) => setTramo(i, { tarifaNoche: v })} />
                    {sugerida === null ? <div className="hint warn">Sin tarifa vigente</div> : sugerida !== t.tarifaNoche ? <div className="hint">Tarifario: {formatoCLP(sugerida)}</div> : null}
                  </td>
                  <td className="num">{n > 0 && Number.isSafeInteger(t.tarifaNoche) ? formatoCLP(multiplicar(t.tarifaNoche, n)) : '—'}</td>
                  <td><input value={t.habitacion} onChange={(e) => setTramo(i, { habitacion: e.target.value })} style={{ width: 64 }} placeholder="—" /></td>
                  <td><input value={t.motivo} onChange={(e) => setTramo(i, { motivo: e.target.value })} placeholder={i === 0 ? 'Asignación inicial' : 'Motivo'} /></td>
                  <td>{r.tramos.length > 1 && <button className="btn-icono" onClick={() => quitarTramo(i)} aria-label="Quitar tramo">×</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="bloque">
        <div className="bloque-cab">
          <h3>Servicios adicionales</h3>
          <button className="btn" onClick={agregarAdic}>+ Adicional</button>
        </div>
        {r.adicionales.length === 0 ? (
          <div className="hint">Sin adicionales. Almuerzo, cena, colación, bebidas, agua, etc.</div>
        ) : (
          <table className="tabla compacta">
            <thead>
              <tr><th>Fecha</th><th>Hotel</th><th>Concepto</th><th>Descripción</th><th className="num">Cant.</th><th className="num">P. unitario</th><th className="num">Subtotal</th><th /></tr>
            </thead>
            <tbody>
              {r.adicionales.map((a, i) => (
                <tr key={a.id}>
                  <td><input type="date" value={a.fecha} onChange={(e) => setAdic(i, { fecha: e.target.value })} /></td>
                  <td>
                    <select value={a.hotelId} onChange={(e) => setAdic(i, { hotelId: e.target.value })}>
                      {s.hoteles.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={a.concepto} onChange={(e) => setAdic(i, { concepto: e.target.value as CargoAdicional['concepto'] })}>
                      {CONCEPTOS_ADICIONALES.map((c) => <option key={c} value={c}>{ETIQUETA_CONCEPTO[c]}</option>)}
                    </select>
                  </td>
                  <td><input value={a.descripcion} onChange={(e) => setAdic(i, { descripcion: e.target.value })} /></td>
                  <td className="num"><input className="num" type="number" min={1} step={1} value={a.cantidad} onChange={(e) => setAdic(i, { cantidad: Number(e.target.value) })} style={{ width: 60 }} /></td>
                  <td className="num"><InputCLP value={a.precioUnitario} onChange={(v) => setAdic(i, { precioUnitario: v })} /></td>
                  <td className="num">{Number.isSafeInteger(a.cantidad) && a.cantidad > 0 ? formatoCLP(multiplicar(a.precioUnitario, a.cantidad)) : '—'}</td>
                  <td><button className="btn-icono" onClick={() => setR({ ...r, adicionales: r.adicionales.filter((x) => x.id !== a.id) })} aria-label="Quitar adicional">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="bloque">
        <Campo label="Observaciones">
          <textarea rows={2} value={r.observaciones} onChange={(e) => setR({ ...r, observaciones: e.target.value })} />
        </Campo>
      </section>

      {inicial && r.historial.length > 0 && (
        <section className="bloque">
          <h3>Bitácora</h3>
          <table className="tabla compacta">
            <thead><tr><th>Fecha / hora</th><th>Operador</th><th>Acción</th><th>Detalle</th></tr></thead>
            <tbody>
              {[...r.historial].reverse().map((ev, i) => (
                <tr key={i}>
                  <td>{new Date(ev.en).toLocaleString('es-CL')}</td>
                  <td>{ev.usuario}</td>
                  <td>{ETIQUETA_ACCION[ev.accion]}</td>
                  <td className="ajustar">{ev.detalle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <Mensajes errores={validacion.errores} advertencias={validacion.advertencias} />
      {errorGuardar && <div className="msg err">✕ {errorGuardar}</div>}
      {guardadoMsg && <div className="msg ok">✓ {guardadoMsg}</div>}
      {!s.operador.trim() && <div className="msg warn">! Indique el operador responsable en la barra superior para poder guardar.</div>}

      <footer className="modal-pie">
        <div className="resumen">
          {resumen ? (
            <>
              <span>Noches cobrables <b>{resumen.noches}</b></span>
              <span>Alojamiento <b>{formatoCLP(resumen.alojamiento)}</b></span>
              <span>Adicionales <b>{formatoCLP(resumen.adicionales)}</b></span>
              <span className="total">Neto <b>{formatoCLP(resumen.total)}</b></span>
            </>
          ) : <span className="hint">Corrija los errores para ver el cálculo.</span>}
        </div>
        <div className="acciones">
          <button className="btn" onClick={onClose}>Cancelar</button>
          {!inicial && (
            <button className="btn" onClick={() => guardar(true)} disabled={guardando || validacion.errores.length > 0 || !s.operador.trim()}>
              Guardar y nuevo
            </button>
          )}
          <button className="btn primario" onClick={() => guardar()} disabled={guardando || validacion.errores.length > 0 || !s.operador.trim()}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </footer>
    </Modal>
  );
}
