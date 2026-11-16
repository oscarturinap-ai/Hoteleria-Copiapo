# Hotelería Copiapó — Pendientes, paso a paso y prompts de continuación

Última actualización: 16-11-2026 · Rama de trabajo: `claude/loving-knuth-0t8qvg`

Cómo usar este documento:
1. **Parte A** es lo que debes hacer tú para dejar la plataforma en línea (no depende de código).
2. **Parte B** valida que todo funciona en producción antes de usarla para cobrar.
3. **Parte C** es la operación diaria y de mantención.
4. **Parte D** son las decisiones de negocio abiertas.
5. **Parte E** son los riesgos y limitaciones conocidos, dichos sin maquillaje.
6. **Parte F** es el backlog técnico priorizado.
7. **Parte G** son los prompts listos para copiar y pegar en una sesión nueva de Claude Code.

---

## 0. Estado actual (qué existe y qué no)

| Área | Estado |
|---|---|
| Registro de huéspedes (RUT, empresa, solicitante, IN/OUT, derivación entre hoteles con cambio de tarifa) | Hecho y probado |
| Recepción: panel del día, calendario, check-in/out, no show, cargos, bitácora | Hecho y probado |
| Habitaciones: inventario, asignación, bloqueo de sobreventa | Hecho y probado |
| Estados de pago: cálculo, cuadratura, emisión inmutable, anulación, CSV, impresión | Hecho y probado |
| Multiusuario: login, roles ADMIN / OPERADOR / LECTOR, Supabase | Hecho; **probado solo con respuestas simuladas, nunca contra un Supabase real** |
| Esquema SQL (`supabase/setup_completo.sql`) | Probado en PostgreSQL 16 local con un stub de Supabase |
| Pruebas automáticas | 65 pruebas de dominio, persistencia y mapeo |
| Publicación en Internet | **No hecha.** No existe ninguna dirección web todavía |
| Datos reales (empresas, tarifas, habitaciones) | **No cargados** |

Fuera de alcance por decisión tuya: carga masiva desde Excel, límite contractual de cupo, confirmación del no show parcial.

---

## PARTE A — Dejarla en línea (lo haces tú, ~30–45 min)

Requisitos previos: un correo que controles, acceso a tu cuenta de GitHub (`oscarturinap-ai`), y una tarjeta solo si decides un plan de pago (los planes gratuitos permiten empezar).

### A1. Crear el proyecto en Supabase

1. Entra a <https://supabase.com> y crea una cuenta (puedes usar GitHub).
2. Crea una organización si te la pide (nombre libre, tipo *Personal*).
3. Pulsa **New project** y completa:
   - **Name:** `hoteleria-copiapo`.
   - **Database password:** genera una larga y **guárdala en un gestor de contraseñas**. No se vuelve a mostrar.
   - **Region:** la más cercana disponible a Chile (normalmente *South America (São Paulo)*).
   - **Plan:** *Free* para empezar. Ver riesgos R3 y R4 antes de producción.
4. Espera 1–2 minutos hasta que el panel diga que el proyecto está listo.

### A2. Instalar el esquema de base de datos

1. En el menú izquierdo abre **SQL Editor** y pulsa **New query**.
2. En GitHub, abre el archivo `supabase/setup_completo.sql` de la rama `claude/loving-knuth-0t8qvg`, pulsa **Raw**, selecciona todo (Ctrl+A) y copia.
3. Pega el contenido completo en el editor de Supabase y pulsa **Run**.
4. Debe terminar en **Success** (sin mensajes rojos). Si falla, no repitas: copia el mensaje de error completo y pásalo a Claude con el prompt **G1**.
5. **Ejecútalo una sola vez.** Si lo corres de nuevo en un proyecto ya instalado fallará con errores de "ya existe"; es esperado y no daña nada.
6. Comprobación: en **Table Editor** deben verse las tablas `hotel`, `habitacion`, `tarifa`, `empresa`, `solicitante`, `huesped`, `registro`, `tramo`, `cargo_adicional`, `registro_evento`, `estado_pago`, `auditoria`, `perfil`. La tabla `hotel` debe tener 3 filas (Tabancura, Alto Atacama, Muray).

### A3. Copiar las claves de conexión

1. **Project Settings** (engranaje) → **API**.
2. Copia y anota en un archivo temporal:
   - **Project URL** → algo como `https://abcdefgh.supabase.co`.
   - **anon / public key** → clave larga que empieza con `eyJ`.
3. **No copies ni uses la `service_role` key.** Esa clave salta toda la seguridad.

### A4. Cerrar el registro público de usuarios

1. **Authentication** → **Sign In / Providers** (o **Providers**; el nombre puede variar según la versión del panel) → **Email**.
2. Desactiva **Allow new users to sign up** y guarda.
3. Efecto: solo tú creas cuentas. Si lo dejas activo, cualquiera con la dirección y la clave pública podría registrarse (entraría como LECTOR y vería datos).

