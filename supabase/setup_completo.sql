-- ════════════════════════════════════════════════════════════════════════════
-- Hotelería Copiapó · Instalación completa (migraciones 0001 a 0004 concatenadas).
-- Pegar y ejecutar UNA sola vez en Supabase → SQL Editor, en un proyecto nuevo y vacío.
-- Generado con: npm run sql:setup  (no editar a mano; editar las migraciones).
-- ════════════════════════════════════════════════════════════════════════════

-- >>>>>>>>>> supabase/migrations/0001_esquema_inicial.sql
-- ════════════════════════════════════════════════════════════════════════════
-- Hotelería Copiapó · Esquema inicial (PostgreSQL / Supabase)
-- Espejo relacional de src/domain/types.ts. Montos: bigint CLP neto (sin decimales).
-- Estado: DISEÑO DE DESTINO. La app aún usa LocalStorageRepository.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists btree_gist;  -- exclusión de rangos (anti doble asignación)

-- ───────── Tipos ─────────
create type tipo_hotel      as enum ('MADRE', 'CONVENIO');
create type concepto        as enum ('ALOJAMIENTO','ALMUERZO','CENA','COLACION','BEBIDA','AGUA','LAVANDERIA','OTRO');
create type estado_registro as enum ('RESERVADO','IN_HOUSE','CHECK_OUT','NO_SHOW','ANULADO');
create type modalidad_ns    as enum ('TOTAL','PARCIAL','SIN_CARGO');
create type estado_edp      as enum ('EMITIDO','ANULADO');
create type rol_usuario     as enum ('ADMIN','OPERADOR','LECTOR');

-- ───────── Usuarios (perfil sobre auth.users) ─────────
create table perfil (
  id      uuid primary key references auth.users(id) on delete cascade,
  nombre  text not null,
  rol     rol_usuario not null default 'LECTOR',
  activo  boolean not null default true
);

create or replace function rol_actual() returns rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from perfil where id = auth.uid() and activo
$$;

-- ───────── Maestros ─────────
create table hotel (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null unique,
  tipo    tipo_hotel not null,
  activo  boolean not null default true
);
create unique index un_solo_hotel_madre on hotel (tipo) where tipo = 'MADRE';

create table tarifa (
  id             uuid primary key default gen_random_uuid(),
  hotel_id       uuid not null references hotel(id),
  concepto       concepto not null,
  monto          bigint not null check (monto > 0),
  vigente_desde  date not null,
  vigente_hasta  date,
  check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  -- Sin vigencias superpuestas por hotel/concepto (equivale a solapamientosTarifa()).
  exclude using gist (
    hotel_id with =, concepto with =,
    daterange(vigente_desde, coalesce(vigente_hasta, 'infinity'::date), '[]') with &&
  )
);

create table empresa (
  id            uuid primary key default gen_random_uuid(),
  rut           text unique,                 -- normalizado '76086428-5'
  razon_social  text not null,
  activo        boolean not null default true
);

create table solicitante (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  empresa_id  uuid references empresa(id),
  cargo       text not null default '',
  email       text not null default '',
  activo      boolean not null default true
);

create table huesped (
  rut     text primary key,                  -- normalizado '12345678-K'
  nombre  text not null
);

-- ───────── Registros ─────────
create sequence folio_registro_seq;

create table registro (
  id                uuid primary key default gen_random_uuid(),
  folio             integer not null unique default nextval('folio_registro_seq'),
  huesped_rut       text not null references huesped(rut),
  empresa_id        uuid not null references empresa(id),
  solicitante_id    uuid not null references solicitante(id),
  fecha_solicitud   date not null,
  estado            estado_registro not null default 'RESERVADO',
  ns_modalidad      modalidad_ns,
  ns_noches         integer,
  observaciones     text not null default '',
  -- Desnormalizados y mantenidos por trigger desde tramo (IN / OUT).
  ingreso           date,
  salida            date,
  creado_por        uuid references auth.users(id) default auth.uid(),
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  check ((estado = 'NO_SHOW') = (ns_modalidad is not null)),
  check (ns_modalidad is distinct from 'PARCIAL' or ns_noches >= 1)
);
create index on registro (empresa_id);
create index on registro (ingreso, salida);

