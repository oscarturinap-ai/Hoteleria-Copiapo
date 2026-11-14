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