### A5. Crear tu usuario administrador

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Ingresa tu email y una contraseña fuerte. Marca **Auto Confirm User**.
3. **Este debe ser el primer usuario creado:** el primero queda automáticamente como ADMIN; todos los siguientes quedan como LECTOR.
4. Comprobación: en **Table Editor → perfil** debe haber una fila con tu nombre y `rol = ADMIN`.

### A6. Crear la cuenta de Vercel y publicar

1. Entra a <https://vercel.com> → **Sign Up** → **Continue with GitHub**. Autoriza.
2. Pulsa **Add New… → Project**.
3. En **Import Git Repository** busca `Hoteleria-Copiapo`. Si no aparece, pulsa **Adjust GitHub App Permissions** y concede acceso a ese repositorio.
4. Pulsa **Import**.
5. **Branch:** el proyecto vive en la rama `claude/loving-knuth-0t8qvg`. Tienes dos opciones:
   - **Opción simple:** después de crear el proyecto, en **Settings → Git → Production Branch** escribe `claude/loving-knuth-0t8qvg`.
   - **Opción recomendada a largo plazo:** fusionar esa rama a `main` y usar `main` como producción (ver prompt **G13**). Hacerlo requiere un Pull Request, que no he creado porque no lo has pedido.
6. En **Configure Project**:
   - **Framework Preset:** Vite (se detecta solo).
   - **Build / Output:** déjalos como están; los define `vercel.json`.
   - **Environment Variables**, **antes de desplegar**, agrega dos:
     - `VITE_SUPABASE_URL` = la Project URL de A3.
     - `VITE_SUPABASE_ANON_KEY` = la anon key de A3.
7. Pulsa **Deploy** y espera 1–2 minutos. Vercel muestra una dirección, por ejemplo `https://hoteleria-copiapo.vercel.app`. **Esa es la dirección de la plataforma.**
8. Si luego cambias una variable, debes ir a **Deployments → ⋯ → Redeploy**: las variables `VITE_*` se incorporan al compilar.

### A7. Ajustar la URL en Supabase

1. Supabase → **Authentication** → **URL Configuration**.
2. **Site URL:** la dirección de Vercel de A6.7.
3. **Redirect URLs:** agrega la misma dirección.
4. Sin este paso, el enlace de "¿Olvidó su contraseña?" no vuelve a la plataforma.

### A8. Primer ingreso

1. Abre la dirección de Vercel. Debe aparecer la **pantalla de acceso** (fondo azul oscuro, caja blanca). Si entra directo sin pedir login, ver tabla de problemas al final de esta parte.
2. Ingresa con el email y la contraseña de A5.
3. Arriba a la derecha debe leerse tu nombre y la etiqueta **ADMIN**, y el menú debe incluir **Usuarios**.

### A9. Cargar los datos base (manual, ya en línea)

Hazlo en este orden; cada paso depende del anterior.

1. **Maestros → Empresas contratantes:** razón social y RUT (el RUT se valida solo; puede quedar vacío).
2. **Maestros → Solicitantes:** nombre, empresa, cargo y email de quienes derivan huéspedes.
3. **Hoteles, habitaciones y tarifas → Tarifario neto:** para cada hotel y cada concepto (Alojamiento incluye desayuno; Almuerzo, Cena, Colación, Bebida, Agua, Lavandería, Otro) ingresa el **monto neto** y la fecha **Vigente desde**. Si una tarifa cambia, agrega la nueva con su fecha; la anterior se cierra sola el día previo.
4. **Hoteles, habitaciones y tarifas → Inventario de habitaciones** (opcional): por hotel, número o rango (`101-120`), tipo y capacidad en personas. Si un hotel no tiene inventario cargado, opera por cupo sin asignar habitación. Si lo cargas, el check-in exigirá habitación.
5. **Usuarios:** crea las cuentas del equipo en Supabase (Authentication → Users → Add user, con *Auto Confirm User*). En su primer ingreso quedan como LECTOR; asígnales **OPERADOR** (recepción y EDP) o **ADMIN** en la sección **Usuarios** de la plataforma.

### Si algo no funciona en la Parte A

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Entra directo, sin login | Faltan las variables `VITE_*`, están mal escritas, o no se hizo *Redeploy* | Vercel → Settings → Environment Variables; corregir y Redeploy |
| "Su usuario no tiene perfil asignado" | El usuario se creó antes de correr el SQL | Borrar el usuario en Supabase y crearlo otra vez |
| "Email o contraseña incorrectos" | Usuario sin *Auto Confirm* o contraseña errónea | Revisar en Authentication → Users; restablecer contraseña |
| Pantalla en blanco | Falla de compilación | Vercel → Deployments → el último → **Build Logs**; pasar el error a Claude (prompt **G1**) |
| "Su rol no tiene permiso" | El usuario es LECTOR | Cambiar el rol en **Usuarios** (con una cuenta ADMIN) |
| El SQL falla al ejecutarlo | Proyecto no vacío o error de versión | Copiar el mensaje completo; prompt **G1** |

---

## PARTE B — Validación antes de usarla para cobrar

No emitas estados de pago reales hasta completar B1 y B2.

### B1. Lista de pruebas de aceptación en producción

Ejecútalas con datos ficticios (empresa "PRUEBA"), y bórralas o anúlalas después. Marca cada una.

