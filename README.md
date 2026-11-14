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

## Operación (flujo de recepción, modelo PMS)

Toda la información se ingresa directamente en la plataforma; no hay carga masiva.

| Vista | Uso |
|---|---|
| **Panel del día** (inicio) | Llegadas, salidas (11:00), in-house y pendientes (llegadas atrasadas, salidas vencidas), con ocupación por hotel. Acciones directas: check-in, check-out, no show, cargo, anular. |
| **Calendario** | Línea de tiempo por hotel con barras por estadía y color por estado. Clic en la ocupación de un día crea un registro con ese hotel, fecha y tarifa vigente. |
| **Registros** | Listado con filtros y las mismas acciones por fila. |
| **Formulario** | Reconoce al huésped por RUT (estadías previas) y completa nombre, empresa y solicitante. N° de habitación por tramo. "Guardar y nuevo" para ingreso continuo. Bitácora visible. |

- **Check-in tardío**: ajusta el IN (libera noches) o mantiene el cobro desde la reserva.
- **Check-out anticipado / extensión**: ajusta el OUT o lo mantiene; bloquea si quedan cargos fuera de la nueva estadía.
- Check-in/out no aceptan fechas futuras (registran hechos ocurridos).
- **Operador** obligatorio (barra superior): cada operación queda en la bitácora con operador, fecha y detalle de cambios.
- **Concurrencia optimista**: si el registro cambió desde que se abrió, el guardado se rechaza en vez de sobrescribir.

### Habitaciones
- **Inventario por hotel** (Hoteles, habitaciones y tarifas): número, tipo y **capacidad en personas** (twin compartida = 2). Alta individual o por rango (`101-120`).
- **Asignación por tramo** con disponibilidad en vivo; las ocupadas aparecen deshabilitadas con el folio que las ocupa.
- **Sin sobreventa**: ocupantes por noche ≤ capacidad. Quien sale el 12 (11:00) libera la habitación para quien entra el 12. No show y anulados liberan inventario.
- **Check-in exige habitación** si el hotel tiene inventario; un hotel sin inventario opera por cupo, sin asignación.
- **Calendario por habitación**: estado diario (libre / parcial / llena); clic en una celda libre crea el registro con la habitación asignada.
- No se puede bajar la capacidad por debajo de la ocupación registrada ni eliminar habitaciones con historia (se desactivan).

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
    habitaciones.ts  Inventario, disponibilidad, sobreventa, ocupación diaria
    operaciones.ts   Check-in/out, no show, anulación, cargos, panel del día, perfil de huésped, bitácora
    edp.ts           Cálculo y cuadratura de estados de pago
    exportar.ts      CSV (';' + BOM, compatible Excel es-CL)
  persistence/
    repository.ts    Contrato async (Collection<T>, contadores, export/import)
    localStorageRepo.ts  Implementación actual, versionada con migraciones
  ui/              React: páginas Registros, EDP, Hoteles y tarifas, Maestros, Respaldo
supabase/migrations/0001_esquema_inicial.sql     Esquema relacional de destino
supabase/migrations/0002_operacion_recepcion.sql Bitácora append-only
supabase/migrations/0003_inventario_habitaciones.sql  Inventario + trigger anti-sobreventa
```

### Migración a Supabase / PostgreSQL
1. Aplicar en orden `supabase/migrations/0001` a `0003` (tablas, secuencias de folio y correlativo,
   restricciones de exclusión de rangos, auditoría por trigger, RLS por rol ADMIN / OPERADOR / LECTOR).
2. Implementar `SupabaseRepository implements Repository` (mapear `Registro` ↔ `registro` + `tramo` + `cargo_adicional`).
3. Cambiar la instancia en `src/main.tsx`. La UI y el dominio no cambian.
4. Importar los datos actuales desde el respaldo JSON (menú **Respaldo**).

> Mientras se use localStorage, los datos viven sólo en ese navegador: exportar respaldos periódicamente.
