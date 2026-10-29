"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ChevronDown, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// «¿Qué es esto?»: explica la pantalla, el semáforo, un ejemplo y cómo usarla en 5 pasos (texto del hilo Legal).
// Se abre sola la primera vez en cada equipo; después, con el botón.
const CLAVE = "zamorapp.cumplimiento.ayuda";

const LEYENDA = [
  { color: "bg-ok", texto: "Verde: cumple." },
  { color: "bg-aviso", texto: "Amarillo: cumple en parte (80 % o más)." },
  { color: "bg-alerta", texto: "Rojo: no cumple o falta el dato." },
  { color: "bg-muted-foreground/30", texto: "Gris: no aplica en el período (por ejemplo, no hubo accidentes)." },
];

const EJEMPLO = [
  { color: "bg-ok", texto: "Servicio de SST registrado (desde el 15/03/2024)" },
  { color: "bg-alerta", texto: "Programa de SST registrado: falta la fecha de registro", accion: "Ir a la empresa" },
  { color: "bg-aviso", texto: "Declaraciones en 24 h: 3 de 4 (una se declaró a las 30 h)" },
  { color: "bg-muted-foreground/30", texto: "Informes NT-02: no hubo enfermedades en el período" },
];

const PASOS = [
  ["Elige la empresa y el período.", "Por defecto, los últimos 12 meses."],
  ["Mira el porcentaje.", "Es el promedio de los puntos que aplican. Los grises no cuentan."],
  ["Recorre los rojos y amarillos.", "Cada uno dice qué falta, y su flecha te lleva a corregirlo."],
  ["Notifica a quien falte.", "La lista de trabajadores sin notificación de riesgos firmada tiene su botón «Notificar»."],
  ["Imprime el paquete.", "Llévalo a la inspección o guárdalo en el expediente de la empresa."],
];

export function QueEs() {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    // Solo la primera vez se abre sola: después queda cerrada y no mueve la pantalla al cargar
    try {
      if (!localStorage.getItem(CLAVE)) {
        localStorage.setItem(CLAVE, "visto");
        setAbierto(true);
      }
    } catch {
      // Sin almacenamiento: queda cerrada y se abre con el botón
    }
  }, []);
  const alternar = () => setAbierto((a) => !a);

  return (
    <section className="rounded-xl border bg-card">
      <button type="button" onClick={alternar} aria-expanded={abierto} aria-controls="que-es-cumplimiento"
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-primary hover:bg-muted/50">
        <HelpCircle className="size-4 shrink-0" />
        <span className="flex-1">¿Qué es esto?</span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", abierto && "rotate-180")} />
      </button>
      {abierto && (
        <div id="que-es-cumplimiento" className="grid grid-cols-1 gap-5 border-t px-4 py-4 text-sm lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-3">
            <p>
              Cuando el INPSASEL inspecciona una empresa, pide pruebas: el Servicio y el Programa de Seguridad y Salud registrados, las
              declaraciones de accidentes y enfermedades, las investigaciones, las notificaciones de riesgo firmadas y los exámenes médicos al día.
            </p>
            <p>
              Esta pantalla revisa esos 10 puntos con lo que ya registraste en zamorApp y te da un <strong>porcentaje de cumplimiento</strong> por empresa:
            </p>
            <ul className="space-y-1">
              {LEYENDA.map((l) => (
                <li key={l.texto} className="flex items-start gap-2"><span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", l.color)} />{l.texto}</li>
              ))}
            </ul>
            <p className="text-muted-foreground">
              Cada punto dice en qué norma se apoya y lleva un enlace para corregir lo que falta. <strong className="text-foreground">«Imprimir paquete»</strong> junta
              en un PDF la portada, el índice, las declaraciones, las investigaciones y las notificaciones firmadas.
            </p>
            <p className="font-medium">No reemplaza la inspección: te muestra antes que el inspector qué te falta.</p>
          </div>

          <div className="min-w-0 space-y-4">
            <figure className="rounded-lg border border-dashed bg-muted/30 p-3">
              <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-muted-foreground">
                <span className="font-semibold uppercase tracking-wide">Ejemplo</span>
                <span>Metalúrgica Aragua · últimos 12 meses · <strong className="text-aviso-texto">72 %</strong></span>
              </figcaption>
              <ul className="space-y-1.5 text-xs">
                {EJEMPLO.map((e) => (
                  <li key={e.texto} className="flex items-start gap-2">
                    <span className={cn("mt-1 size-2.5 shrink-0 rounded-full", e.color)} />
                    <span className="min-w-0 flex-1">{e.texto}{e.accion && <span className="ml-1 inline-flex items-center gap-0.5 text-primary">· {e.accion} <ArrowRight className="size-3" /></span>}</span>
                  </li>
                ))}
              </ul>
            </figure>
            <div>
              <h2 className="mb-2 font-medium">Cómo usarla en 5 pasos</h2>
              <ol className="space-y-2">
                {PASOS.map(([titulo, texto], i) => (
                  <li key={titulo} className="flex gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
                    <span className="min-w-0"><strong>{titulo}</strong> <span className="text-muted-foreground">{texto}</span></span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