- [ ] **Login:** contraseña errónea muestra "Email o contraseña incorrectos"; la correcta entra.
- [ ] **Rol ADMIN:** se ve el menú **Usuarios**.
- [ ] **Recuperar contraseña:** el correo llega y el enlace vuelve a la plataforma (valida A7).
- [ ] **Registro simple:** crear huésped 09-nov → 12-nov. Debe mostrar **3 noches**.
- [ ] **RUT inválido:** el sistema lo rechaza y no deja guardar.
- [ ] **Derivación:** un registro con dos tramos (Tabancura → Muray) con tarifas distintas; el neto suma cada tramo con su tarifa.
- [ ] **Adicionales:** agregar 2 cenas; deben sumar `2 × precio` al neto.
- [ ] **Habitaciones:** asignar la misma habitación single a dos huéspedes con noches superpuestas debe **rechazarse**; salida el 12 y entrada el 12 debe **permitirse**.
- [ ] **Check-in tardío:** probar "ajustar IN" y "mantener IN"; verificar que las noches cobradas cambian como se explica en pantalla.
- [ ] **Check-out anticipado:** igual con la salida.
- [ ] **No show:** total, parcial (N noches) y sin cargo; verificar el cobro en el EDP.
- [ ] **EDP:** calcular un período, **emitir**, abrir el emitido y confirmar que es idéntico al borrador. Exportar CSV y abrirlo en Excel (separador `;`).
- [ ] **Anular EDP** con motivo; queda marcado ANULADO y no se puede modificar.
- [ ] **Multiusuario:** con dos navegadores (o uno normal y uno privado), un usuario OPERADOR crea un registro; el otro, al recargar, lo ve.
- [ ] **Edición simultánea:** abrir el mismo registro en dos pestañas, guardar en una y luego en la otra; la segunda debe mostrar "fue modificado… vuelva a abrirlo".
- [ ] **Rol LECTOR:** ve todo, pero el botón "+ Nuevo registro" está deshabilitado y los maestros muestran aviso de solo lectura.
- [ ] **Bitácora:** abrir un registro y comprobar que cada acción quedó con tu nombre, fecha y detalle.
- [ ] **Respaldo:** exportar el JSON y guardarlo.

### B2. Validación paralela de cálculo (obligatoria)

La exactitud del cobro es el objetivo central. Antes del primer EDP real:

1. Toma **un mes cerrado** (o una semana) con datos que ya conozcas.
2. Ingresa esos huéspedes en la plataforma.
3. Calcula el mismo período **a mano en Excel** (noches × tarifa + adicionales).
4. Compara el **monto neto total**, el **subtotal por hotel** y el **subtotal por empresa**.
5. Cualquier diferencia de un solo peso se investiga antes de emitir. Si aparece una, pásala con el prompt **G2**, adjuntando el caso exacto (fechas, tarifas, resultado esperado y obtenido).

### B3. Prueba de recuperación

Antes de operar, practica una vez el ciclo: exportar respaldo → (en un proyecto Supabase de prueba) importarlo con **Respaldo → Importar** → verificar que folios, bitácora y EDP coinciden. Así sabes que el respaldo realmente sirve el día que lo necesites.

---

## PARTE C — Operación y mantención

### C1. Rutina diaria (recepción)

1. Abrir **Panel del día**: revisar **Pendientes** (llegadas atrasadas y salidas vencidas) primero.
2. Registrar llegadas con **Check-in**; asignar habitación si el hotel tiene inventario.
3. Registrar cargos adicionales en el día en que ocurren (**+ Cargo**).
4. Cerrar salidas con **Check-out**.
5. Marcar **No show** cuando corresponda, con la modalidad de cobro acordada.

### C2. Cierre de período (administración)

1. **Estados de pago:** elegir período, hotel y empresa.
2. Revisar las **advertencias** (registros Reservado o In-house aún sin cerrar).
3. Cuadrar contra el pre-cálculo (B2).
4. **Emitir EDP**; exportar CSV e imprimir/PDF para el cliente.
5. Un EDP emitido no se edita: si hay un error, se **anula con motivo** y se emite uno nuevo.

### C3. Respaldos

- Exporta un respaldo JSON en **Respaldo** al cerrar cada mes y guárdalo fuera de la plataforma (Drive, disco).
- Supabase plan gratuito: **no incluye respaldos automáticos descargables**; el plan Pro sí (ver R4). Verifica en la página de precios vigente.

### C4. Usuarios

- Alta: Supabase → Authentication → Users → Add user (*Auto Confirm User*); luego asignar rol en **Usuarios**.
- Baja: en **Usuarios**, desmarcar **Activo**. No borres usuarios que ya operaron: la bitácora conserva su nombre.
- Contraseña olvidada: el usuario usa "¿Olvidó su contraseña?" en la pantalla de acceso.

### C5. Actualizaciones de la plataforma

- Cada vez que se sube código a la rama de producción, Vercel recompila y publica solo.
- Cambios de base de datos (nuevas migraciones `supabase/migrations/0005_…`) **se ejecutan a mano** en el SQL Editor, en orden, antes de publicar el código que las usa.

