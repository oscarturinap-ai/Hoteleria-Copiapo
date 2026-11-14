import { useMemo, useState } from 'react';
import {
  CAPACIDAD_TIPO,
  ETIQUETA_TIPO_HAB,
  compararHabitacion,
  expandirRango,
  hoyISO,
  indiceOcupacion,
} from '../../domain';
import type { Habitacion, TipoHabitacion } from '../../domain';
import { Campo } from '../components/ui';
import { nuevoId, useStore } from '../store';

const TIPOS = Object.keys(ETIQUETA_TIPO_HAB) as TipoHabitacion[];

export function InventarioHabitaciones() {
  const s = useStore();
  const hoy = hoyISO();
  const [hotelId, setHotelId] = useState(s.hoteles[0]?.id ?? '');
  const [numeros, setNumeros] = useState('');
  const [tipo, setTipo] = useState<TipoHabitacion>('SINGLE');
  const [capacidad, setCapacidad] = useState(1);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  // Ocupación máxima histórica y futura por habitación (para no romper registros existentes).
  const uso = useMemo(() => {
    const idx = indiceOcupacion(s.registros);
    const out = new Map<string, { max: number; futuras: number; usos: number }>();
    for (const h of s.habitaciones) {
      const porNoche = idx.get(h.id);
      let max = 0;
      let futuras = 0;
      for (const [n, occ] of porNoche ?? []) {
        max = Math.max(max, occ.length);
        if (n >= hoy) futuras++;
      }
      const usos = s.registros.filter((r) => r.tramos.some((t) => t.habitacionId === h.id)).length;
      out.set(h.id, { max, futuras, usos });
    }
    return out;
  }, [s.registros, s.habitaciones, hoy]);

  const agregar = async () => {
    setMsg(null);
    const lista = expandirRango(numeros);
    if (!hotelId) return setMsg({ tipo: 'err', texto: 'Seleccione hotel.' });
    if (!lista) return setMsg({ tipo: 'err', texto: 'Indique un número (ej. 101) o un rango (ej. 101-120, máx. 200).' });
    if (!Number.isSafeInteger(capacidad) || capacidad < 1 || capacidad > 10) return setMsg({ tipo: 'err', texto: 'Capacidad entre 1 y 10.' });
    const existentes = new Set(s.habitaciones.filter((h) => h.hotelId === hotelId).map((h) => h.numero.trim().toLowerCase()));
    const repetidas = lista.filter((n) => existentes.has(n.toLowerCase()));
    if (repetidas.length) return setMsg({ tipo: 'err', texto: `Ya existen en este hotel: ${repetidas.join(', ')}.` });
    for (const numero of lista) {
      await s.repo.habitaciones.upsert({ id: nuevoId(), hotelId, numero, tipo, capacidad, activa: true, notas: '' });
    }
    await s.recargar();
    setNumeros('');
    setMsg({ tipo: 'ok', texto: `${lista.length} habitación(es) agregada(s) a ${s.nombreHotel(hotelId)}.` });
  };

  const guardar = async (h: Habitacion, patch: Partial<Habitacion>) => {
    setMsg(null);
    const n = { ...h, ...patch };
    const u = uso.get(h.id);
    if ('capacidad' in patch) {
      if (!Number.isSafeInteger(n.capacidad) || n.capacidad < 1 || n.capacidad > 10) return setMsg({ tipo: 'err', texto: 'Capacidad entre 1 y 10.' });
      if (u && n.capacidad < u.max) {
        return setMsg({ tipo: 'err', texto: `Hab. ${h.numero}: hay noches con ${u.max} ocupante(s) registrados; la capacidad no puede ser menor.` });
      }
    }
    if ('numero' in patch) {
      const num = n.numero.trim();
      if (!num) return;
      if (s.habitaciones.some((x) => x.id !== h.id && x.hotelId === h.hotelId && x.numero.trim().toLowerCase() === num.toLowerCase())) {
        return setMsg({ tipo: 'err', texto: `Ya existe la habitación ${num} en este hotel.` });
      }
      n.numero = num;
    }
    if (patch.activa === false && u?.futuras) {
      if (!window.confirm(`Hab. ${h.numero} tiene ${u.futuras} noche(s) futuras asignadas. Esos registros la conservan, pero no podrá asignarse a nuevos. ¿Desactivar?`)) return;
    }
    await s.repo.habitaciones.upsert(n);
    await s.recargar();
  };

  const eliminar = async (h: Habitacion) => {
    const u = uso.get(h.id);
    if (u?.usos) return setMsg({ tipo: 'err', texto: `Hab. ${h.numero} figura en ${u.usos} registro(s): desactívela en lugar de eliminarla (trazabilidad).` });
    if (!window.confirm(`¿Eliminar la habitación ${h.numero}?`)) return;
    await s.repo.habitaciones.remove(h.id);
    await s.recargar();
  };

  const lista = s.habitaciones.filter((h) => h.hotelId === hotelId).sort(compararHabitacion);
  const activas = lista.filter((h) => h.activa);

  return (
    <div className="panel">
      <h3>Inventario de habitaciones <small>(sin inventario, el hotel opera por cupo sin asignación)</small></h3>
      <div className="inv-form">
        <Campo label="Hotel" ancho={190}>
          <select value={hotelId} onChange={(e) => setHotelId(e.target.value)}>
            {s.hoteles.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
          </select>
        </Campo>
        <Campo label="N° o rango (ej. 101-120)" ancho={160}>
          <input value={numeros} onChange={(e) => setNumeros(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && agregar()} />
        </Campo>
        <Campo label="Tipo" ancho={170}>
          <select value={tipo} onChange={(e) => { const t = e.target.value as TipoHabitacion; setTipo(t); setCapacidad(CAPACIDAD_TIPO[t]); }}>
            {TIPOS.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_HAB[t]}</option>)}
          </select>
        </Campo>
        <Campo label="Capacidad (personas)" ancho={130}>
          <input type="number" min={1} max={10} value={capacidad} onChange={(e) => setCapacidad(Number(e.target.value))} />
        </Campo>
        <button className="btn primario" onClick={agregar}>+ Agregar</button>
        <div className="espaciador" />
        <span className="hint">{activas.length} activas · {activas.reduce((a, h) => a + h.capacidad, 0)} camas</span>
      </div>
      {msg && <div className={`msg ${msg.tipo}`}>{msg.tipo === 'ok' ? '✓' : '✕'} {msg.texto}</div>}
      {lista.length === 0 ? (
        <div className="hint">Sin habitaciones cargadas para {s.nombreHotel(hotelId)}.</div>
      ) : (
        <table className="tabla compacta">
          <thead>
            <tr><th>N°</th><th>Tipo</th><th className="num">Capacidad</th><th className="num">Máx. ocupación registrada</th><th className="num">Registros</th><th>Notas</th><th>Activa</th><th /></tr>
          </thead>
          <tbody>
            {lista.map((h) => {
              const u = uso.get(h.id);
              return (
                <tr key={h.id} className={h.activa ? '' : 'tenue'}>
                  <td><input defaultValue={h.numero} style={{ width: 70 }} onBlur={(e) => e.target.value.trim() !== h.numero && guardar(h, { numero: e.target.value })} /></td>
                  <td>
                    <select value={h.tipo} onChange={(e) => guardar(h, { tipo: e.target.value as TipoHabitacion })}>
                      {TIPOS.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_HAB[t]}</option>)}
                    </select>
                  </td>
                  <td className="num">
                    <input key={`${h.id}-${h.capacidad}`} className="num" type="number" min={1} max={10} defaultValue={h.capacidad} style={{ width: 60 }}
                      onBlur={(e) => Number(e.target.value) !== h.capacidad && guardar(h, { capacidad: Number(e.target.value) })} />
                  </td>
                  <td className="num">{u?.max ?? 0}</td>
                  <td className="num">{u?.usos ?? 0}</td>
                  <td><input defaultValue={h.notas} onBlur={(e) => e.target.value !== h.notas && guardar(h, { notas: e.target.value })} /></td>
                  <td><input type="checkbox" checked={h.activa} onChange={(e) => guardar(h, { activa: e.target.checked })} /></td>
                  <td><button className="btn-icono" onClick={() => eliminar(h)} aria-label="Eliminar">×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
