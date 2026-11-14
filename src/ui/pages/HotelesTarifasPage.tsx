import { useState } from 'react';
import {
  CONCEPTOS_ADICIONALES,
  ETIQUETA_CONCEPTO,
  esFechaValida,
  formatoCLP,
  formatoFecha,
  hoyISO,
  solapamientosTarifa,
  sumarDias,
  tarifaVigente,
} from '../../domain';
import type { Concepto, Hotel, Tarifa, TipoHotel } from '../../domain';
import { Campo, InputCLP } from '../components/ui';
import { nuevoId, useStore } from '../store';
import { InventarioHabitaciones } from './InventarioHabitaciones';

const CONCEPTOS: Concepto[] = ['ALOJAMIENTO', ...CONCEPTOS_ADICIONALES];

export function HotelesTarifasPage() {
  const s = useStore();
  const hoy = hoyISO();
  const [nueva, setNueva] = useState<Omit<Tarifa, 'id'>>({
    hotelId: s.hoteles[0]?.id ?? '',
    concepto: 'ALOJAMIENTO',
    monto: 0,
    vigenteDesde: hoy,
    vigenteHasta: null,
  });
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [nuevoHotel, setNuevoHotel] = useState('');

  const solapes = solapamientosTarifa(s.tarifas);

  const agregarTarifa = async () => {
    setError('');
    setAviso('');
    if (!nueva.hotelId) return setError('Seleccione hotel.');
    if (!Number.isSafeInteger(nueva.monto) || nueva.monto <= 0) return setError('Monto debe ser un entero > 0.');
    if (!esFechaValida(nueva.vigenteDesde)) return setError('Fecha de inicio inválida.');
    if (nueva.vigenteHasta && nueva.vigenteHasta < nueva.vigenteDesde) return setError('Vigencia hasta anterior a desde.');

    // Cierre automático de la tarifa abierta anterior del mismo hotel/concepto.
    const abierta = s.tarifas.find(
      (t) => t.hotelId === nueva.hotelId && t.concepto === nueva.concepto && t.vigenteHasta === null && t.vigenteDesde < nueva.vigenteDesde,
    );
    if (abierta) {
      const cierre = sumarDias(nueva.vigenteDesde, -1);
      await s.repo.tarifas.upsert({ ...abierta, vigenteHasta: cierre });
      setAviso(`Tarifa anterior (${formatoCLP(abierta.monto)}) cerrada al ${formatoFecha(cierre)}.`);
    }
    await s.repo.tarifas.upsert({ ...nueva, id: nuevoId() });
    await s.recargar();
    setNueva({ ...nueva, monto: 0 });
  };

  const eliminarTarifa = async (t: Tarifa) => {
    if (!window.confirm(`¿Eliminar tarifa ${ETIQUETA_CONCEPTO[t.concepto]} ${formatoCLP(t.monto)}? Los registros existentes conservan su tarifa (snapshot).`)) return;
    await s.repo.tarifas.remove(t.id);
    await s.recargar();
  };

  const guardarHotel = async (h: Hotel) => {
    await s.repo.hoteles.upsert(h);
    await s.recargar();
  };

  return (
    <div className="pagina">
      <div className="panel">
        <h3>Hoteles</h3>
        <table className="tabla compacta">
          <thead>
            <tr><th>Nombre</th><th>Tipo</th><th>Activo</th><th className="num">Alojamiento vigente hoy</th></tr>
          </thead>
          <tbody>
            {s.hoteles.map((h) => {
              const t = tarifaVigente(s.tarifas, h.id, 'ALOJAMIENTO', hoy);
              return (
                <tr key={h.id}>
                  <td><input defaultValue={h.nombre} onBlur={(e) => e.target.value.trim() && e.target.value !== h.nombre && guardarHotel({ ...h, nombre: e.target.value.trim() })} /></td>
                  <td>
                    <select value={h.tipo} onChange={(e) => guardarHotel({ ...h, tipo: e.target.value as TipoHotel })}>
                      <option value="MADRE">Hotel madre</option>
                      <option value="CONVENIO">Convenio</option>
                    </select>
                  </td>
                  <td><input type="checkbox" checked={h.activo} onChange={(e) => guardarHotel({ ...h, activo: e.target.checked })} /></td>
                  <td className="num">{t ? formatoCLP(t.monto) : <span className="hint warn">Sin tarifa</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="fila">
          <input placeholder="Nuevo hotel en convenio" value={nuevoHotel} onChange={(e) => setNuevoHotel(e.target.value)} />
          <button
            className="btn"
            disabled={!nuevoHotel.trim()}
            onClick={async () => {
              await guardarHotel({ id: nuevoId(), nombre: nuevoHotel.trim(), tipo: 'CONVENIO', activo: true });
              setNuevoHotel('');
            }}
          >
            + Agregar hotel
          </button>
        </div>
      </div>

      <InventarioHabitaciones />

      <div className="panel">
        <h3>Tarifario neto <small>(alojamiento incluye desayuno)</small></h3>
        <div className="fila">
          <Campo label="Hotel">
            <select value={nueva.hotelId} onChange={(e) => setNueva({ ...nueva, hotelId: e.target.value })}>
              {s.hoteles.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
            </select>
          </Campo>
          <Campo label="Concepto">
            <select value={nueva.concepto} onChange={(e) => setNueva({ ...nueva, concepto: e.target.value as Concepto })}>
              {CONCEPTOS.map((c) => <option key={c} value={c}>{ETIQUETA_CONCEPTO[c]}</option>)}
            </select>
          </Campo>
          <Campo label="Monto neto" ancho={120}><InputCLP value={nueva.monto} onChange={(v) => setNueva({ ...nueva, monto: v })} /></Campo>
          <Campo label="Vigente desde"><input type="date" value={nueva.vigenteDesde} onChange={(e) => setNueva({ ...nueva, vigenteDesde: e.target.value })} /></Campo>
          <Campo label="Vigente hasta (opcional)">
            <input type="date" value={nueva.vigenteHasta ?? ''} onChange={(e) => setNueva({ ...nueva, vigenteHasta: e.target.value || null })} />
          </Campo>
          <button className="btn primario" onClick={agregarTarifa}>+ Agregar tarifa</button>
        </div>
        {error && <div className="msg err">✕ {error}</div>}
        {aviso && <div className="msg ok">✓ {aviso}</div>}
        {solapes.map(([a, b]) => (
          <div key={a.id + b.id} className="msg err">
            ✕ Vigencias superpuestas: {s.nombreHotel(a.hotelId)} · {ETIQUETA_CONCEPTO[a.concepto]} ({formatoCLP(a.monto)} y {formatoCLP(b.monto)}). Corrija para evitar ambigüedad de precio.
          </div>
        ))}

        {s.hoteles.map((h) => {
          const ts = s.tarifas
            .filter((t) => t.hotelId === h.id)
            .sort((a, b) => CONCEPTOS.indexOf(a.concepto) - CONCEPTOS.indexOf(b.concepto) || b.vigenteDesde.localeCompare(a.vigenteDesde));
          return (
            <div key={h.id} className="sub-panel">
              <h4>{h.nombre} <span className="tag">{h.tipo === 'MADRE' ? 'madre' : 'convenio'}</span></h4>
              {ts.length === 0 ? (
                <div className="hint warn">Sin tarifas cargadas.</div>
              ) : (
                <table className="tabla compacta">
                  <thead><tr><th>Concepto</th><th className="num">Monto neto</th><th>Desde</th><th>Hasta</th><th>Estado</th><th /></tr></thead>
                  <tbody>
                    {ts.map((t) => {
                      const vigente = t.vigenteDesde <= hoy && (!t.vigenteHasta || t.vigenteHasta >= hoy);
                      return (
                        <tr key={t.id} className={vigente ? '' : 'tenue'}>
                          <td>{ETIQUETA_CONCEPTO[t.concepto]}</td>
                          <td className="num">{formatoCLP(t.monto)}</td>
                          <td>{formatoFecha(t.vigenteDesde)}</td>
                          <td>{t.vigenteHasta ? formatoFecha(t.vigenteHasta) : 'indefinida'}</td>
                          <td>{vigente ? 'Vigente' : t.vigenteDesde > hoy ? 'Futura' : 'Histórica'}</td>
                          <td><button className="btn-icono" onClick={() => eliminarTarifa(t)} aria-label="Eliminar">×</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
