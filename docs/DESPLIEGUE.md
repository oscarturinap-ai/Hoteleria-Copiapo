# Despliegue en Internet (Supabase + Vercel)

Tiempo estimado: 30 minutos. Costo: los planes gratuitos de ambos servicios alcanzan para empezar.

## 1. Supabase (base de datos y login)

1. Crear cuenta en <https://supabase.com> y **New project**. Elegir región cercana (p. ej. São Paulo) y guardar la contraseña de la base de datos.
2. Esperar a que el proyecto termine de crearse.
3. **SQL Editor → New query**: pegar **todo** el contenido de `supabase/setup_completo.sql` y presionar **Run**. Debe terminar con *Success*. Ejecutarlo una sola vez.
4. **Project Settings → API**: copiar dos valores:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public key** (clave larga que empieza con `eyJ`). No usar la `service_role`.
5. **Authentication → Sign In / Providers → Email**: desactivar **Allow new users to sign up** (solo el administrador crea cuentas). Dejar activado *Confirm email* solo si se usarán invitaciones por correo.
6. **Authentication → Users → Add user → Create new user**: ingresar el email y una contraseña, marcando *Auto Confirm User*. **El primer usuario que se crea queda como ADMIN.**

## 2. Vercel (publicación)

1. Crear cuenta en <https://vercel.com> con GitHub (**Continue with GitHub**).
2. **Add New → Project** e importar el repositorio `Hoteleria-Copiapo`. Autorizar el acceso a ese repositorio.
3. **Branch**: usar `claude/loving-knuth-0t8qvg` como rama de producción (Settings → Git → Production Branch) o fusionarla antes a `main`.
4. Framework: Vercel detecta **Vite** y toma el resto desde `vercel.json`.
5. En **Environment Variables** agregar, **antes** de desplegar:

   | Nombre | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | la Project URL del paso 1.4 |
   | `VITE_SUPABASE_ANON_KEY` | la anon public key del paso 1.4 |

6. **Deploy**. Vercel entrega una dirección del tipo `https://hoteleria-copiapo.vercel.app`.

> Las variables `VITE_*` se incorporan al compilar: si se cambian después, hay que **Redeploy**.

## 3. Ajuste final en Supabase

**Authentication → URL Configuration**: en *Site URL* poner la dirección que entregó Vercel. Sin esto, el enlace de "¿Olvidó su contraseña?" no vuelve a la plataforma.

## 4. Primer ingreso y carga de datos

1. Entrar a la dirección de Vercel con el email y la contraseña del paso 1.6. Arriba a la derecha debe aparecer su nombre con la etiqueta **ADMIN** y el menú **Usuarios**.
2. **Maestros**: cargar empresas contratantes y solicitantes.
3. **Hoteles, habitaciones y tarifas**: cargar el tarifario neto de cada hotel (alojamiento, almuerzo, cena, etc.) con su vigencia y, si se quiere asignar habitaciones, el inventario.
4. Crear los demás usuarios en Supabase (paso 1.6). Al primer ingreso quedan como LECTOR; asignarles **OPERADOR** o **ADMIN** en **Usuarios**.

## Solución de problemas

| Síntoma | Causa probable |
|---|---|
| Entra directo, sin pedir login | Faltan las variables `VITE_*` en Vercel, o no se hizo Redeploy: está en modo local |
| "Su usuario no tiene perfil asignado" | El usuario se creó antes de ejecutar el SQL; borrarlo y volver a crearlo |
| "Email o contraseña incorrectos" | Usuario sin *Auto Confirm*, o contraseña mal escrita |
| "Su rol no tiene permiso" | El usuario es LECTOR; cambiar el rol en **Usuarios** |
| Pantalla en blanco | Revisar en Vercel → Deployments → Build Logs |