---

## PARTE D — Decisiones de negocio abiertas

| # | Decisión | Supuesto actual | Impacto |
|---|---|---|---|
| D1 | **No show parcial:** ¿qué noches se cobran? | Las **primeras** N noches reservadas | Define a qué mes se imputa el cobro cuando la reserva cruza meses |
| D2 | **IVA en el EDP:** ¿el documento debe mostrar neto + IVA + total? | Solo se muestra el **neto** | Cambia el formato del EDP y el CSV |
| D3 | **Late check-out** (salida después de las 11:00): ¿se cobra? ¿cuánto? | No se contempla | Podría ser un concepto adicional o media tarifa |
| D4 | **Formato oficial del EDP:** ¿el cliente exige un formato, logo o numeración específica? | Formato propio, numeración correlativa global | Afecta el PDF de G7 |
| D5 | **Cierre de períodos:** ¿se bloquea la edición de registros que ya están en un EDP emitido? | Hoy **no** se bloquea | Riesgo de auditoría; ver R1 y G4 |
| D6 | **Quién puede anular un EDP:** hoy ADMIN y OPERADOR | ADMIN y OPERADOR | Podría restringirse solo a ADMIN |
| D7 | **Dominio propio** (`hoteleria.tuempresa.cl`) en lugar de `*.vercel.app` | Dirección de Vercel | Se configura en Vercel → Settings → Domains |
| D8 | **Plan de Supabase** para producción (ver R3 y R4) | Gratuito | Pausa por inactividad y sin respaldos |

Las que respondiste como "omitir" (D1) o "no aplica" (cupo contractual) no bloquean nada.

---

## PARTE E — Riesgos y limitaciones conocidos

Dichos con franqueza para que decidas con información completa.

| # | Riesgo | Gravedad | Detalle y mitigación |
|---|---|---|---|
| R1 | **Se puede editar un registro ya incluido en un EDP emitido** | Alta | El EDP emitido no cambia (es un snapshot), pero el registro de origen sí podría, dejando de coincidir con lo cobrado. Mitigación: G4 |
| R2 | **Escritura directa a tablas por API** | Media | La interfaz siempre guarda por la función transaccional, pero las políticas de seguridad actuales también permiten a un OPERADOR con su sesión escribir directo en `registro`, `tramo` y `cargo_adicional` (saltándose la bitácora legible; la tabla técnica `auditoria` sí registra). Mitigación: G3 |
| R3 | **El plan gratuito de Supabase pausa proyectos tras un período de inactividad** | Media | Verifica el plazo vigente en su página de precios. Una plataforma operativa diaria no debería pausarse, pero un mes sin uso sí podría. Se reactiva desde el panel |
| R4 | **Respaldos** | Alta | Sin respaldos automáticos en el plan gratuito. Mitigación: plan Pro o G10 (respaldo automático) más el respaldo JSON mensual |
| R5 | **Nunca se probó contra un Supabase real** | Media | Lógica SQL y UI se probaron por separado; falta la prueba integrada. Mitigación: B1 y prompt G1 |
| R6 | **Sin actualización en tiempo real** | Baja | Si otro usuario crea o cambia algo, ves el cambio al recargar o al guardar. Mitigación: G8 |
| R7 | **Alta de usuarios manual en Supabase** | Baja | La app asigna roles pero no crea cuentas. Mitigación: G9 |
| R8 | **Modo local accidental en producción** | Baja | Si las variables `VITE_*` se pierden, la web funciona en modo local sin login, con datos solo del navegador del visitante (no expone la base central). Se detecta porque no pide login |
| R9 | **Pruebas de navegador no incluidas en el repositorio** | Media | Las pruebas de extremo a extremo que usé fueron scripts de trabajo; no hay CI. Mitigación: G5 |
| R10 | **Autenticación sin segundo factor** | Media | Recomendado activar MFA para cuentas ADMIN. Supabase lo ofrece; no está integrado en la interfaz |

---

## PARTE F — Backlog técnico priorizado

| Prioridad | Prompt | Tema | Por qué |
|---|---|---|---|
| 1 | G1 | Prueba real contra Supabase y corrección de lo que aparezca | Cierra R5 |
| 1 | G2 | Validación de cálculo contra un mes real | Es el objetivo central del sistema |
| 1 | G4 | Bloquear edición de registros con EDP emitido | Cierra R1, auditoría |
| 1 | G3 | Endurecer seguridad: escritura solo vía función | Cierra R2 |
| 2 | G5 | Pruebas E2E en el repositorio y CI | Evita regresiones |
| 2 | G10 | Respaldo automático de la base | Cierra R4 |
| 2 | G7 | EDP en PDF con formato formal (y IVA si aplica) | Entregable al cliente |
| 3 | G6 | Informes y tablero de gestión | Toma de decisiones |
| 3 | G9 | Gestión de usuarios desde la app | Comodidad |
| 3 | G8 | Actualización en tiempo real | Multiusuario fluido |
| 3 | G11 | Late check-out y reglas de cargo | Si D3 lo requiere |
| 3 | G12 | Uso en tablet / celular | Recepción móvil |
| 4 | G13 | Fusionar a `main` y flujo de ramas | Orden del repositorio |
| 4 | G14 | Revisión general de código y seguridad | Control de calidad |

