#!/usr/bin/env bash
# Prueba de reglas de acceso (RLS) en un PostgreSQL local, sin tocar Supabase.
# Uso: PGHOST=... PGPORT=... PGUSER=postgres bash supabase/pruebas/correr.sh
# Cada línea dice «(debe N)»: el número que sigue a los dos puntos tiene que coincidir.
set -e
cd "$(dirname "$0")/../.."
P="psql -v ON_ERROR_STOP=1 -q"
$P -c "drop database if exists zamorapp_prueba" -c "create database zamorapp_prueba"
$P -d zamorapp_prueba -f supabase/pruebas/00_stubs_supabase.sql
for f in supabase/migrations/*.sql; do $P -1 -d zamorapp_prueba -f "$f" > /dev/null; done
$P -d zamorapp_prueba -f supabase/pruebas/10_datos.sql
<<<<<<< HEAD
for f in supabase/pruebas/[2-9]*.sql; do psql -q -d zamorapp_prueba -f "$f" 2>&1; done | grep -v '^$' | tee /tmp/zamorapp_prueba.txt
=======
psql -q -d zamorapp_prueba -f supabase/pruebas/20_seguridad.sql 2>&1 | grep -v '^$' | tee /tmp/zamorapp_prueba.txt
>>>>>>> origin/main
# Falla si algún resultado no coincide con lo esperado
malos=$(awk '/debe [0-9]+/ { match($0, /debe [0-9]+/); esperado = substr($0, RSTART + 5, RLENGTH - 5); if ($NF != esperado) print "NO COINCIDE: " $0 } /FALLA/ { print }' /tmp/zamorapp_prueba.txt)
if [ -n "$malos" ]; then echo "$malos"; exit 1; fi
echo "Pruebas de seguridad: OK"
