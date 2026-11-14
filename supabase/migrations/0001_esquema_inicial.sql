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