---

## PARTE G — Prompts listos para copiar

### Instrucciones comunes (pégalas al inicio de CUALQUIER sesión nueva)

```
Contexto: trabajas en el repositorio oscarturinap-ai/Hoteleria-Copiapo, rama
claude/loving-knuth-0t8qvg. Es una plataforma web de control de ingresos, asignación hotelera
y Estados de Pago (EDP) para un contrato con el Hotel Tabancura (madre) y los hoteles en
convenio Alto Atacama y Muray, en Copiapó. Stack: React + TypeScript + Vite, dominio puro en
src/domain, persistencia tras la interfaz Repository (src/persistence: localStorage y
Supabase), esquema SQL en supabase/migrations.

Antes de tocar nada, lee README.md, docs/DESPLIEGUE.md y docs/PENDIENTES.md.

Reglas de negocio ya fijadas (no las cambies sin avisarme):
- Se cobra por noche; salida a las 11:00. IN 09-nov y OUT 12-nov = 3 noches (9, 10 y 11).
- La tarifa de alojamiento incluye desayuno; almuerzo, cena, colación, bebidas, agua y demás
  son adicionales. Todos los montos son NETOS, en pesos chilenos enteros.
- EDP = total pasajeros, total noches × tarifa del hotel + adicionales = monto neto.
- Una derivación o cambio de tarifa es UN registro con varios tramos contiguos.
- No show: cobro total, parcial (primeras N noches) o sin cargo.
- Cero tolerancia a errores de cálculo; un EDP emitido es inmutable.

Cómo trabajar:
- Comunícate en español, de forma directa, técnica y estructurada.
- Verifica siempre con: npx tsc -p tsconfig.json, npx vitest run y npm run build.
- Toda regla nueva lleva pruebas automáticas. No saltes ni elimines pruebas para dejar en verde.
- Cambios de base de datos: nueva migración numerada en supabase/migrations, NUNCA editar una
  ya publicada; actualizar supabase/setup_completo.sql con npm run sql:setup; validarla en un
  PostgreSQL local.
- Haz commits en la rama claude/loving-knuth-0t8qvg y súbelos. No crees Pull Requests salvo
  que yo lo pida. No pongas secretos ni claves en el repositorio ni en tus mensajes.
- Al terminar, dime qué probaste y qué NO pudiste probar.
```

---

### G1 — Prueba real contra Supabase y corrección de fallas

Úsalo después de completar la Parte A. **Nunca pegues contraseñas de ADMIN.** Crea un usuario temporal de prueba con rol LECTOR y bórralo al terminar.

```
[Pega aquí las "Instrucciones comunes"]

Tarea: la plataforma está desplegada en <DIRECCIÓN DE VERCEL> con un proyecto Supabase real.
Nunca se ha probado contra un Supabase real; hasta ahora solo con respuestas simuladas.

Datos de conexión (la anon key es pública por diseño):
- Project URL: <URL>
- anon key: <ANON KEY>
- Usuario de prueba LECTOR: <email> / <contraseña temporal>

Qué hacer:
1. Con Playwright (ya instalado en el entorno), ingresa con el usuario de prueba y ejecuta la
   parte de solo lectura de la lista B1 de docs/PENDIENTES.md: login, listados, rol LECTOR sin
   permisos de escritura.
2. Verifica por API (sin service_role) que: un LECTOR no puede escribir en ninguna tabla ni
   llamar a guardar_registro; un visitante sin sesión no puede leer nada; PostgREST devuelve
   las columnas esperadas por src/persistence/supabaseMapeo.ts (compara tipos: bigint como
   número o texto, fechas, jsonb).
3. Si algo falla, corrígelo con pruebas que reproduzcan la falla y vuelve a probar.
4. Para las pruebas de escritura (crear registro, check-in, EDP), pídeme un usuario
   OPERADOR temporal; no las hagas con el ADMIN.
5. Entrega un informe: qué pasó, qué corregiste y qué quedó sin probar.

Aceptación: el informe cubre todos los puntos de B1 que correspondan al rol de prueba y no
hay errores de consola.
```

### G2 — Validación de cálculo contra un caso real

```
[Pega aquí las "Instrucciones comunes"]

Tarea: validar que el cálculo del EDP coincide al peso con un caso real.

Caso real (completa con tus datos; ejemplo del formato):
- Hoteles y tarifas netas vigentes: Tabancura alojamiento $X; Muray alojamiento $Y; cena $Z...
- Huéspedes: RUT, nombre, empresa, solicitante, fecha de solicitud, IN, OUT, estado, derivaciones
  y adicionales con fecha, concepto, cantidad y precio.
- Resultado esperado (calculado por mí en Excel): total pasajeros, total noches, neto total,
  subtotal por hotel y subtotal por empresa.

Qué hacer:
1. Convierte el caso en una prueba automática en src/domain (fixtures reales).
2. Ejecuta calcularEDP y compara con mi resultado esperado.
3. Si hay diferencia, identifica la causa: bug de cálculo, regla de negocio mal interpretada
   (por ejemplo, imputación de noches en cambios de mes) o dato mal ingresado. Explícamelo
   antes de cambiar una regla.
4. Prueba casos de borde: estadía que cruza meses, derivación en el cambio de mes, no show
   parcial, cambio de tarifa a mitad de estadía, check-out anticipado, 29-feb.

Aceptación: el resultado coincide exactamente (diferencia $0) y el caso queda como prueba
permanente.
```

