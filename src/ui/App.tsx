import { useEffect, useState } from 'react';
import { useStore } from './store';
import { RegistrosPage } from './pages/RegistrosPage';
import { PanelDiaPage } from './pages/PanelDiaPage';
import { CalendarioPage } from './pages/CalendarioPage';
import { EDPPage } from './pages/EDPPage';
import { HotelesTarifasPage } from './pages/HotelesTarifasPage';
import { MaestrosPage } from './pages/MaestrosPage';
import { RespaldoPage } from './pages/RespaldoPage';
import { UsuariosPage } from './pages/UsuariosPage';

const SECCIONES = {
  hoy: { titulo: 'Panel del día', comp: PanelDiaPage },
  calendario: { titulo: 'Calendario', comp: CalendarioPage },
  registros: { titulo: 'Registros', comp: RegistrosPage },
  edp: { titulo: 'Estados de pago', comp: EDPPage },
  tarifas: { titulo: 'Hoteles, habitaciones y tarifas', comp: HotelesTarifasPage },
  maestros: { titulo: 'Maestros', comp: MaestrosPage },
  respaldo: { titulo: 'Respaldo', comp: RespaldoPage },
  usuarios: { titulo: 'Usuarios', comp: UsuariosPage },
} as const;

type Seccion = keyof typeof SECCIONES;

export function App() {
  const s = useStore();
  const [sec, setSec] = useState<Seccion>(() => {
    const h = window.location.hash.slice(1);
    return h in SECCIONES ? (h as Seccion) : 'hoy';
  });
  const ir = (k: Seccion) => {
    setSec(k);
    window.location.hash = k;
  };
  const visibles = (Object.keys(SECCIONES) as Seccion[]).filter((k) => k !== 'usuarios' || (s.sesion && s.esAdmin));
  const Comp = SECCIONES[visibles.includes(sec) ? sec : 'hoy'].comp;

  // Red de seguridad: cualquier rechazo no controlado (p. ej. permiso denegado por RLS) se muestra.
  const [error, setError] = useState('');
  useEffect(() => {
    const h = (e: PromiseRejectionEvent) => setError(e.reason instanceof Error ? e.reason.message : String(e.reason));
    window.addEventListener('unhandledrejection', h);
    return () => window.removeEventListener('unhandledrejection', h);
  }, []);

  return (
    <div className="app">
      <header className="top no-print">
        <div className="marca">
          <b>Hotelería Copiapó</b>
          <span>Control de ingresos · Estados de pago</span>
        </div>
        <nav>
          {visibles.map((k) => (
            <button key={k} className={k === sec ? 'activo' : ''} onClick={() => ir(k)}>
              {SECCIONES[k].titulo}
            </button>
          ))}
        </nav>
        {s.sesion ? (
          <div className="sesion" title={s.sesion.email}>
            <b>{s.sesion.nombre}</b>
            <span className="rol">{s.sesion.rol}</span>
            <button onClick={() => void s.sesion!.cerrar()}>Cerrar sesión</button>
          </div>
        ) : (
          <label className={`operador ${s.operador.trim() ? '' : 'falta'}`} title="Operador responsable: queda registrado en la bitácora de cada operación">
            Operador
            <input value={s.operador} onChange={(e) => s.setOperador(e.target.value)} placeholder="Nombre (obligatorio)" />
          </label>
        )}
      </header>
      <main>{s.cargando ? <div className="vacio">Cargando…</div> : <Comp />}</main>
      {error && (
        <div className="toast-error no-print" role="alert">
          <span>✕ {error}</span>
          <button onClick={() => setError('')} aria-label="Cerrar">×</button>
        </div>
      )}
    </div>
  );
}
