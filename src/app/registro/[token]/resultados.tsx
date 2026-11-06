"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Camera, CheckCircle2, FileUp, Loader2, Paperclip, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prepararArchivo } from "@/lib/preparar-archivo";
import { aQuien, conArticulo } from "@/lib/solicitudes-paciente";
import { confirmarResultado, reservarResultado } from "./acciones";

export type EstadoResultados = { remitente: string; puede: boolean; motivo: "vencido" | "por_confirmar" | null; hasta: string; archivos: { nombre: string; subido: string }[] };

const fechaCorta = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
// «Él» para el Dr., «Ella» para la Dra.; si es el servicio, su nombre
const pronombre = (r: string) => (/^dra\.?\s/i.test(r) ? "Ella" : /^dr\.?\s/i.test(r) ? "Él" : conArticulo(r));
const diaCaracas = (iso: string) => new Intl.DateTimeFormat("es-VE", { timeZone: "America/Caracas", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

// «Enviar mis resultados»: el paciente vuelve al mismo enlace con sus exámenes hechos y los sube (fotos o PDF).
// Cada archivo: se prepara en el teléfono (fotos sin datos de ubicación y achicadas), la base reserva su ruta, se sube
// con la llave pública y la base lo confirma y lo pasa a su historia. El médico recibe el aviso.
export function EnviarResultados({ token, servicio, telefono, estado }: { token: string; servicio: string; telefono?: string | null; estado: EstadoResultados }) {
  const remitente = estado.remitente;
  const router = useRouter();
  const archivos = useRef<HTMLInputElement>(null);
  const camara = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listos, setListos] = useState<string[]>([]);

  const subir = async (lista: FileList | null) => {
    if (!lista?.length) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !clave) return setError("El servicio no está disponible. Intenta más tarde.");
    const supabase = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
    setError(null);
    const hechos: string[] = [];
    for (const [i, original] of [...lista].entries()) {
      setSubiendo(`Enviando ${i + 1} de ${lista.length}…`);
      try {
        const archivo = await prepararArchivo(original);
        const r = await reservarResultado(token, archivo.type);
        if (!r.ruta) throw new Error(r.error ?? "No se pudo preparar la subida.");
        const { error: e } = await supabase.storage.from("adjuntos").upload(r.ruta, archivo, { contentType: archivo.type, upsert: false });
        if (e) throw new Error(`No se pudo subir ${original.name}. Revisa tu conexión e inténtalo de nuevo.`);
        const nombre = original.name.replace(/\.[^.]+$/, "").replace(/^(IMG|PXL|DSC|WhatsApp Image)[-_ ].*/i, "") || `Resultado ${estado.archivos.length + hechos.length + 1}`;
        const c = await confirmarResultado(token, r.ruta, nombre);
        if (!c.ok) throw new Error(c.mensaje);
        hechos.push(nombre);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo enviar.");
        break;
      }
    }
    setSubiendo(null);
    if (archivos.current) archivos.current.value = "";
    if (camara.current) camara.current.value = "";
    if (hechos.length) { setListos((x) => [...x, ...hechos]); router.refresh(); }
  };

  return (
    <section id="resultados" className="scroll-mt-4 space-y-4 rounded-2xl border bg-card p-6 shadow-sm" aria-labelledby="titulo-resultados">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Upload className="size-5" /></span>
        <div className="min-w-0">
          <h2 id="titulo-resultados" className="text-lg font-semibold">Enviar mis resultados</h2>
          <p className="text-sm text-muted-foreground">
            {estado.puede
              ? <>Cuando tengas tus resultados, súbelos aquí: fotos claras o PDF. Le llegan directo {aQuien(remitente)}.</>
              : estado.motivo === "vencido"
                ? <>El plazo para subir resultados con este enlace terminó. Escríbele a {servicio} y te enviará uno nuevo.</>
                : <>Podrás subirlos aquí apenas {servicio} confirme tu cita. Guarda este enlace.</>}
          </p>
        </div>
      </div>

      {listos.length > 0 && (
        <div role="status" className="space-y-1 rounded-xl border border-ok/40 bg-ok/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-5 shrink-0 text-ok" /> ¡Recibidos!</p>
          <p>Tus resultados ya fueron cargados en tu historia y se le avisó {aQuien(remitente)}. {pronombre(remitente)} te contactará para una nueva cita o para darte las recomendaciones directamente.</p>
          <p className="pt-1 text-xs">Si te sientes mal o es urgente, no esperes: {telefono ? <>llama al <a className="font-medium text-primary" href={`tel:${telefono}`}>{telefono}</a></> : <>llama a {servicio}</>}.</p>
        </div>
      )}

      {estado.puede && (
        <>
          <input ref={archivos} type="file" multiple accept="application/pdf,image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => subir(e.target.files)} />
          <input ref={camara} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => subir(e.target.files)} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button type="button" size="lg" className="h-12 text-base" disabled={!!subiendo} onClick={() => archivos.current?.click()}>
              {subiendo ? <Loader2 className="animate-spin" /> : <FileUp />} {subiendo ?? "Elegir fotos o PDF"}
            </Button>
            <Button type="button" size="lg" variant="outline" className="h-12 text-base" disabled={!!subiendo} onClick={() => camara.current?.click()}>
              <Camera /> Tomar foto
            </Button>
          </div>
          {error && <p role="alert" className="rounded-md bg-alerta/10 px-3 py-2 text-sm text-alerta-texto">{error}</p>}
          <p className="text-xs text-muted-foreground">Hasta 10 MB por archivo. Puedes enviar hasta el {fechaCorta(estado.hasta)}.</p>
        </>
      )}

      {estado.archivos.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Ya enviaste</p>
          <ul className="space-y-1">
            {estado.archivos.map((a, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{a.nombre}</span>
                <span className="text-xs text-muted-foreground">{diaCaracas(a.subido)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
