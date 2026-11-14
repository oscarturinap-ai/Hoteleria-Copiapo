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
