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
