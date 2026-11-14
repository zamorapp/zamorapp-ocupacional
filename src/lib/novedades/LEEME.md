# Novedades del manual («Lo nuevo»)

Un archivo por novedad. Así dos PR que se publican el mismo día nunca chocan.

- Nombre: `AAAA-MM-DD-palabras-clave.json` (minúsculas, sin acentos). La fecha del nombre es la de la novedad.
- Contenido: `{ "fecha": "AAAA-MM-DD", "tema": "<id de un tema del manual>", "texto": "…" }`.
- Se muestran de la más nueva a la más vieja; el mismo día, por el nombre del archivo.
- La fecha «Actualizado el …» del manual sale sola de la novedad más reciente: no hace falta tocar `manual.ts`.
- La prueba `scripts/pruebas/manual-evaluaciones.test.mjs` revisa que cada tema exista.
