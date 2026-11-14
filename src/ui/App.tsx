import { useState } from 'react';
import { useStore } from './store';
import { RegistrosPage } from './pages/RegistrosPage';
import { EDPPage } from './pages/EDPPage';
import { HotelesTarifasPage } from './pages/HotelesTarifasPage';
import { MaestrosPage } from './pages/MaestrosPage';
import { RespaldoPage } from './pages/RespaldoPage';

const SECCIONES = {
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
    return h in SECCIONES ? (h as Seccion) : 'registros';
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
      </header>
      <main>{s.cargando ? <div className="vacio">Cargando…</div> : <Comp />}</main>
    </div>
  );
}
