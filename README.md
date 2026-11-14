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
    localStorageRepo.ts  Modo local, versionado con migraciones
    supabaseRepo.ts  Modo Supabase (vista de dominio + RPC transaccional)
    supabaseMapeo.ts Filas ↔ dominio y traducción de errores
    config.ts        Selección de backend por variables de entorno
  ui/              React: páginas Registros, EDP, Hoteles y tarifas, Maestros, Respaldo
supabase/migrations/0001_esquema_inicial.sql     Esquema relacional de destino
supabase/migrations/0002_operacion_recepcion.sql Bitácora append-only
supabase/migrations/0003_inventario_habitaciones.sql  Inventario + trigger anti-sobreventa
supabase/migrations/0004_api_aplicacion.sql      Perfiles, vista de dominio, guardar_registro, correlativos
```

## Modos de operación

| Modo | Cuándo | Datos | Usuarios |
|---|---|---|---|
| **Local** | Sin variables de Supabase | localStorage del navegador | Un equipo; operador escrito a mano |
| **Supabase** | Con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` | PostgreSQL central | Login con email/contraseña; operador = usuario |

> **Guía paso a paso (Supabase + Vercel): [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md).** Instalación SQL en un solo archivo: `supabase/setup_completo.sql`.

### Puesta en marcha en Supabase
1. Crear un proyecto en Supabase.
2. En **SQL Editor**, ejecutar en orden `supabase/migrations/0001` → `0004`. La `0004` fija los IDs de los hoteles: debe correr antes de cargar datos.
3. Copiar `.env.example` a `.env.local` con la URL y la *anon key* (Project Settings → API). Compilar con `npm run build` y publicar `dist/` en cualquier hosting estático.
4. En **Authentication → Users**, crear o invitar al primer usuario: queda **ADMIN** automáticamente. Los siguientes quedan como **LECTOR**; el rol se asigna en la sección **Usuarios** de la app.
5. Recomendado: en Authentication → Providers, desactivar el registro público (*Allow new users to sign up*), para que solo el administrador cree cuentas.
6. Para migrar los datos locales: en la versión local, **Respaldo → Exportar**; en la versión Supabase (como ADMIN), **Respaldo → Importar**. La importación es idempotente, conserva folios y bitácora, y ajusta los correlativos.

### Roles
| Rol | Permisos |
|---|---|
| ADMIN | Todo: maestros, tarifas, inventario, usuarios, importación |
| OPERADOR | Registros, recepción (check-in/out, cargos, no show), emisión y anulación de EDP |
| LECTOR | Solo consulta |

La seguridad la impone la base de datos (RLS, funciones y triggers); la interfaz solo oculta lo que el rol no puede hacer.

### Garantías en el servidor
- `guardar_registro`: registro, tramos, cargos y bitácora en **una transacción**; si algo falla, no queda nada a medias.
- Bloqueo optimista: si otro usuario modificó el registro, el guardado se rechaza con aviso.
- Anti-sobreventa, tramos contiguos, tarifas sin solapes, EDP inmutable y bitácora append-only, mediante restricciones y triggers.
- Auditoría técnica de cada cambio en la tabla `auditoria`.

> En modo local, los datos viven solo en ese navegador: exporte respaldos periódicamente.
