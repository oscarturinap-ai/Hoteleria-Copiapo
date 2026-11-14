/** RUT chileno: normalización, validación (módulo 11) y formato. */

/** Deja sólo dígitos y K mayúscula: '12.345.678-k' → '12345678K'. */
export function limpiarRut(rut: string): string {
  return rut.replace(/[^0-9kK]/g, '').toUpperCase();
}

export function calcularDV(cuerpo: string): string {
  let suma = 0;
  let mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const r = 11 - (suma % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}

export function validarRut(rut: string): boolean {
  const l = limpiarRut(rut);
  if (!/^\d{7,8}[0-9K]$/.test(l)) return false;
  return calcularDV(l.slice(0, -1)) === l.slice(-1);
}

/** Forma canónica para almacenar y comparar: '12345678-5'. */
export function normalizarRut(rut: string): string {
  const l = limpiarRut(rut);
  if (l.length < 2) return l;
  return `${l.slice(0, -1)}-${l.slice(-1)}`;
}

/** Formato de presentación: '12.345.678-5'. */
export function formatearRut(rut: string): string {
  const l = limpiarRut(rut);
  if (l.length < 2) return rut;
  const cuerpo = l.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpo}-${l.slice(-1)}`;
}