create table tramo (
  id            uuid primary key default gen_random_uuid(),
  registro_id   uuid not null references registro(id) on delete cascade,
  orden         smallint not null,
  hotel_id      uuid not null references hotel(id),
  desde         date not null,
  hasta         date not null check (hasta > desde),   -- [desde, hasta): mínimo 1 noche
  tarifa_noche  bigint not null check (tarifa_noche > 0),
  motivo        text not null default '',
  unique (registro_id, orden),
  -- Tramos de un mismo registro no se superponen.
  exclude using gist (registro_id with =, daterange(desde, hasta, '[)') with &&)
);

create table cargo_adicional (
  id               uuid primary key default gen_random_uuid(),
  registro_id      uuid not null references registro(id) on delete cascade,
  fecha            date not null,
  hotel_id         uuid not null references hotel(id),
  concepto         concepto not null check (concepto <> 'ALOJAMIENTO'),
  descripcion      text not null default '',
  cantidad         integer not null check (cantidad > 0),
  precio_unitario  bigint not null check (precio_unitario >= 0),
  check (concepto <> 'OTRO' or length(trim(descripcion)) > 0)
);

-- Mantiene IN/OUT en registro y valida contigüidad de tramos.
create or replace function sync_registro_fechas() returns trigger
language plpgsql as $$
declare
  rid uuid := coalesce(new.registro_id, old.registro_id);
  gaps int;
begin
  select count(*) into gaps from (
    select desde, lag(hasta) over (order by orden) as prev_hasta from tramo where registro_id = rid
  ) t where prev_hasta is not null and prev_hasta <> desde;
  if gaps > 0 then raise exception 'Tramos no contiguos en registro %', rid; end if;

  update registro r set
    ingreso = (select min(desde) from tramo where registro_id = rid),
    salida  = (select max(hasta) from tramo where registro_id = rid),
    actualizado_en = now()
  where r.id = rid;
  return null;
end $$;

create constraint trigger trg_tramo_sync after insert or update or delete on tramo
  deferrable initially deferred for each row execute function sync_registro_fechas();

-- ───────── Estados de pago (inmutables) ─────────
create sequence correlativo_edp_seq;

create table estado_pago (
  id             uuid primary key default gen_random_uuid(),
  correlativo    integer not null unique default nextval('correlativo_edp_seq'),
  desde          date not null,
  hasta          date not null check (hasta >= desde),
  hotel_id       uuid references hotel(id),
  empresa_id     uuid references empresa(id),
  estado         estado_edp not null default 'EMITIDO',
  observaciones  text not null default '',
  resultado      jsonb not null,             -- snapshot ResultadoEDP
  etiquetas      jsonb not null,             -- id → nombre al emitir
  total_neto     bigint not null,
  emitido_por    uuid references auth.users(id) default auth.uid(),
  emitido_en     timestamptz not null default now()
);

-- Un EDP emitido sólo puede pasar a ANULADO; el snapshot no se modifica nunca.
create or replace function edp_inmutable() returns trigger language plpgsql as $$
begin
  if old.resultado is distinct from new.resultado or old.total_neto <> new.total_neto
     or old.desde <> new.desde or old.hasta <> new.hasta then
    raise exception 'EDP % es inmutable', old.correlativo;
  end if;
  if old.estado = 'ANULADO' then raise exception 'EDP % ya anulado', old.correlativo; end if;
  return new;
end $$;
create trigger trg_edp_inmutable before update on estado_pago for each row execute function edp_inmutable();

-- ───────── Auditoría ─────────
create table auditoria (
  id          bigserial primary key,
  tabla       text not null,
  registro_id uuid,
  operacion   text not null,
  antes       jsonb,
  despues     jsonb,
  usuario     uuid default auth.uid(),
  en          timestamptz not null default now()
);

