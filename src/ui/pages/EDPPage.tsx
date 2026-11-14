import { useMemo, useState } from 'react';
import {
  CONCEPTOS_ADICIONALES,
  ETIQUETA_CONCEPTO,
  calcularEDP,
  edpACSV,
  etiquetaEstado,
  formatearRut,
  formatoCLP,
  formatoFecha,
  formatoNumero,
  hoyISO,
  primerDiaMes,
  ultimoDiaMes,
} from '../../domain';
import type { EstadoPago, FiltroEDP, ResultadoEDP, Subtotal } from '../../domain';
import { Campo, Kpi, Vacio, descargar } from '../components/ui';
import { ahora, nuevoId, useStore } from '../store';

export function EDPPage() {
  const s = useStore();
  const hoy = hoyISO();
  const [filtro, setFiltro] = useState<FiltroEDP>({ desde: primerDiaMes(hoy), hasta: ultimoDiaMes(hoy), hotelId: null, empresaId: null });
  const [viendo, setViendo] = useState<EstadoPago | null>(null);
  const [msg, setMsg] = useState('');

  const calculo = useMemo((): { res: ResultadoEDP | null; error: string } => {
    try {
      return { res: calcularEDP(s.registros, filtro), error: '' };
    } catch (e) {
      return { res: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [s.registros, filtro]);

  const res = viendo ? viendo.resultado : calculo.res;

  // Un EDP emitido muestra los nombres congelados al emitir; el borrador, los vigentes.
  const congelado = (vivo: (id: string) => string) => (id: string) => viendo?.etiquetas[id] ?? vivo(id);
  const n = {
    hotel: congelado(s.nombreHotel),
    empresa: congelado(s.nombreEmpresa),
    solicitante: congelado(s.nombreSolicitante),
  };

  const exportar = (r: ResultadoEDP, sufijo: string) =>
    descargar(
      `EDP_${r.filtro.desde}_${r.filtro.hasta}${sufijo}.csv`,
      edpACSV(r, n),
      'text/csv;charset=utf-8',
    );

  const emitir = async () => {
    if (!calculo.res || calculo.res.lineas.length === 0) return;
    const adv = calculo.res.advertencias.length;
    const ok = window.confirm(
      `Emitir EDP ${formatoFecha(filtro.desde)} – ${formatoFecha(filtro.hasta)} por ${formatoCLP(calculo.res.totales.total)} neto.` +
        (adv ? `\n\nATENCIÓN: ${adv} registro(s) no cerrados (reservado / in-house).` : '') +
        '\n\nEl snapshot emitido queda congelado y no se recalcula.',
    );
    if (!ok) return;
    const correlativo = await s.repo.siguiente('correlativoEDP');
    await s.repo.estadosPago.upsert({
      id: nuevoId(),
      correlativo,
      filtro: { ...filtro },
      emitidoEn: ahora(),
      estado: 'EMITIDO',
      observaciones: '',
      resultado: calculo.res,
      etiquetas: Object.fromEntries([
        ...s.hoteles.map((h) => [h.id, h.nombre]),
        ...s.empresas.map((e) => [e.id, e.razonSocial]),
        ...s.solicitantes.map((x) => [x.id, x.nombre]),
      ]),
    });
    await s.recargar();
    setMsg(`EDP N° ${correlativo} emitido.`);
  };

  const anular = async (e: EstadoPago) => {
    const motivo = window.prompt(`Motivo de anulación del EDP N° ${e.correlativo}:`);
    if (!motivo?.trim()) return;
    await s.repo.estadosPago.upsert({ ...e, estado: 'ANULADO', observaciones: `ANULADO ${ahora()}: ${motivo.trim()}` });
    await s.recargar();
    setViendo(null);
  };

  const conceptos = res ? CONCEPTOS_ADICIONALES.filter((c) => res.adicionalesPorConcepto[c]) : [];
  const emitidos = [...s.estadosPago].sort((a, b) => b.correlativo - a.correlativo);

  return (
    <div className="pagina">
      <div className="barra no-print">
        <Campo label="Desde (noche)"><input type="date" value={filtro.desde} disabled={!!viendo} onChange={(e) => setFiltro({ ...filtro, desde: e.target.value })} /></Campo>
        <Campo label="Hasta (noche, incl.)"><input type="date" value={filtro.hasta} disabled={!!viendo} onChange={(e) => setFiltro({ ...filtro, hasta: e.target.value })} /></Campo>
        <Campo label="Hotel">
          <select value={filtro.hotelId ?? ''} disabled={!!viendo} onChange={(e) => setFiltro({ ...filtro, hotelId: e.target.value || null })}>
            <option value="">Consolidado (todos)</option>
            {s.hoteles.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
          </select>
        </Campo>
        <Campo label="Empresa">
          <select value={filtro.empresaId ?? ''} disabled={!!viendo} onChange={(e) => setFiltro({ ...filtro, empresaId: e.target.value || null })}>
            <option value="">Todas</option>
            {s.empresas.map((x) => <option key={x.id} value={x.id}>{x.razonSocial}</option>)}
          </select>
        </Campo>
        <div className="espaciador" />
        {viendo ? (
          <>
            <button className="btn" onClick={() => setViendo(null)}>← Volver a cálculo vigente</button>
            <button className="btn" onClick={() => exportar(viendo.resultado, `_N${viendo.correlativo}`)}>Exportar CSV</button>
            <button className="btn" onClick={() => window.print()}>Imprimir</button>
            {viendo.estado === 'EMITIDO' && s.puedeEscribir && <button className="btn peligro" onClick={() => anular(viendo)}>Anular</button>}
          </>
        ) : (
          <>
            <button className="btn" disabled={!res?.lineas.length} onClick={() => res && exportar(res, '_borrador')}>Exportar CSV</button>
            <button className="btn" disabled={!res?.lineas.length} onClick={() => window.print()}>Imprimir</button>
            <button className="btn primario" disabled={!res?.lineas.length || !s.puedeEscribir} onClick={emitir}>Emitir EDP</button>
          </>
        )}
      </div>

      {msg && <div className="msg ok no-print">✓ {msg}</div>}
      {calculo.error && !viendo && <div className="msg err">✕ {calculo.error}</div>}

      {res && (
        <>
          <div className="encabezado-edp">
            <h2>
              Estado de Pago {viendo ? `N° ${viendo.correlativo}` : <span className="tag">BORRADOR</span>}
              {viendo?.estado === 'ANULADO' && <span className="tag rojo">ANULADO</span>}
            </h2>
            <div>
              Período: noches del <b>{formatoFecha(res.filtro.desde)}</b> al <b>{formatoFecha(res.filtro.hasta)}</b> ·{' '}
              {res.filtro.hotelId ? n.hotel(res.filtro.hotelId) : 'Consolidado todos los hoteles'} ·{' '}
              {res.filtro.empresaId ? n.empresa(res.filtro.empresaId) : 'Todas las empresas'}
              {viendo && <> · Emitido {new Date(viendo.emitidoEn).toLocaleString('es-CL')}</>}
            </div>
            {viendo?.observaciones && <div className="hint">{viendo.observaciones}</div>}
          </div>

          <div className="kpis">
            <Kpi label="Total pasajeros" valor={formatoNumero(res.totales.pasajeros)} sub="RUT distintos" />
            <Kpi label="Total noches" valor={formatoNumero(res.totales.noches)} />
            <Kpi label="Alojamiento" valor={formatoCLP(res.totales.alojamiento)} sub="Σ noches × tarifa" />
            <Kpi label="Adicionales" valor={formatoCLP(res.totales.adicionales)} />
            <Kpi label="Monto neto a cobrar" valor={formatoCLP(res.totales.total)} />
          </div>

          {res.advertencias.length > 0 && (
            <div className="mensajes">
              {res.advertencias.map((a) => <div key={a.registroId} className="msg warn">! Folio {a.folio}: {a.mensaje}</div>)}
            </div>
          )}

          {res.lineas.length === 0 ? (
            <Vacio>Sin noches ni adicionales imputables al período.</Vacio>
          ) : (
            <>
              <div className="grid-3">
                <TablaSubtotal titulo="Por hotel (un derivado cuenta en cada hotel)" filas={res.porHotel} nombre={n.hotel} />
                <TablaSubtotal titulo="Por empresa" filas={res.porEmpresa} nombre={n.empresa} />
                <div className="panel">
                  <h3>Adicionales por concepto</h3>
                  <table className="tabla compacta">
                    <tbody>
                      {conceptos.length === 0 && <tr><td className="hint">Sin adicionales</td></tr>}
                      {conceptos.map((c) => (
                        <tr key={c}><td>{ETIQUETA_CONCEPTO[c]}</td><td className="num">{formatoCLP(res.adicionalesPorConcepto[c] ?? 0)}</td></tr>
                      ))}
                    </tbody>
                    <tfoot><tr><td>Total</td><td className="num">{formatoCLP(res.totales.adicionales)}</td></tr></tfoot>
                  </table>
                </div>
              </div>

              <div className="panel">
                <h3>Detalle por huésped</h3>
                <div className="tabla-scroll">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th className="num">Folio</th><th>RUT</th><th>Nombre</th><th>Empresa</th><th>Solicitante</th><th>F. solic.</th>
                        <th>Hotel</th><th>IN</th><th>OUT</th><th>Estado</th><th className="num">Noches</th><th>Tarifa</th>
                        <th className="num">Alojamiento</th>
                        {conceptos.map((c) => <th key={c} className="num">{ETIQUETA_CONCEPTO[c]}</th>)}
                        <th className="num">Neto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {res.lineas.map((l) => (
                        <tr key={`${l.registroId}-${l.hotelId}`}>
                          <td className="num">{l.folio}</td>
                          <td className="mono">{formatearRut(l.rut)}</td>
                          <td>{l.nombre}</td>
                          <td>{n.empresa(l.empresaId)}</td>
                          <td>{n.solicitante(l.solicitanteId)}</td>
                          <td>{formatoFecha(l.fechaSolicitud)}</td>
                          <td>{n.hotel(l.hotelId).replace(/^Hotel /, '')}{l.derivado && <span className="tag">deriv.</span>}</td>
                          <td>{formatoFecha(l.ingreso)}</td>
                          <td>{formatoFecha(l.salida)}</td>
                          <td>{etiquetaEstado(l)}</td>
                          <td className="num">{l.noches}</td>
                          <td className="mono pequeño">{l.detalleTarifas.map((d) => `${d.noches}×${formatoNumero(d.tarifa)}`).join(' + ') || '—'}</td>
                          <td className="num">{formatoCLP(l.alojamiento)}</td>
                          {conceptos.map((c) => <td key={c} className="num">{l.adicionalesPorConcepto[c] ? formatoCLP(l.adicionalesPorConcepto[c]!) : '—'}</td>)}
                          <td className="num"><b>{formatoCLP(l.total)}</b></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={10}>{res.totales.pasajeros} pasajeros · {res.lineas.length} líneas</td>
                        <td className="num">{res.totales.noches}</td>
                        <td />
                        <td className="num">{formatoCLP(res.totales.alojamiento)}</td>
                        {conceptos.map((c) => <td key={c} className="num">{formatoCLP(res.adicionalesPorConcepto[c] ?? 0)}</td>)}
                        <td className="num">{formatoCLP(res.totales.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      <div className="panel no-print">
        <h3>Estados de pago emitidos</h3>
        {emitidos.length === 0 ? (
          <div className="hint">Aún no hay EDP emitidos.</div>
        ) : (
          <table className="tabla compacta">
            <thead>
              <tr><th className="num">N°</th><th>Período</th><th>Hotel</th><th>Empresa</th><th>Emitido</th><th className="num">Pasajeros</th><th className="num">Noches</th><th className="num">Neto</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {emitidos.map((e) => (
                <tr key={e.id} className={`clic ${e.estado === 'ANULADO' ? 'anulado' : ''} ${viendo?.id === e.id ? 'sel' : ''}`} onClick={() => setViendo(e)}>
                  <td className="num">{e.correlativo}</td>
                  <td>{formatoFecha(e.filtro.desde)} – {formatoFecha(e.filtro.hasta)}</td>
                  <td>{e.filtro.hotelId ? e.etiquetas[e.filtro.hotelId] ?? s.nombreHotel(e.filtro.hotelId) : 'Consolidado'}</td>
                  <td>{e.filtro.empresaId ? e.etiquetas[e.filtro.empresaId] ?? s.nombreEmpresa(e.filtro.empresaId) : 'Todas'}</td>
                  <td>{new Date(e.emitidoEn).toLocaleString('es-CL')}</td>
                  <td className="num">{e.resultado.totales.pasajeros}</td>
                  <td className="num">{e.resultado.totales.noches}</td>
                  <td className="num">{formatoCLP(e.resultado.totales.total)}</td>
                  <td>{e.estado === 'EMITIDO' ? 'Emitido' : 'Anulado'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function TablaSubtotal({ titulo, filas, nombre }: { titulo: string; filas: Subtotal[]; nombre: (id: string) => string }) {
  return (
    <div className="panel">
      <h3>{titulo}</h3>
      <table className="tabla compacta">
        <thead><tr><th /><th className="num">Pax</th><th className="num">Noches</th><th className="num">Aloj.</th><th className="num">Adic.</th><th className="num">Neto</th></tr></thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.clave}>
              <td>{nombre(f.clave)}</td>
              <td className="num">{f.pasajeros}</td>
              <td className="num">{f.noches}</td>
              <td className="num">{formatoCLP(f.alojamiento)}</td>
              <td className="num">{formatoCLP(f.adicionales)}</td>
              <td className="num"><b>{formatoCLP(f.total)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
