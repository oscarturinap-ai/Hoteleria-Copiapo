-- Esquema inicial: hoteles, tarifas con vigencia, empresas y registros.
-- Montos en CLP enteros. Las tarifas son versionadas para que un estado de pago
-- antiguo se recalcule siempre con la tarifa vigente en su fecha.

create type concepto as enum ('ALOJAMIENTO', 'ALMUERZO', 'CENA');

create table hoteles (
  codigo     text primary key,
  nombre     text not null,
  es_madre   boolean not null default false,
  activo     boolean not null default true
);

insert into hoteles (codigo, nombre, es_madre) values
  ('TABANCURA', 'Hotel Tabancura', true),
  ('ALTO_ATACAMA', 'Alto Atacama', false),
  ('MURAY', 'Muray', false);

create table tarifas (
  id           bigint generated always as identity primary key,
  hotel        text not null references hoteles (codigo),
  concepto     concepto not null,
  monto        integer not null check (monto >= 0),
  vigente_desde date not null,
  vigente_hasta date,
  creado_en    timestamptz not null default now(),
  creado_por   uuid references auth.users (id),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

create index tarifas_vigencia_idx on tarifas (hotel, concepto, vigente_desde);

create table empresas (
  id      bigint generated always as identity primary key,
  nombre  text not null unique,
  rut     text unique
);

create table registros (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     bigint not null references empresas (id),
  solicitante    text not null,
  rut            text not null,
  nombre         text not null,
  hotel          text not null references hoteles (codigo),
  fecha_ingreso  date not null,
  fecha_salida   date not null,
  alojamiento    boolean not null default true,
  almuerzos      integer not null default 0 check (almuerzos >= 0),
  cenas          integer not null default 0 check (cenas >= 0),
  creado_en      timestamptz not null default now(),
  creado_por     uuid references auth.users (id),
  check (fecha_salida >= fecha_ingreso)
);

create index registros_empresa_fecha_idx on registros (empresa_id, fecha_ingreso);
create index registros_hotel_fecha_idx on registros (hotel, fecha_ingreso);

-- RLS: solo usuarios autenticados. Roles finos (admin/operador) en una migración posterior.
alter table hoteles   enable row level security;
alter table tarifas   enable row level security;
alter table empresas  enable row level security;
alter table registros enable row level security;

create policy "autenticados leen hoteles"   on hoteles   for select to authenticated using (true);
create policy "autenticados leen tarifas"   on tarifas   for select to authenticated using (true);
create policy "autenticados leen empresas"  on empresas  for all    to authenticated using (true) with check (true);
create policy "autenticados gestionan registros" on registros for all to authenticated using (true) with check (true);