create or replace function auditar() returns trigger language plpgsql security definer as $$
begin
  insert into auditoria (tabla, registro_id, operacion, antes, despues)
  values (tg_table_name, coalesce(new.id, old.id), tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['hotel','tarifa','empresa','solicitante','registro','tramo','cargo_adicional','estado_pago'] loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$I for each row execute function auditar()', t);
  end loop;
end $$;

-- ───────── RLS ─────────
-- LECTOR: lectura. OPERADOR: CRUD registros + emitir EDP. ADMIN: además maestros y tarifas.
do $$ declare t text; begin
  foreach t in array array['hotel','tarifa','empresa','solicitante','huesped','registro','tramo','cargo_adicional','estado_pago','auditoria'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy lectura on %I for select using (rol_actual() is not null)', t);
  end loop;
  foreach t in array array['huesped','registro','tramo','cargo_adicional','estado_pago'] loop
    execute format('create policy escritura on %I for all using (rol_actual() in (''ADMIN'',''OPERADOR'')) with check (rol_actual() in (''ADMIN'',''OPERADOR''))', t);
  end loop;
  foreach t in array array['hotel','tarifa','empresa','solicitante'] loop
    execute format('create policy escritura on %I for all using (rol_actual() = ''ADMIN'') with check (rol_actual() = ''ADMIN'')', t);
  end loop;
end $$;
-- estado_pago: nadie borra.
create policy sin_borrado on estado_pago as restrictive for delete using (false);
alter table perfil enable row level security;
create policy propio on perfil for select using (id = auth.uid() or rol_actual() = 'ADMIN');

-- ───────── Semilla ─────────
insert into hotel (nombre, tipo) values
  ('Hotel Tabancura', 'MADRE'),
  ('Hotel Alto Atacama', 'CONVENIO'),
  ('Hotel Muray', 'CONVENIO');

-- >>>>>>>>>> supabase/migrations/0002_operacion_recepcion.sql
-- ════════════════════════════════════════════════════════════════════════════
-- 0002 · Operación de recepción: N° de habitación y bitácora operativa.
-- Espejo de la migración local v1 → v2 (src/persistence/localStorageRepo.ts).
-- ════════════════════════════════════════════════════════════════════════════

alter table tramo add column habitacion text not null default '';

create type accion_registro as enum ('CREADO','EDITADO','CHECK_IN','CHECK_OUT','NO_SHOW','ANULADO','CARGO');

-- Bitácora legible por operador (complementa la tabla técnica `auditoria`).
create table registro_evento (
  id           bigserial primary key,
  registro_id  uuid not null references registro(id) on delete restrict,
  accion       accion_registro not null,
  detalle      text not null default '',
  usuario      uuid references auth.users(id) default auth.uid(),
  usuario_nombre text not null,
  en           timestamptz not null default now()
);
create index on registro_evento (registro_id, en);

-- Append-only: ni actualización ni borrado, para nadie.
create or replace function bitacora_inmutable() returns trigger language plpgsql as $$
begin
  raise exception 'La bitácora es append-only';
end $$;
create trigger trg_bitacora_inmutable before update or delete on registro_evento
  for each row execute function bitacora_inmutable();

alter table registro_evento enable row level security;
create policy lectura on registro_evento for select using (rol_actual() is not null);
create policy insercion on registro_evento for insert with check (rol_actual() in ('ADMIN','OPERADOR'));

-- Control de concurrencia optimista: el cliente envía el actualizado_en leído;
-- el UPDATE debe incluir `where id = $1 and actualizado_en = $2` y fallar si afecta 0 filas.
create index on registro (id, actualizado_en);

-- >>>>>>>>>> supabase/migrations/0003_inventario_habitaciones.sql
-- ════════════════════════════════════════════════════════════════════════════
-- 0003 · Inventario de habitaciones y control de sobreventa.
-- Espejo de la migración local v2 → v3 y de src/domain/habitaciones.ts.
-- ════════════════════════════════════════════════════════════════════════════

create type tipo_habitacion as enum ('SINGLE','DOBLE','TWIN','TRIPLE','SUITE');

create table habitacion (
  id         uuid primary key default gen_random_uuid(),
  hotel_id   uuid not null references hotel(id),
  numero     text not null check (length(trim(numero)) > 0),
  tipo       tipo_habitacion not null default 'SINGLE',
  capacidad  smallint not null default 1 check (capacidad between 1 and 10),
  activa     boolean not null default true,
  notas      text not null default ''
);
create unique index habitacion_numero_unico on habitacion (hotel_id, lower(trim(numero)));

-- Convierte el N° en texto (0002) a inventario y referencia.
insert into habitacion (hotel_id, numero, notas)
  select distinct t.hotel_id, trim(t.habitacion), 'Creada por migración desde N° ingresado manualmente'
  from tramo t where trim(t.habitacion) <> ''
  on conflict do nothing;

alter table tramo add column habitacion_id uuid references habitacion(id);
update tramo t set habitacion_id = h.id
  from habitacion h where h.hotel_id = t.hotel_id and lower(trim(h.numero)) = lower(trim(t.habitacion)) and trim(t.habitacion) <> '';
alter table tramo drop column habitacion;
create index on tramo (habitacion_id, desde, hasta);

-- La habitación debe pertenecer al hotel del tramo.
create or replace function tramo_habitacion_hotel() returns trigger language plpgsql as $$
begin
  if new.habitacion_id is not null and not exists (
    select 1 from habitacion where id = new.habitacion_id and hotel_id = new.hotel_id
  ) then
    raise exception 'La habitación no pertenece al hotel del tramo';
  end if;
  return new;
end $$;
create trigger trg_tramo_habitacion_hotel before insert or update on tramo
  for each row execute function tramo_habitacion_hotel();

-- Sobreventa: ocupantes por noche ≤ capacidad. Ocupan inventario RESERVADO, IN_HOUSE, CHECK_OUT.
create or replace function verificar_capacidad(p_habitacion uuid) returns void language plpgsql as $$
declare
  cap smallint;
  noche date;
  n int;
begin
  if p_habitacion is null then return; end if;
  select capacidad into cap from habitacion where id = p_habitacion;
  select d::date, count(*) into noche, n
  from tramo t
  join registro r on r.id = t.registro_id
  cross join lateral generate_series(t.desde, t.hasta - 1, interval '1 day') d
  where t.habitacion_id = p_habitacion and r.estado in ('RESERVADO','IN_HOUSE','CHECK_OUT')
  group by d order by count(*) desc limit 1;
  if n > cap then
    raise exception 'Sobreventa: habitación % con % ocupantes la noche % (capacidad %)', p_habitacion, n, noche, cap;
  end if;
end $$;

create or replace function trg_capacidad_tramo() returns trigger language plpgsql as $$
begin
  if tg_op <> 'DELETE' then perform verificar_capacidad(new.habitacion_id); end if;
  return null;
end $$;
create constraint trigger trg_tramo_capacidad after insert or update on tramo
  deferrable initially deferred for each row execute function trg_capacidad_tramo();

-- Reactivar un registro (p.ej. anulado → reservado) también puede sobrevender.
create or replace function trg_capacidad_registro() returns trigger language plpgsql as $$
declare h uuid;
begin
  for h in select distinct habitacion_id from tramo where registro_id = new.id and habitacion_id is not null loop
    perform verificar_capacidad(h);
  end loop;
  return null;
end $$;
create constraint trigger trg_registro_capacidad after update of estado on registro
  deferrable initially deferred for each row execute function trg_capacidad_registro();

-- Reducir capacidad no puede dejar noches sobrevendidas.
create or replace function trg_capacidad_habitacion() returns trigger language plpgsql as $$
begin
  perform verificar_capacidad(new.id);
  return null;
end $$;
create constraint trigger trg_habitacion_capacidad after update of capacidad on habitacion
  deferrable initially deferred for each row execute function trg_capacidad_habitacion();

create trigger trg_audit_habitacion after insert or update or delete on habitacion
  for each row execute function auditar();

alter table habitacion enable row level security;
create policy lectura on habitacion for select using (rol_actual() is not null);
create policy escritura on habitacion for all using (rol_actual() = 'ADMIN') with check (rol_actual() = 'ADMIN');

-- >>>>>>>>>> supabase/migrations/0004_api_aplicacion.sql
-- ════════════════════════════════════════════════════════════════════════════
-- 0004 · API de aplicación para SupabaseRepository (src/persistence/supabaseRepo.ts).
--   - IDs fijos de los hoteles del contrato (iguales a la semilla local).
--   - Perfil automático al registrarse un usuario (el primero queda ADMIN).
--   - Vista `registro_dominio`: registros en el formato del dominio (jsonb).
--   - `guardar_registro`: escritura atómica (registro + tramos + cargos + bitácora)
--     con bloqueo optimista por largo de bitácora.
--   - Correlativos y ajuste de secuencias tras importación.
-- ════════════════════════════════════════════════════════════════════════════

-- ───────── Hoteles con ID estable (debe correr antes de cargar datos) ─────────
update hotel set id = 'a0000000-0000-4000-8000-000000000001' where nombre = 'Hotel Tabancura';
update hotel set id = 'a0000000-0000-4000-8000-000000000002' where nombre = 'Hotel Alto Atacama';
update hotel set id = 'a0000000-0000-4000-8000-000000000003' where nombre = 'Hotel Muray';

-- ───────── Perfil automático ─────────
create or replace function crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfil (id, nombre, rol)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'nombre'), ''), split_part(new.email, '@', 1)),
    case when exists (select 1 from perfil) then 'LECTOR'::rol_usuario else 'ADMIN'::rol_usuario end
  );
  return new;
