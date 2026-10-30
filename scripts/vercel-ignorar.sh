#!/usr/bin/env bash
# ignoreCommand de Vercel (vercel.json lo limita a 256 caracteres, por eso vive aquí).
# Sale 0 = NO desplegar: solo cuando hay despliegue anterior y el cambio no toca la web.
# Cualquier otra cosa (sin VERCEL_GIT_PREVIOUS_SHA, commit no disponible, cambios en la web) = desplegar.
[ -n "$VERCEL_GIT_PREVIOUS_SHA" ] || exit 1
git cat-file -e "$VERCEL_GIT_PREVIOUS_SHA" 2>/dev/null || exit 1
git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- . \
  ':(exclude)escritorio' ':(exclude)supabase' ':(exclude)scripts' ':(exclude)docs' \
  ':(exclude).github' ':(exclude)*.md' ':(exclude)auditoria'
