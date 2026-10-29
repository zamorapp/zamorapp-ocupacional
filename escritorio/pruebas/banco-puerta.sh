#!/bin/sh
# Banco local de la puerta, igual que el job de Linux del CI: dos rondas, una con el simulador de PostgREST y otra
# con el PostgREST real (v12.2.3, el mismo del CI). El 29-oct-2026 el #119 pasó con el simulador y falló en el CI
# con el real: sin la segunda ronda, el banco no ve esas diferencias.
#
# Uso (como usuario no root; PostgreSQL no corre como root):
#   NUBE_DB=postgresql://postgres:postgres@127.0.0.1:5432/zamorapp_prueba PG_BIN=/usr/lib/postgresql/16/bin \
#   POSTGREST_REAL=/ruta/a/postgrest sh escritorio/pruebas/banco-puerta.sh
# Antes de cada ronda corre supabase/pruebas/correr.sh (deja la base de la nube limpia); si PGHOST/PGPORT apuntan a
# otro servidor, se respetan. El binario real se baja de
#   https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz
# Sin POSTGREST_REAL la segunda ronda se omite y se avisa (el banco NO queda igual al CI).
set -e
aqui=$(cd "$(dirname "$0")" && pwd)
raiz=$(cd "$aqui/../.." && pwd)
: "${NUBE_DB:?Falta NUBE_DB}" "${PG_BIN:?Falta PG_BIN}"

ronda() {
  echo "── Puerta con $1"
  # sin «| tail»: ocultaría el código de salida de correr.sh
  salida=$(cd "$raiz" && bash supabase/pruebas/correr.sh 2>&1) || { echo "$salida"; exit 1; }
  echo "$salida" | tail -1
  (cd "$raiz/escritorio" && node --test --test-concurrency=1 pruebas/puerta.test.mjs)
}

unset ZAMORAPP_POSTGREST
ronda "el simulador de PostgREST"
if [ -n "$POSTGREST_REAL" ] && [ -x "$POSTGREST_REAL" ]; then
  ZAMORAPP_POSTGREST="$POSTGREST_REAL" && export ZAMORAPP_POSTGREST
  ronda "PostgREST real ($("$POSTGREST_REAL" --version 2>/dev/null | head -1))"
else
  echo "AVISO: sin POSTGREST_REAL no se probó con el PostgREST real; el CI sí lo usa." >&2
  exit 2
fi