end $$;
create trigger trg_crear_perfil after insert on auth.users for each row execute function crear_perfil();

-- Administración de usuarios: el ADMIN puede ver y cambiar rol/activo de todos.
create policy admin_gestiona on perfil for update using (rol_actual() = 'ADMIN') with check (rol_actual() = 'ADMIN');

-- ───────── Registro en formato de dominio ─────────
create or replace function registro_doc(p_id uuid) returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'id', r.id,
    'folio', r.folio,
    'huesped', jsonb_build_object('rut', r.huesped_rut, 'nombre', h.nombre),
    'empresaId', r.empresa_id,
    'solicitanteId', r.solicitante_id,
    'fechaSolicitud', r.fecha_solicitud,
    'estado', r.estado,
    'noShow', case when r.ns_modalidad is null then null
                   else jsonb_build_object('modalidad', r.ns_modalidad, 'nochesCobradas', coalesce(r.ns_noches, 0)) end,
    'observaciones', r.observaciones,
    'creadoEn', r.creado_en,
    'actualizadoEn', r.actualizado_en,
    'tramos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'hotelId', t.hotel_id, 'desde', t.desde, 'hasta', t.hasta,
        'tarifaNoche', t.tarifa_noche, 'habitacionId', t.habitacion_id, 'motivo', t.motivo) order by t.orden)
      from tramo t where t.registro_id = r.id), '[]'::jsonb),
    'adicionales', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'fecha', c.fecha, 'hotelId', c.hotel_id, 'concepto', c.concepto,
        'descripcion', c.descripcion, 'cantidad', c.cantidad, 'precioUnitario', c.precio_unitario) order by c.fecha, c.id)
      from cargo_adicional c where c.registro_id = r.id), '[]'::jsonb),
    'historial', coalesce((
      select jsonb_agg(jsonb_build_object('en', e.en, 'usuario', e.usuario_nombre, 'accion', e.accion, 'detalle', e.detalle) order by e.id)
      from registro_evento e where e.registro_id = r.id), '[]'::jsonb)
  )
  from registro r join huesped h on h.rut = r.huesped_rut
  where r.id = p_id
