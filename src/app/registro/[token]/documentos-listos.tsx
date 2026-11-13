import Link from "next/link";
import { AlarmClock, CheckCircle2, ChevronRight, FileText, FlaskConical, HeartPulse, Leaf, NotebookPen, Salad, ScanLine } from "lucide-react";
import { FichaBoton, TarjetaEnlace } from "@/components/enlace/marco-enlace";
import { filasRegistro, fraseIndicaciones, remitente, saludoListo, type VistaRegistro } from "@/lib/registro-documentos";

// Ícono de cada hoja que descarga (orden de laboratorio; las de imagen llevan ScanLine), recomendaciones, tensión, dieta, bienestar
const ICONO_DOC: Record<string, typeof FileText> = { orden: FlaskConical, recomendaciones: NotebookPen, "control-ta": HeartPulse, dieta: Salad, bienestar: Leaf };

const horaCaracas = (iso: string) => new Intl.DateTimeFormat("es-VE", { timeZone: "America/Caracas", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));

// Lo que ve el paciente apenas guarda sus datos: una fila por documento para abrirlo y descargarlo
export function DocumentosListos({ token, docs }: { token: string; docs: VistaRegistro }) {
  return (
          <TarjetaEnlace role="status" className="space-y-4">
            <div className="space-y-1 text-center">
              <CheckCircle2 className="mx-auto size-12 text-ok" />
              <h1 className="text-xl font-semibold">{saludoListo(docs.saludo, docs.persona.nombres)}</h1>
              <p className="text-sm text-muted-foreground">{fraseIndicaciones(remitente(docs), docs.documentos.conversadas)} Descárguelas y téngalas a mano.</p>
            </div>
            <ul className="space-y-2">
              {filasRegistro(docs.documentos).map((f, i) => (
                <li key={f.parte ?? f.tipo}>
                  <Link href={`/registro/${token}/documento/${f.tipo}${f.parte ? `?parte=${f.parte}` : ""}`} className="group flex min-h-16 items-center rounded-xl border bg-background px-3 py-2.5 shadow-xs transition-[border-color,box-shadow,transform] duration-200 hover:border-primary hover:shadow-md motion-safe:hover:-translate-y-0.5">
                    <FichaBoton icono={f.parte && f.parte !== "laboratorio" ? ScanLine : ICONO_DOC[f.tipo] ?? FileText} titulo={f.nombre} detalle={f.detalle && <span className="block truncate">{f.detalle}</span>} indice={i}>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform motion-safe:group-hover:translate-x-0.5" />
                    </FichaBoton>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-center text-xs text-muted-foreground">Ábralos y toque «Descargar PDF».</p>
            <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
              <AlarmClock className="mt-0.5 size-5 shrink-0" />
              <span>
                {docs.descarga_hasta
                  ? <>Puede descargarlos hasta las <b>{horaCaracas(docs.descarga_hasta)}</b>. Después, este enlace queda solo para enviar sus resultados.</>
                  : <>Tiene 30 minutos desde la primera descarga para bajarlos todos. Después, este enlace queda solo para enviar sus resultados.</>}
              </span>
            </p>
            <p className="rounded-xl bg-primary/10 px-4 py-3 text-center text-sm">Cuando tenga sus resultados, vuelva a este mismo enlace y súbalos abajo, en «Enviar mis resultados».</p>
          </TarjetaEnlace>
  );
}
