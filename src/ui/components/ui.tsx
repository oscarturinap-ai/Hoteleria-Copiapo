import { useEffect, type ReactNode } from 'react';
import { formatoCLP, parsearCLP } from '../../domain/dinero';

export function Modal({ titulo, onClose, children, ancho = 1100 }: { titulo: string; onClose: () => void; children: ReactNode; ancho?: number }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: ancho }} role="dialog" aria-label={titulo}>
        <header className="modal-cab">
          <h2>{titulo}</h2>
          <button className="btn-icono" onClick={onClose} aria-label="Cerrar">×</button>
        </header>
        <div className="modal-cuerpo">{children}</div>
      </div>
    </div>
  );
}

export function Campo({ label, children, ancho }: { label: string; children: ReactNode; ancho?: number | string }) {
  return (
    <label className="campo" style={ancho ? { width: ancho } : undefined}>
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Input de monto CLP entero con separador de miles. */
export function InputCLP({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <input
      className="num"
      inputMode="numeric"
      disabled={disabled}
      value={Number.isFinite(value) ? formatoCLP(value).replace('$', '') : ''}
      onChange={(e) => {
        const v = parsearCLP(e.target.value || '0');
        if (!Number.isNaN(v)) onChange(v);
      }}
    />
  );
}

export function Kpi({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-valor">{valor}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function Mensajes({ errores, advertencias }: { errores: string[]; advertencias: string[] }) {
  if (!errores.length && !advertencias.length) return null;
  return (
    <div className="mensajes">
      {errores.map((e) => <div key={e} className="msg err">✕ {e}</div>)}
      {advertencias.map((a) => <div key={a} className="msg warn">! {a}</div>)}
    </div>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className="vacio">{children}</div>;
}

export function descargar(nombre: string, contenido: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
