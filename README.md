# Hotelería Copiapó — Control de ingresos y Estados de Pago

Plataforma para registrar huéspedes derivados por contrato, asignarlos al hotel madre
(**Hotel Tabancura**) o a hoteles en convenio (**Alto Atacama**, **Muray**) y emitir
**Estados de Pago (EDP)** auditables.

```bash
npm install
npm run dev        # desarrollo
npm test           # reglas de negocio (vitest)
npm run build      # typecheck + build de producción
```

## Reglas de negocio (fijadas por tests en `src/domain/dominio.test.ts`)

| Regla | Implementación |
|---|---|
| Se cobra por noche; salida 11:00. IN 09-nov / OUT 12-nov = **3 noches** (9, 10, 11) | `noches()`, `diffDias()` — aritmética UTC, inmune a cambio de horario |
| Tarifa de alojamiento incluye desayuno | Concepto `ALOJAMIENTO` |
| Almuerzo, cena, colación, bebidas, agua, lavandería, otros = **adicionales** | `CargoAdicional` (cantidad × precio unitario) |
| Montos **netos**, enteros CLP | `dinero.ts` rechaza decimales y desbordes |
| **EDP** = Σ (noches × tarifa hotel) + Σ adicionales = **monto neto** | `calcularEDP()` |
| Total pasajeros = RUT distintos | Un derivado cuenta una vez en el total |
| No show: cobro **total**, **parcial** (primeras N noches) o **sin cargo** | `nochesCobrables()` |
| Cambio de hotel / tarifa = **un registro con tramos** (derivación) | `Tramo[]` contiguos, cada uno con su tarifa |
| Imputación a período: noche por su fecha de inicio; adicional por su fecha | Estadías que cruzan meses se cortan exactas |

### Controles de integridad
- RUT validado (módulo 11) y normalizado.
- Tramos contiguos, ≥ 1 noche, tarifa entera > 0.
- Adicionales dentro de la estadía (incluye día de salida).
- **Bloqueo de doble asignación**: mismo RUT con noches superpuestas en otro registro.
- Tarifas con vigencia; se detectan vigencias superpuestas. Al agregar una tarifa nueva, la anterior abierta se cierra automáticamente.
- La tarifa se **congela** en el tramo/adicional al registrar: cambiar el tarifario no altera la historia.
- `verificarCuadratura()`: el EDP lanza error si Σ líneas ≠ totales, Σ por hotel ≠ total, Σ por empresa ≠ total, Σ por concepto ≠ adicionales.
- EDP emitido = snapshot inmutable (cálculo + nombres). Sólo puede anularse con motivo.

## Arquitectura

```
src/
  domain/          Lógica pura y testeada. Sin React ni almacenamiento.
    types.ts         Modelo
    fechas.ts        Fechas de calendario (UTC)
    rut.ts           RUT chileno
    dinero.ts        Aritmética CLP entera
    registro.ts      Noches cobrables, tarifas vigentes, validación
    edp.ts           Cálculo y cuadratura de estados de pago
    exportar.ts      CSV (';' + BOM, compatible Excel es-CL)
  persistence/
    repository.ts    Contrato async (Collection<T>, contadores, export/import)
    localStorageRepo.ts  Implementación actual, versionada con migraciones
  ui/              React: páginas Registros, EDP, Hoteles y tarifas, Maestros, Respaldo
supabase/migrations/0001_esquema_inicial.sql   Esquema relacional de destino
```

### Migración a Supabase / PostgreSQL
1. Aplicar `supabase/migrations/0001_esquema_inicial.sql` (tablas, secuencias de folio y correlativo,
   restricciones de exclusión de rangos, auditoría por trigger, RLS por rol ADMIN / OPERADOR / LECTOR).
2. Implementar `SupabaseRepository implements Repository` (mapear `Registro` ↔ `registro` + `tramo` + `cargo_adicional`).
3. Cambiar la instancia en `src/main.tsx`. La UI y el dominio no cambian.
4. Importar los datos actuales desde el respaldo JSON (menú **Respaldo**).

> Mientras se use localStorage, los datos viven sólo en ese navegador: exportar respaldos periódicamente.
