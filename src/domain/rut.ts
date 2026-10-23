/** Normaliza un RUT: sin puntos ni espacios, DV en mayúscula, con guion. Ej: "12.345.678-k" -> "12345678-K". */
export function normalizarRut(rut: string): string {
  const limpio = rut.replace(/[.\s-]/g, "").toUpperCase();
  if (limpio.length < 2) return limpio;
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
}

/** Dígito verificador por módulo 11. */
export function calcularDv(cuerpo: string): string {
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

export function esRutValido(rut: string): boolean {
  const normalizado = normalizarRut(rut);
  const match = /^(\d{1,8})-([\dK])$/.exec(normalizado);
  if (!match) return false;
  return calcularDv(match[1]) === match[2];
}

/** Formato de presentación: "12.345.678-5". */
export function formatearRut(rut: string): string {
  const [cuerpo, dv] = normalizarRut(rut).split("-");
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}