### G3 — Endurecer seguridad: escritura solo vía función (cierra R2)

```
[Pega aquí las "Instrucciones comunes"]

Tarea: hoy las políticas RLS de las tablas registro, tramo, cargo_adicional y huesped permiten a
un OPERADOR escribir directamente por la API REST, saltándose guardar_registro y su bitácora
legible. La interfaz siempre usa guardar_registro, pero la base debe imponerlo.

Qué hacer (migración 0005):
1. Quitar a los roles authenticated/anon los permisos INSERT, UPDATE y DELETE directos sobre
   registro, tramo, cargo_adicional, huesped y registro_evento; dejar solo SELECT.
2. Convertir guardar_registro (y la importación) en SECURITY DEFINER con search_path fijo,
   validando el rol con rol_actual() dentro de la función, y que registre auditoría del usuario
   real (auth.uid()).
3. Revisar que los triggers anti-sobreventa, contigüidad y bitácora sigan funcionando.
4. Revisar también estado_pago: la emisión debe ir por una función que calcule total_neto en el
   servidor a partir del snapshot, y la anulación por otra función; sin escritura directa.
5. Pruebas en PostgreSQL local, con el stub de Supabase en rol "authenticated": un OPERADOR no
   puede insertar/actualizar/borrar directo; sí puede por la función; un LECTOR no puede nada.
6. Actualizar supabaseRepo.ts si cambian las rutas de escritura de estado_pago, con pruebas.

Aceptación: ninguna escritura directa funciona con un rol de aplicación; todas las pruebas de
B1 siguen pasando; setup_completo.sql regenerado y validado.
```

### G4 — Bloquear edición de registros con EDP emitido (cierra R1)

```
[Pega aquí las "Instrucciones comunes"]

Tarea: impedir que se modifique un registro cuyas noches o cargos están incluidos en un EDP
EMITIDO (no anulado), para que lo cobrado siga coincidiendo con el registro de origen.

Diseño esperado (propónmelo brevemente antes de implementar):
- Un registro queda "congelado" si existe un EDP emitido y no anulado cuyo período y filtros
  incluyen alguna de sus noches o cargos.
- Un registro congelado no permite editar tramos, adicionales, estado ni noShow; sí permite
  ver la bitácora y las observaciones.
- Para corregirlo: anular el EDP (con motivo), corregir el registro y emitir un EDP nuevo. Mostrar
  esto claramente en la interfaz con el folio del EDP que lo congela.
- Implementarlo en TRES capas: función pura en src/domain (con pruebas), validación en la
  interfaz (botones deshabilitados y mensaje claro) y en la base de datos (migración 0005 con
  trigger o chequeo dentro de guardar_registro). Modo local y modo Supabase deben comportarse
  igual.

Casos de borde a probar: estadía que cruza dos períodos con solo uno emitido; EDP anulado
libera el registro; EDP filtrado por hotel o por empresa; registro derivado con un tramo
cobrado y otro no; cargo adicional agregado después del EDP (debe bloquearse o quedar para el
siguiente período, según lo que acordemos).

Aceptación: pruebas de dominio, de interfaz (Playwright) y SQL; documentación actualizada.
```

### G5 — Pruebas de extremo a extremo en el repositorio y CI

```
[Pega aquí las "Instrucciones comunes"]

Tarea: convertir las pruebas de navegador en una suite permanente.

Qué hacer:
1. Agregar @playwright/test como dependencia de desarrollo (en este entorno el navegador
   Chromium ya está instalado; usa el que existe, no ejecutes "playwright install").
2. Crear e2e/ con pruebas del flujo completo en modo local: maestros, tarifas, inventario,
   registro con derivación, check-in con habitación obligatoria, sobreventa rechazada, cargo,
   check-out anticipado, EDP (calcular, emitir, CSV), LECTOR sin escritura (modo Supabase con
   respuestas simuladas, como en las pruebas previas).
3. Script npm run e2e y archivo .github/workflows/ci.yml que en cada push corra: instalación
   limpia (npm ci), tsc, vitest, build y e2e. Que falle si algo falla; que suba capturas de las
   pruebas fallidas.
4. Documentar en el README cómo correrlas.

Aceptación: el CI pasa en verde en la rama; las pruebas no dependen de la hora actual (fijar
la fecha en el navegador de prueba).
```

### G6 — Informes y tablero de gestión

