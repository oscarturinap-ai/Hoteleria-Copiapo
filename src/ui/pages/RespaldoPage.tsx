import { useState } from 'react';
import { validarSnapshot } from '../../persistence/localStorageRepo';
import { descargar } from '../components/ui';
import { useStore } from '../store';

export function RespaldoPage() {
  const s = useStore();
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  const exportar = async () => {
    const snap = await s.repo.exportar();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    descargar(`respaldo-hoteleria-${ts}.json`, JSON.stringify(snap, null, 2), 'application/json');
    setMsg({ tipo: 'ok', texto: 'Respaldo descargado.' });
  };

  const importar = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      validarSnapshot(parsed);
      const ok = window.confirm(
        `Se reemplazarán TODOS los datos actuales por el respaldo:\n` +
          `${parsed.registros.length} registros, ${parsed.estadosPago.length} EDP, ${parsed.empresas.length} empresas.\n\n` +
          '¿Continuar? Recomendado: exportar un respaldo actual antes.',
      );
      if (!ok) return;
      await s.importar(parsed);
      setMsg({ tipo: 'ok', texto: 'Respaldo restaurado.' });
    } catch (e) {
      setMsg({ tipo: 'err', texto: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="pagina">
      <div className="panel">
        <h3>Respaldo de datos</h3>
        <p className="hint">
          Los datos se guardan en este navegador (localStorage). No se comparten entre equipos ni usuarios.
          Exporte respaldos periódicamente hasta la migración a base de datos central.
        </p>
        <div className="fila">
          <button className="btn primario" onClick={exportar}>Exportar respaldo JSON</button>
          <label className="btn">
            Restaurar desde archivo…
            <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])} />
          </label>
        </div>
        {msg && <div className={`msg ${msg.tipo}`}>{msg.tipo === 'ok' ? '✓' : '✕'} {msg.texto}</div>}
        <table className="tabla compacta" style={{ maxWidth: 400, marginTop: 12 }}>
          <tbody>
            <tr><td>Registros</td><td className="num">{s.registros.length}</td></tr>
            <tr><td>EDP emitidos</td><td className="num">{s.estadosPago.length}</td></tr>
            <tr><td>Empresas</td><td className="num">{s.empresas.length}</td></tr>
            <tr><td>Solicitantes</td><td className="num">{s.solicitantes.length}</td></tr>
            <tr><td>Habitaciones</td><td className="num">{s.habitaciones.length}</td></tr>
            <tr><td>Tarifas</td><td className="num">{s.tarifas.length}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
