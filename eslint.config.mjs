import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Guardián de diseño (D2): una grilla que solo define columnas desde sm/md/lg queda con una columna «auto» en el
// celular, que crece con el contenido y desborda la pantalla. La base tiene que ser grid-cols-1 (minmax(0,1fr)) u otra.
const RESPONSIVA = /(?:^|\s)(?:sm|md|lg|xl|2xl):grid-cols-/;
const BASE = /(?:^|\s)grid-cols-/;
const ES_GRILLA = /(?:^|\s)grid(?:\s|$)/;
const diseno = {
  rules: {
    "grilla-con-base": {
      meta: { type: "problem", messages: { falta: "Grilla sin columnas base: agrega grid-cols-1 (sin eso, en el celular la columna crece con el contenido y desborda)." } },
      create(context) {
        const revisar = (node, texto) => {
          if (ES_GRILLA.test(texto) && RESPONSIVA.test(texto) && !BASE.test(texto)) context.report({ node, messageId: "falta" });
        };
        return {
          Literal: (node) => typeof node.value === "string" && revisar(node, node.value),
          TemplateElement: (node) => revisar(node, node.value.cooked ?? ""),
        };
      },
    },
  },
};

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Fechas de negocio en hora de Caracas: el servidor corre en UTC y estas formas dan «mañana»
  // de 20:00 a 24:00. Usar hoyCaracas / anioCaracas / sumarDias de src/lib/fecha.ts.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/fecha.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='slice'][callee.object.callee.property.name='toISOString']",
          message: "toISOString().slice() da la fecha en UTC: usa hoyCaracas() o sumarDias() de @/lib/fecha.",
        },
        {
          selector: "CallExpression[callee.property.name=/^get(FullYear|Month|Date|Day|Hours)$/][callee.object.type='NewExpression'][callee.object.arguments.length=0]",
          message: "new Date().getX() depende de la zona del servidor: usa anioCaracas() / mesCaracas() / hoyCaracas() de @/lib/fecha.",
        },
        // trabajadores tiene columnas de salud sin SELECT (#41): pedir la fila al guardar o con «*» da 42501
        {
          selector: "CallExpression[callee.property.name='select'][callee.object.callee.property.name=/^(insert|update|upsert)$/][callee.object.callee.object.callee.property.name='from'][callee.object.callee.object.arguments.0.value='trabajadores']",
          message: "No pidas la fila de trabajadores al guardar (da 42501 por las columnas de salud ocultas): crea el id con crypto.randomUUID() e inserta sin .select().",
        },
        {
          selector: "CallExpression[callee.property.name='select'][arguments.0.value='*'][callee.object.callee.property.name='from'][callee.object.arguments.0.value='trabajadores']",
          message: "select('*') en trabajadores da 42501 (columnas de salud ocultas): nombra las columnas.",
        },
        // Guardián de diseño (D2): en el escritorio una ventana en blanco no abre nada (documentos.rs la rechaza)
        {
          selector: "CallExpression[callee.object.name='window'][callee.property.name='open'][arguments.0.value=/^(about:blank)?$/]",
          message: "window.open en blanco no abre nada en el escritorio: usa abrirEnVentana() de @/lib/escritorio o abre ya con la dirección final.",
        },
      ],
    },
  },
  {
    files: ["src/**/*.tsx"],
    plugins: { diseno },
    rules: { "diseno/grilla-con-base": "error" },
  },
  // Nada de diálogos nativos: se ven del sistema, bloquean la página y en el escritorio (Tauri) no siempre salen.
  // Usar confirmar() de @/components/app/confirmar, o un aviso en la pantalla.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...["confirm", "alert", "prompt"].map((name) => ({ name, message: "Usa confirmar() de @/components/app/confirmar o un aviso en la pantalla." })),
      ],
      "no-restricted-properties": [
        "error",
        ...["confirm", "alert", "prompt"].map((property) => ({ object: "window", property, message: "Usa confirmar() de @/components/app/confirmar o un aviso en la pantalla." })),
      ],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".next-build/**",
      ".next-prod/**",
      ".next-dev/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "supabase/functions/**", // Deno (funciones de Supabase), con sus propios tipos
    ],
  },
];

export default eslintConfig;
