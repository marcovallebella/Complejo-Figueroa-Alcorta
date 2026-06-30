-- =============================================================
-- Complejo Figueroa Alcorta - Setup de base de datos en Supabase
-- =============================================================
-- Ejecutar este script completo en: Supabase Dashboard > SQL Editor
-- =============================================================

-- 1) TABLAS -----------------------------------------------------

create table if not exists public.departamentos (
  id int primary key,
  nombre text not null,             -- etiqueta del depto ("Depto 1")
  email text,                       -- email de contacto del depto (opcional / legado)
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- Residentes de cada departamento. Un departamento puede tener uno o más.
-- El email se usa para generar los recibos de pago.
create table if not exists public.residentes (
  id bigint generated always as identity primary key,
  depto_id int not null references public.departamentos(id) on delete cascade,
  nombre text not null default '',
  email text,
  created_at timestamptz default now()
);

create index if not exists idx_residentes_depto on public.residentes(depto_id);

-- Egresos: gastos del complejo registrados por el administrador
-- (servicios como luz/agua/limpieza/ascensores y eventuales como
-- electricista/cerrajero). Visibles para todos, editables solo por el admin.
create table if not exists public.egresos (
  id bigint generated always as identity primary key,
  fecha date not null default current_date,
  categoria text not null,
  descripcion text,
  monto numeric(12, 2) not null,
  registrado_por text not null default 'admin',
  created_at timestamptz default now()
);

create index if not exists idx_egresos_fecha on public.egresos(fecha);

-- Propietarios de cada departamento (mismo formato que residentes: nombre +
-- email). user_id asocia el login del propietario (cuenta tipo "Propietario").
create table if not exists public.propietarios (
  id bigint generated always as identity primary key,
  depto_id int not null references public.departamentos(id) on delete cascade,
  nombre text not null default '',
  email text,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_propietarios_depto on public.propietarios(depto_id);

-- Expensas extraordinarias: el admin define una razón y un monto objetivo
-- (total a recaudar). La cuota por unidad es monto / 18. Caja aparte del
-- fondo común de expensas.
create table if not exists public.extraordinarias (
  id bigint generated always as identity primary key,
  razon text not null,
  monto numeric(12, 2) not null,        -- objetivo total a recaudar
  afecta_deptos int[],                  -- unidades afectadas; null = todas
  fecha date not null default current_date,
  created_at timestamptz default now()
);

-- Pagos de cada propietario a una expensa extraordinaria
create table if not exists public.pagos_extraordinarios (
  id bigint generated always as identity primary key,
  extraordinaria_id bigint not null references public.extraordinarias(id) on delete cascade,
  depto_id int not null references public.departamentos(id) on delete cascade,
  monto numeric(12, 2) not null,
  fecha_pago timestamptz not null default now(),
  metodo_pago text not null default 'transferencia',
  estado text not null default 'pagado',
  comprobante_url text,
  created_at timestamptz default now(),
  unique (extraordinaria_id, depto_id)
);

create index if not exists idx_pagos_extra_ext on public.pagos_extraordinarios(extraordinaria_id);

create table if not exists public.meses (
  id bigint generated always as identity primary key,
  anio int not null,
  mes int not null check (mes between 1 and 12),
  monto_expensa numeric(12, 2) not null,
  created_at timestamptz default now(),
  unique (anio, mes)
);

create table if not exists public.pagos (
  id bigint generated always as identity primary key,
  depto_id int not null references public.departamentos(id) on delete cascade,
  mes_id bigint not null references public.meses(id) on delete cascade,
  fecha_pago timestamptz not null default now(),
  metodo_pago text not null check (metodo_pago in ('efectivo', 'transferencia', 'mercadopago', 'otro')),
  monto numeric(12, 2) not null,
  registrado_por text not null default 'admin' check (registrado_por in ('admin', 'inquilino', 'sistema')),
  estado text not null default 'pagado' check (estado in ('pagado', 'pendiente', 'vencido')),
  comprobante_url text,
  notas text,
  created_at timestamptz default now()
);

create index if not exists idx_pagos_depto on public.pagos(depto_id);
create index if not exists idx_pagos_mes on public.pagos(mes_id);

-- Reclamos y proyectos: cualquier residente/propietario puede reportar un
-- reclamo (con hasta 2 imágenes); el admin lo atiende y va actualizando el
-- grado de avance. depto_id queda null cuando lo crea el administrador
-- (ej. un "proyecto" del complejo, no asociado a una unidad puntual).
create table if not exists public.reclamos (
  id bigint generated always as identity primary key,
  depto_id int references public.departamentos(id) on delete set null,
  descripcion text not null,
  imagen1_url text,
  imagen2_url text,
  estado text not null default 'visto'
    check (estado in ('visto', 'en_proceso', 'solucionado')),
  creado_por text not null default 'residente'
    check (creado_por in ('residente', 'propietario', 'admin')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_reclamos_depto on public.reclamos(depto_id);

-- 2) REALTIME -----------------------------------------------------
-- Habilita actualizaciones en vivo. El bloque DO evita el error
-- "relation ... is already member of publication" si el script se corre
-- más de una vez (ej. al re-ejecutar todo el setup).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pagos'
  ) then
    alter publication supabase_realtime add table public.pagos;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'egresos'
  ) then
    alter publication supabase_realtime add table public.egresos;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pagos_extraordinarios'
  ) then
    alter publication supabase_realtime add table public.pagos_extraordinarios;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reclamos'
  ) then
    alter publication supabase_realtime add table public.reclamos;
  end if;
