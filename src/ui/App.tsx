import { useState } from 'react';
import { useStore } from './store';
import { RegistrosPage } from './pages/RegistrosPage';
import { PanelDiaPage } from './pages/PanelDiaPage';
import { CalendarioPage } from './pages/CalendarioPage';
import { EDPPage } from './pages/EDPPage';
import { HotelesTarifasPage } from './pages/HotelesTarifasPage';
import { MaestrosPage } from './pages/MaestrosPage';
import { RespaldoPage } from './pages/RespaldoPage';

const SECCIONES = {
  hoy: { titulo: 'Panel del día', comp: PanelDiaPage },
  calendario: { titulo: 'Calendario', comp: CalendarioPage },
  registros: { titulo: 'Registros', comp: RegistrosPage },
  edp: { titulo: 'Estados de pago', comp: EDPPage },
  tarifas: { titulo: 'Hoteles y tarifas', comp: HotelesTarifasPage },
  maestros: { titulo: 'Maestros', comp: MaestrosPage },
  respaldo: { titulo: 'Respaldo', comp: RespaldoPage },
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
  const Comp = SECCIONES[sec].comp;

  return (
    <div className="app">
      <header className="top no-print">
        <div className="marca">
          <b>Hotelería Copiapó</b>
          <span>Control de ingresos · Estados de pago</span>
        </div>
        <nav>
          {(Object.keys(SECCIONES) as Seccion[]).map((k) => (
            <button key={k} className={k === sec ? 'activo' : ''} onClick={() => ir(k)}>
              {SECCIONES[k].titulo}
            </button>
          ))}
        </nav>
        <label className={`operador ${s.operador.trim() ? '' : 'falta'}`} title="Operador responsable: queda registrado en la bitácora de cada operación">
          Operador
          <input value={s.operador} onChange={(e) => s.setOperador(e.target.value)} placeholder="Nombre (obligatorio)" />
        </label>
      </header>
      <main>{s.cargando ? <div className="vacio">Cargando…</div> : <Comp />}</main>
    </div>
  );
}