$$;

create view registro_dominio with (security_invoker = true) as
  select r.id, registro_doc(r.id) as doc from registro r;

-- ───────── Escritura atómica de un registro ─────────
-- p_doc: Registro del dominio con la bitácora completa; la última entrada es el evento nuevo.
-- Bloqueo optimista: la bitácora del cliente debe tener exactamente 1 evento más que la guardada.
-- p_importar: carga inicial desde respaldo local (inserta todos los eventos faltantes con su fecha).
create or replace function guardar_registro(p_doc jsonb, p_importar boolean default false) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_id      uuid := (p_doc->>'id')::uuid;
  v_exist   int;
  v_doc_n   int := jsonb_array_length(coalesce(p_doc->'historial', '[]'::jsonb));
  v_nombre  text;
begin
  if rol_actual() is null or rol_actual() not in ('ADMIN', 'OPERADOR') then
    raise exception 'PERMISO: su rol no permite modificar registros' using errcode = '42501';
  end if;
  if p_importar and rol_actual() <> 'ADMIN' then
    raise exception 'PERMISO: sólo ADMIN puede importar' using errcode = '42501';
  end if;

  perform 1 from registro where id = v_id for update;
  select count(*) into v_exist from registro_evento where registro_id = v_id;
  if not p_importar and v_doc_n <> v_exist + 1 then
    raise exception 'CONFLICTO: el folio % fue modificado por otra operación; vuelva a abrirlo', p_doc->>'folio'
      using errcode = '40001';
  end if;

  select nombre into v_nombre from perfil where id = auth.uid();

  insert into huesped (rut, nombre) values (p_doc->'huesped'->>'rut', p_doc->'huesped'->>'nombre')
  on conflict (rut) do update set nombre = excluded.nombre;

  insert into registro (id, folio, huesped_rut, empresa_id, solicitante_id, fecha_solicitud, estado,
                        ns_modalidad, ns_noches, observaciones, creado_en)
  values (
    v_id, (p_doc->>'folio')::int, p_doc->'huesped'->>'rut', (p_doc->>'empresaId')::uuid, (p_doc->>'solicitanteId')::uuid,
    (p_doc->>'fechaSolicitud')::date, (p_doc->>'estado')::estado_registro,
    (p_doc->'noShow'->>'modalidad')::modalidad_ns,
    case when p_doc->'noShow'->>'modalidad' = 'PARCIAL' then (p_doc->'noShow'->>'nochesCobradas')::int end,
    coalesce(p_doc->>'observaciones', ''),
    coalesce((nullif(p_doc->>'creadoEn', ''))::timestamptz, now())
  )
  on conflict (id) do update set
    huesped_rut = excluded.huesped_rut, empresa_id = excluded.empresa_id, solicitante_id = excluded.solicitante_id,
    fecha_solicitud = excluded.fecha_solicitud, estado = excluded.estado, ns_modalidad = excluded.ns_modalidad,
    ns_noches = excluded.ns_noches, observaciones = excluded.observaciones, actualizado_en = now();

  -- Tramos y cargos se reemplazan completos (las restricciones diferidas validan el resultado final).
  delete from cargo_adicional where registro_id = v_id;
  delete from tramo where registro_id = v_id;

  insert into tramo (id, registro_id, orden, hotel_id, desde, hasta, tarifa_noche, habitacion_id, motivo)
  select (t->>'id')::uuid, v_id, o::smallint, (t->>'hotelId')::uuid, (t->>'desde')::date, (t->>'hasta')::date,
         (t->>'tarifaNoche')::bigint, nullif(t->>'habitacionId', '')::uuid, coalesce(t->>'motivo', '')
  from jsonb_array_elements(p_doc->'tramos') with ordinality as x(t, o);

  insert into cargo_adicional (id, registro_id, fecha, hotel_id, concepto, descripcion, cantidad, precio_unitario)
  select (a->>'id')::uuid, v_id, (a->>'fecha')::date, (a->>'hotelId')::uuid, (a->>'concepto')::concepto,
         coalesce(a->>'descripcion', ''), (a->>'cantidad')::int, (a->>'precioUnitario')::bigint
  from jsonb_array_elements(coalesce(p_doc->'adicionales', '[]'::jsonb)) as a;

  insert into registro_evento (registro_id, accion, detalle, usuario_nombre, en)
  select v_id, (e->>'accion')::accion_registro, coalesce(e->>'detalle', ''),
         case when p_importar then coalesce(e->>'usuario', '(importado)') else coalesce(v_nombre, e->>'usuario', '?') end,
         case when p_importar then coalesce((nullif(e->>'en', ''))::timestamptz, now()) else now() end
  from jsonb_array_elements(coalesce(p_doc->'historial', '[]'::jsonb)) with ordinality as x(e, o)
  where o > v_exist;

  return registro_doc(v_id);