```
[Pega aquí las "Instrucciones comunes"]

Tarea: agregar una sección "Informes" de nivel ejecutivo, sobria y densa en información.

Informes (todos con filtros de período, hotel y empresa, y exportación CSV):
1. Ocupación: noches ocupadas por hotel y por día; porcentaje de camas ocupadas si hay inventario.
2. Costo por empresa y por solicitante: noches, alojamiento, adicionales, neto.
3. Composición de adicionales por concepto.
4. Tendencia mensual: neto, noches y pasajeros, últimos 12 meses.
5. Pendientes de facturar: noches de registros cerrados que NO están en ningún EDP emitido
   (conciliación), con alerta si hay noches sin cobrar.
6. No show: cantidad y monto cobrado vs. no cobrado.

Reglas: todos los cálculos viven en src/domain con pruebas y reutilizan la misma lógica del
EDP (no dupliques fórmulas); la suma de cualquier informe debe cuadrar con el EDP del mismo
período. Usa el skill "dataviz" para los gráficos. Respeta los permisos por rol.

Aceptación: pruebas de cuadratura entre informes y EDP; capturas de pantalla del resultado.
```

### G7 — EDP en PDF con formato formal (y IVA si corresponde)

Antes de usar este prompt, responde D2 y D4 de la Parte D.

```
[Pega aquí las "Instrucciones comunes"]

Tarea: generar el EDP como documento PDF de presentación formal al cliente.

Decisiones que ya tomé:
- ¿Mostrar IVA? <sí/no; si sí, tasa 19% sobre el neto, con redondeo a peso entero definido
  como: ______>
- Formato: <logo, datos de la empresa emisora, texto legal, firma, numeración>

Qué hacer:
1. Documento con encabezado (emisor, cliente, N° de EDP, período, fecha de emisión), resumen
   (pasajeros, noches, alojamiento, adicionales, neto [+ IVA + total]), subtotales por hotel,
   empresa y concepto, y detalle por huésped (RUT, nombre, solicitante, fecha de solicitud,
   IN/OUT, estado, noches, tarifa, adicionales, neto).
2. Paginado correcto (encabezados repetidos, totales al final) y apto para impresión A4.
3. Si hay IVA, el cálculo vive en src/domain con pruebas de redondeo y debe cuadrar con el
   neto; el EDP emitido guarda el IVA en el snapshot (migración si hace falta).
4. Descarga con nombre estándar (EDP_N°_cliente_período.pdf). Conserva el CSV.

Aceptación: PDF revisado visualmente (adjunta capturas), totales idénticos al EDP en pantalla.
```

### G8 — Actualización en tiempo real

```
[Pega aquí las "Instrucciones comunes"]

Tarea: que los cambios de otros usuarios aparezcan sin recargar (modo Supabase).

Qué hacer:
1. Suscribirse a cambios (Supabase Realtime) en registro_evento, estado_pago, tarifa,
   habitacion, empresa y solicitante, y refrescar los datos afectados con control de ráfagas
   (debounce).
2. Habilitar publicación Realtime en una migración, respetando RLS.
3. Mostrar un aviso discreto "Datos actualizados por <usuario>" cuando algo cambie, sin pisar
   un formulario abierto: si el registro que tienes abierto cambia, avisar y bloquear el
   guardado hasta reabrirlo.
4. Reconexión automática y un indicador de estado de conexión.
5. Pruebas con el cliente simulado; el modo local no se ve afectado.

Aceptación: dos sesiones ven los cambios mutuos en pocos segundos; sin bucles de recarga.
```

### G9 — Gestión de usuarios desde la aplicación

```
[Pega aquí las "Instrucciones comunes"]

Tarea: que un ADMIN pueda invitar y dar de baja usuarios desde la sección Usuarios, sin entrar
al panel de Supabase.

Restricción de seguridad: la clave service_role NUNCA debe estar en el navegador ni en el
repositorio. Propón e implementa una Supabase Edge Function (con la service_role como secreto
del servidor) que:
- Verifique que quien llama es ADMIN activo (leyendo su JWT y la tabla perfil).
- Invite por email o cree el usuario con rol inicial indicado.
- Permita restablecer contraseña y desactivar.
- Valide email y rol, y registre en auditoría quién hizo qué.

Documenta el despliegue de la función (supabase CLI) y los secretos necesarios en
docs/DESPLIEGUE.md. Pruebas: función con un cliente simulado; interfaz con respuestas simuladas.

Aceptación: un ADMIN invita a un usuario, este queda con el rol elegido; un OPERADOR o LECTOR
no puede invocar la función (probado).
```

### G10 — Respaldo automático de la base de datos (cierra R4)

```
[Pega aquí las "Instrucciones comunes"]

Tarea: respaldo automático y verificable, independiente del plan de Supabase.

Qué hacer:
1. Una GitHub Action programada (diaria) que haga pg_dump de la base usando una cadena de
   conexión guardada como secreto de GitHub (yo la cargaré; indícame exactamente qué secreto
   y cómo obtenerlo), comprima y cifre el archivo (por ejemplo con age o gpg) y lo guarde como
   artefacto privado o en un almacenamiento que acordemos.
2. Retención definida (por ejemplo 30 diarios y 12 mensuales) y limpieza automática.
3. Un script de restauración documentado y una prueba de restauración en PostgreSQL local que
   confirme que folios, bitácora y EDP coinciden.
4. Alerta si el respaldo falla (la Action falla y notifica).
5. Actualizar docs/PENDIENTES.md (C3 y R4).

Importante: el repositorio puede ser público o privado; no guardes respaldos con datos de
huéspedes en un lugar público. Confírmame esto antes de elegir el almacenamiento.

Aceptación: respaldo restaurado con éxito en una base limpia y datos idénticos.
```