end $$;

-- 3) STORAGE (comprobantes de transferencia + imágenes de reclamos) ----

insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('reclamos', 'reclamos', true)
on conflict (id) do nothing;

-- Políticas de storage.objects: lectura pública (son buckets "public") e
-- inserción para cualquier usuario autenticado. Sin estas políticas, las
-- subidas fallan por RLS aunque el bucket esté marcado como público
-- (el flag "public" solo habilita la LECTURA, no el insert).
create policy "lectura_publica_comprobantes" on storage.objects
  for select using (bucket_id = 'comprobantes');

create policy "subir_comprobantes" on storage.objects
  for insert to authenticated with check (bucket_id = 'comprobantes');

create policy "lectura_publica_reclamos_storage" on storage.objects
  for select using (bucket_id = 'reclamos');

create policy "subir_reclamos_storage" on storage.objects
  for insert to authenticated with check (bucket_id = 'reclamos');

-- 4) ROW LEVEL SECURITY ---------------------------------------------

alter table public.departamentos enable row level security;
alter table public.meses enable row level security;
alter table public.pagos enable row level security;
alter table public.residentes enable row level security;
alter table public.egresos enable row level security;
alter table public.propietarios enable row level security;
alter table public.extraordinarias enable row level security;
alter table public.pagos_extraordinarios enable row level security;

-- Función auxiliar: ¿el usuario actual es el admin? (no tiene depto asociado).
-- Es SECURITY DEFINER para poder consultar `departamentos` desde una política
-- de la propia tabla `departamentos` sin disparar recursión de RLS.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (select 1 from public.departamentos where user_id = auth.uid())
     and not exists (select 1 from public.propietarios where user_id = auth.uid());
$$;

-- Cualquier usuario autenticado puede LEER departamentos, meses y pagos
-- (la tabla general y el resumen son visibles para todos los roles).
create policy "lectura_departamentos" on public.departamentos
  for select to authenticated using (true);

-- Solo el admin puede editar los datos de los departamentos.
create policy "admin_actualiza_departamentos" on public.departamentos
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Residentes: todos los autenticados pueden leer; solo el admin puede
-- crear, editar o borrar (desde el módulo "Residentes" del panel).
create policy "lectura_residentes" on public.residentes
  for select to authenticated using (true);

create policy "admin_gestiona_residentes" on public.residentes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Egresos: todos los autenticados pueden leer (los residentes ven los gastos);
-- solo el admin puede crear, editar o borrar.
create policy "lectura_egresos" on public.egresos
  for select to authenticated using (true);

create policy "admin_gestiona_egresos" on public.egresos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Propietarios: lectura para todos los autenticados, gestión solo admin.
create policy "lectura_propietarios" on public.propietarios
  for select to authenticated using (true);

create policy "admin_gestiona_propietarios" on public.propietarios
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Extraordinarias y sus pagos: lectura para todos, gestión solo admin.
create policy "lectura_extraordinarias" on public.extraordinarias
  for select to authenticated using (true);

create policy "admin_gestiona_extraordinarias" on public.extraordinarias
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "lectura_pagos_extra" on public.pagos_extraordinarios
  for select to authenticated using (true);

create policy "admin_gestiona_pagos_extra" on public.pagos_extraordinarios
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Reclamos y proyectos: todos los autenticados ven todos los reclamos
-- (tablón compartido del complejo). Cualquier usuario logueado puede crear
-- un reclamo. Solo el admin puede cambiar el estado y eliminar.
alter table public.reclamos enable row level security;

create policy "lectura_reclamos" on public.reclamos
  for select to authenticated using (true);

create policy "insertar_reclamos" on public.reclamos
  for insert to authenticated with check (true);

create policy "admin_actualiza_reclamos" on public.reclamos
  for update to authenticated using (public.is_admin());

create policy "admin_borra_reclamos" on public.reclamos
  for delete to authenticated using (public.is_admin());

create policy "lectura_meses" on public.meses
  for select to authenticated using (true);

create policy "lectura_pagos" on public.pagos
  for select to authenticated using (true);

-- Solo el admin (usuario sin departamento asociado) puede modificar meses.
create policy "admin_modifica_meses" on public.meses
  for all to authenticated using (
    not exists (select 1 from public.departamentos d where d.user_id = auth.uid())
  ) with check (
    not exists (select 1 from public.departamentos d where d.user_id = auth.uid())
  );

