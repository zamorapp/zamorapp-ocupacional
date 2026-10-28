-- Entrar con usuario corto: solo el administrador lo asigna; el correo sale solo con la clave correcta;
-- freno de intentos; nadie lee las tablas. Deja los datos como los encontró.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
-- Columnas de auth.users que Supabase sí tiene y la simulación no
alter table auth.users add column if not exists encrypted_password text, add column if not exists deleted_at timestamptz, add column if not exists banned_until timestamptz;
update auth.users set encrypted_password = crypt('clave-buena', gen_salt('bf', 4)) where id in ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2');

-- Un médico no asigna usuarios
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin
  perform public.asignar_usuario_ingreso('00000000-0000-0000-0000-0000000000a2', 'medico');
  raise notice 'FALLA: un médico asignó un usuario';
exception when insufficient_privilege then raise notice 'médico no asigna usuarios (debe 1): 1';
end $$;

-- El administrador se asigna el suyo y el del médico
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'admin asigna «Cesar» y queda en minúsculas (debe 1): ' || (public.asignar_usuario_ingreso('00000000-0000-0000-0000-0000000000a1', ' Cesar ') = 'cesar')::int;
select 'admin asigna el del médico (debe 1): ' || (public.asignar_usuario_ingreso('00000000-0000-0000-0000-0000000000a2', 'richard') = 'richard')::int;
do $$ begin
  perform public.asignar_usuario_ingreso('00000000-0000-0000-0000-0000000000a2', 'cesar');
  raise notice 'FALLA: se repitió un usuario';
exception when unique_violation then raise notice 'no se repite un usuario (debe 1): 1';
end $$;
do $$ begin
  perform public.asignar_usuario_ingreso('00000000-0000-0000-0000-0000000000a2', 'a@b.com');
  raise notice 'FALLA: se aceptó un usuario con @';
exception when invalid_parameter_value then raise notice 'el usuario no lleva @ ni espacios (debe 1): 1';
end $$;
do $$ begin
  perform public.asignar_usuario_ingreso('00000000-0000-0000-0000-00000000ffff', 'extrano');
  raise notice 'FALLA: se asignó a alguien de fuera';
exception when insufficient_privilege then raise notice 'no asigna a alguien de otra organización (debe 1): 1';
end $$;
select 'queda en la bitácora (debe 2): ' || count(*) from public.bitacora where tabla = 'usuarios_ingreso';
select 'el admin ve los usuarios en la lista (debe 2): ' || count(usuario) from public.miembros_con_correo();
select 'mi_usuario_ingreso (debe 1): ' || (public.mi_usuario_ingreso() = 'cesar')::int;

-- RR. HH. no ve usuarios cortos de nadie
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no ve usuarios cortos (debe 0): ' || count(usuario) from public.miembros_con_correo();
do $$ begin
  perform count(*) from public.usuarios_ingreso;
  raise notice 'FALLA: se leyó la tabla de usuarios';
exception when insufficient_privilege then raise notice 'nadie lee la tabla directamente (debe 1): 1';
end $$;

-- Sin cuenta: el correo sale solo con usuario y clave correctos
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'usuario y clave correctos dan el correo (debe 1): ' || (public.correo_para_ingreso('CESAR', 'clave-buena') = 'admin@x')::int;
select 'clave equivocada no da nada (debe 1): ' || (public.correo_para_ingreso('cesar', 'otra') is null)::int;
select 'usuario inexistente no da nada (debe 1): ' || (public.correo_para_ingreso('nadie', 'clave-buena') is null)::int;
do $$ begin
  perform count(*) from public.ingreso_usuario_intentos;
  raise notice 'FALLA: sin cuenta se leyó el freno';
exception when insufficient_privilege then raise notice 'sin cuenta no lee el freno (debe 1): 1';
end $$;
do $$ begin
  perform public.asignar_usuario_ingreso('00000000-0000-0000-0000-0000000000a1', 'yo');
  raise notice 'FALLA: sin cuenta se asignó un usuario';
exception when insufficient_privilege then raise notice 'sin cuenta no asigna (debe 1): 1';
end $$;
-- Freno: 5 fallos seguidos bloquean ese usuario (aunque luego la clave sea buena), existan o no
select public.correo_para_ingreso('richard', 'mala') from generate_series(1, 5) \g /dev/null
select public.correo_para_ingreso('fantasma', 'mala') from generate_series(1, 5) \g /dev/null
do $$ begin
  perform public.correo_para_ingreso('richard', 'clave-buena');
  raise notice 'FALLA: no frenó tras 5 fallos';
exception when sqlstate 'P0429' then raise notice 'frena tras 5 fallos (debe 1): 1';
end $$;
do $$ begin
  perform public.correo_para_ingreso('fantasma', 'x');
  raise notice 'FALLA: un usuario inexistente se delata porque no frena';
exception when sqlstate 'P0429' then raise notice 'un usuario inexistente frena igual (debe 1): 1';
end $$;
select 'otro usuario sigue entrando (debe 1): ' || (public.correo_para_ingreso('cesar', 'clave-buena') = 'admin@x')::int;

-- El admin quita el usuario: ya no sirve
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'quitar devuelve vacío (debe 1): ' || (public.asignar_usuario_ingreso('00000000-0000-0000-0000-0000000000a2', '') is null)::int;
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'un usuario quitado ya no da correo (debe 1): ' || (public.correo_para_ingreso('richard', 'clave-buena') is null)::int;

-- «*» (la fila del freno global) no es un usuario: no cuenta ni toca el freno
reset role;
create temp table freno_antes as select fallos from public.ingreso_usuario_intentos where usuario = '*';
set role anon;
select '«*» no es un usuario (debe 1): ' || (public.correo_para_ingreso('*', 'x') is null)::int;
reset role;
select '«*» no suma al freno global (debe 1): ' || ((select fallos from public.ingreso_usuario_intentos where usuario = '*') = (select fallos from freno_antes))::int;
-- Freno global: tras 100 intentos en 10 min nadie entra por usuario (ni con la clave buena) hasta que pase la espera
update public.ingreso_usuario_intentos set fallos = 99, actualizado = now(), hasta = null where usuario = '*';
set role anon;
select 'el intento 100 todavía se atiende (debe 1): ' || (public.correo_para_ingreso('cesar', 'clave-buena') = 'admin@x')::int;
do $$ begin
  perform public.correo_para_ingreso('cesar', 'clave-buena');
  raise notice 'FALLA: el freno global no frenó';
exception when sqlstate 'P0429' then raise notice 'tras 100 intentos frena a todos (debe 1): 1';
end $$;

-- Limpieza
reset role;
delete from public.usuarios_ingreso;
delete from public.ingreso_usuario_intentos;
delete from public.bitacora where tabla = 'usuarios_ingreso';
update auth.users set encrypted_password = null;