end $$;

-- ───────── Correlativos ─────────
create or replace function siguiente_correlativo(p_nombre text) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if rol_actual() is null or rol_actual() not in ('ADMIN', 'OPERADOR') then
    raise exception 'PERMISO: su rol no permite generar correlativos' using errcode = '42501';
  end if;
  return case p_nombre
    when 'folioRegistro' then nextval('folio_registro_seq')
    when 'correlativoEDP' then nextval('correlativo_edp_seq')
    else null end;
end $$;

-- Tras importar un respaldo: las secuencias continúan desde el máximo existente.
create or replace function ajustar_secuencias() returns void
language plpgsql security definer set search_path = public as $$
begin
  if rol_actual() is distinct from 'ADMIN' then raise exception 'PERMISO: sólo ADMIN' using errcode = '42501'; end if;
  perform setval('folio_registro_seq', greatest((select coalesce(max(folio), 0) from registro), 1), (select count(*) > 0 from registro));
  perform setval('correlativo_edp_seq', greatest((select coalesce(max(correlativo), 0) from estado_pago), 1), (select count(*) > 0 from estado_pago));
end $$;

-- ───────── Permisos para el rol autenticado de Supabase (RLS sigue aplicando) ─────────
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function registro_doc(uuid), guardar_registro(jsonb, boolean), siguiente_correlativo(text), ajustar_secuencias(), rol_actual() to authenticated;
revoke all on function guardar_registro(jsonb, boolean), siguiente_correlativo(text), ajustar_secuencias() from anon, public;