### G11 — Late check-out y reglas de cargo

Antes de usarlo, responde D3 de la Parte D.

```
[Pega aquí las "Instrucciones comunes"]

Tarea: contemplar salidas posteriores a las 11:00.

Regla acordada: <por ejemplo: salida hasta las 15:00 sin cargo; entre 15:00 y 18:00 cobra 50%
de la tarifa de alojamiento; después de las 18:00 cobra una noche completa>.

Qué hacer:
1. Nuevo concepto de cargo "Late check-out" con precio por tarifario o cálculo derivado de la
   tarifa del hotel (según la regla), con snapshot del precio como los demás adicionales.
2. Acción en el check-out: indicar hora real de salida y proponer el cargo correspondiente,
   editable por un ADMIN.
3. Pruebas de dominio con los tramos horarios y de borde (exactamente 15:00, 18:00).
4. Migración (nuevo valor del tipo concepto) y respaldo local migrado.

Aceptación: pruebas verdes; el cargo aparece en folio, EDP y CSV.
```

### G12 — Uso cómodo en tablet y celular

```
[Pega aquí las "Instrucciones comunes"]

Tarea: la recepción usará tablet o celular. Hacer la interfaz usable en pantallas de 390 px a
1024 px sin perder densidad de información en escritorio.

Qué hacer:
1. Revisar con Playwright en viewports de iPhone y iPad (usa los dispositivos con nombre de
   Playwright) las vistas: Panel del día, Calendario, Registros, formulario y EDP.
2. Menú de navegación plegable, tablas con desplazamiento y columnas prioritarias, formularios
   en una columna, botones de 44 px mínimo de alto táctil.
3. Calendario: desplazamiento horizontal fluido con la columna de huésped fija.
4. Sin romper el modo escritorio ni la impresión del EDP.

Aceptación: capturas en 3 tamaños por vista, sin desbordes horizontales de la página completa.
```

### G13 — Fusionar a `main` y ordenar el repositorio

```
[Pega aquí las "Instrucciones comunes"]

Tarea: ordenar el flujo de ramas. Hoy todo está en claude/loving-knuth-0t8qvg y el repositorio
solo tiene un commit inicial en main.

Qué hacer (pídeme confirmación antes de crear el Pull Request o fusionar):
1. Proponer el Pull Request de claude/loving-knuth-0t8qvg a main con descripción clara.
2. Tras mi aprobación, fusionarlo y dejar main como rama de producción de Vercel.
3. Agregar .github/pull_request_template.md, CODEOWNERS y protección de rama recomendada
   (CI obligatorio antes de fusionar), documentando los pasos que debo hacer yo en GitHub.
4. Actualizar docs/DESPLIEGUE.md para usar main.

Aceptación: Vercel despliega desde main; el CI pasa; la rama de trabajo queda sincronizada.
```

### G14 — Revisión general de código y seguridad

```
[Pega aquí las "Instrucciones comunes"]

Tarea: revisión independiente antes de uso intensivo.

Qué hacer:
1. Ejecuta el skill /code-review sobre todo el repositorio y /security-review sobre las
   políticas RLS, las funciones SQL (SECURITY DEFINER, search_path, inyección), la
   autenticación y el manejo de errores.
2. Revisa accesibilidad básica (etiquetas, foco, contraste) y rendimiento con 5.000 registros
   (genera datos sintéticos y mide el panel del día, el calendario y el cálculo del EDP).
3. Entrégame los hallazgos ordenados por gravedad, con evidencia, y corrige los confirmados
   con pruebas. Lo opinable (estilo) solo lo listas.

Aceptación: informe de hallazgos, correcciones con pruebas y cero errores nuevos de tipos o build.
```

---

## Registro de decisiones tomadas (para no volver a discutirlas)

| Tema | Decisión |
|---|---|
| Ingreso de datos | 100% manual en la plataforma; **sin carga masiva desde Excel** |
| Referencia de operación | Flujo de recepción de un PMS tipo Cloudbeds, adaptado al contrato |
| Tarifas | Netas; alojamiento incluye desayuno; el resto adicional |
| Cobro de noches | Por noche, salida 11:00 (IN 9 / OUT 12 = 3 noches) |
| Derivación | Un solo registro con tramos y tarifa propia por tramo |
| Cupo contractual de habitaciones | **No hay límite** |
| Habitaciones | Inventario por hotel; un hotel sin inventario opera por cupo |
| Publicación | Internet con Vercel y Supabase; datos base cargados manualmente en línea |
| Ítems que dijiste "omitir" | Confirmación del no show parcial, inventario real de habitaciones |