-- El admin puede insertar pagos para cualquier depto; el inquilino solo
-- puede insertar pagos de SU PROPIO departamento (ej. "informar transferencia").
create policy "insertar_pagos" on public.pagos
  for insert to authenticated with check (
    not exists (select 1 from public.departamentos d where d.user_id = auth.uid())
    or depto_id = (select id from public.departamentos where user_id = auth.uid())
  );

-- Solo el admin puede actualizar o borrar pagos (ej. confirmar transferencias).
create policy "admin_actualiza_pagos" on public.pagos
  for update to authenticated using (
    not exists (select 1 from public.departamentos d where d.user_id = auth.uid())
  );

create policy "admin_borra_pagos" on public.pagos
  for delete to authenticated using (
    not exists (select 1 from public.departamentos d where d.user_id = auth.uid())
  );

-- 5) SEED: 18 departamentos (con email de ejemplo) --------------------

insert into public.departamentos (id, nombre, email)
select g, 'Depto ' || g, 'depto' || g || '@figueroaalcorta.com'
from generate_series(1, 18) as g
on conflict (id) do nothing;

-- Un residente inicial por departamento (el admin puede agregar más desde
-- el módulo "Residentes", con el botón "+ Agregar residente").
insert into public.residentes (depto_id, nombre, email)
select g, 'Residente Depto ' || g, 'depto' || g || '@figueroaalcorta.com'
from generate_series(1, 18) as g
where not exists (select 1 from public.residentes r where r.depto_id = g);

-- Un propietario inicial por departamento (el admin puede editar/agregar)
insert into public.propietarios (depto_id, nombre, email)
select g, 'Propietario Depto ' || g, 'prop' || g || '@figueroaalcorta.com'
from generate_series(1, 18) as g
where not exists (select 1 from public.propietarios p where p.depto_id = g);

-- Expensa extraordinaria de ejemplo (objetivo total; cuota por unidad = monto/18)
insert into public.extraordinarias (razon, monto)
select 'Reparación y pintura de fachada', 5400000
where not exists (select 1 from public.extraordinarias);

-- Egresos de ejemplo del mes actual
insert into public.egresos (fecha, categoria, descripcion, monto)
select * from (values
  (date_trunc('month', now())::date + 2,  'Luz',        'Factura Edenor',                 38500),
  (date_trunc('month', now())::date + 4,  'Agua',       'AySA',                           21300),
  (date_trunc('month', now())::date + 7,  'Limpieza',   'Servicio mensual de limpieza',   65000),
  (date_trunc('month', now())::date + 11, 'Ascensores', 'Mantenimiento mensual',          47000),
  (date_trunc('month', now())::date + 17, 'Cerrajero',  'Cambio de cerradura puerta PB',  18000)
) as e(fecha, categoria, descripcion, monto)
where not exists (select 1 from public.egresos);

-- 6) SEED: mes actual con monto de ejemplo ($50.000) -------------------

insert into public.meses (anio, mes, monto_expensa)
values (
  extract(year from now())::int,
  extract(month from now())::int,
  50000
)
on conflict (anio, mes) do nothing;

-- =============================================================
-- 7) CREACIÓN DE USUARIOS (hacer manualmente desde el Dashboard)
-- =============================================================
-- Supabase no permite crear usuarios de Auth por SQL directamente.
-- Hay 3 tipos de cuenta: administrador, residente y propietario.
-- Pasos:
--
-- a) Ir a Authentication > Users > Add user, y crear una cuenta por cada
--    persona que vaya a tener login:
--      - 1 usuario admin, ej: admin@figueroaalcorta.com
--      - usuarios residentes, ej: depto1@figueroaalcorta.com ... depto18@figueroaalcorta.com
--      - usuarios propietarios, ej: prop1@figueroaalcorta.com ... prop18@figueroaalcorta.com
--    Definir una contraseña para cada uno (o usar "Auto-generate" y luego
--    compartirla con cada persona).
--
-- b) RESIDENTE: copiar el UUID del usuario (columna "UID" en la tabla de
--    usuarios) y asociarlo a su departamento. Ejecutar por cada uno:
--
--    update public.departamentos
--      set user_id = '<UUID_DEL_USUARIO>', email = 'depto1@figueroaalcorta.com'
--      where id = 1;
--    -- ... y así hasta el id = 18
--
-- c) PROPIETARIO: el registro en `propietarios` ya se creó en el seed
--    (un propietario por depto, ver paso 6). Para darle login, asociale el
--    UUID de su usuario de Auth al registro existente:
--
--    update public.propietarios
--      set user_id = '<UUID_DEL_USUARIO>'
--      where depto_id = 1;
--    -- ... y así para cada propietario que necesite acceso
--
--    (Si un depto tiene varios propietarios pero solo uno va a tener login,
--    asociá el user_id solo a esa fila; las demás quedan sin user_id.)
--
-- d) El usuario admin NO debe asociarse a ningún departamento ni a ningún
--    propietario: el sistema lo detecta como administrador automáticamente
--    cuando un usuario autenticado no tiene ningún registro propio en
--    `departamentos` ni en `propietarios`.
-- =============================================================
