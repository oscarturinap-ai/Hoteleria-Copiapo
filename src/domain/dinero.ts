import type { CLP } from './types';

/** Garantiza entero no negativo seguro. Lanza ante cualquier valor que rompa la aritmética exacta. */
export function assertCLP(v: number, campo = 'monto'): CLP {
  if (!Number.isSafeInteger(v) || v < 0) {
    throw new Error(`${campo} debe ser un entero CLP ≥ 0 (recibido: ${v})`);
  }
  return v;
}

export function multiplicar(unitario: CLP, cantidad: number): CLP {
  assertCLP(unitario, 'precio unitario');
  if (!Number.isSafeInteger(cantidad) || cantidad < 0) {
    throw new Error(`cantidad debe ser entera ≥ 0 (recibido: ${cantidad})`);
  }
  const r = unitario * cantidad;
  if (!Number.isSafeInteger(r)) throw new Error('Desbordamiento en cálculo de monto');
  return r;
}

export function sumar(montos: Iterable<CLP>): CLP {
  let s = 0;
  for (const m of montos) s += m;
  if (!Number.isSafeInteger(s)) throw new Error('Desbordamiento en suma de montos');
  return s;
}

const fmt = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });

export function formatoCLP(v: CLP): string {
  return `$${fmt.format(v)}`;
}

export function formatoNumero(v: number): string {
  return fmt.format(v);
}

/** Parsea entrada de usuario ('85.000', '$85000') a entero; NaN si no es válida. */
export function parsearCLP(s: string): number {
  const limpio = s.replace(/[$.\s]/g, '');
  if (!/^\d+$/.test(limpio)) return NaN;
  return Number(limpio);
}
