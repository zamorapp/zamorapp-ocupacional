"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, Loader2, Palmtree, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { buscarPacientes, type PacienteEncontrado } from "../atencion/acciones";
import { editarVacaciones, guardarVacaciones, listarVacaciones, type Vacacion } from "../pacientes/[id]/vacaciones-acciones";

// Días entre dos fechas AAAA-MM-DD (solo aritmética del calendario; nunca la hora de la PC)
const diasEntre = (a: string, b: string) => {
  const [x, y] = [a, b].map((f) => { const [aa, mm, dd] = f.split("-").map(Number); return Date.UTC(aa, mm - 1, dd); });
  return Math.round((y - x) / 864e5);
};

function Paso({ n }: { n: number }) {
  return <span className="mr-1 inline-grid size-5 place-items-center rounded-full bg-primary text-[0.7rem] font-semibold text-primary-foreground">{n}</span>;
}

// Portal de RR. HH.: anotar las vacaciones de un trabajador en 3 pasos. Con el regreso, el servicio médico recibe el
// aviso de la evaluación post vacacional. RR. HH. solo busca en sus empresas y no ve nada clínico.
export function AnotarVacaciones() {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<PacienteEncontrado[]>([]);
  const [elegido, setElegido] = useState<PacienteEncontrado | null>(null);
  const [desde, setDesde] = useState("");
  const [regreso, setRegreso] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [anotadas, setAnotadas] = useState<Vacacion[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);
  const [buscando, iniciarBusqueda] = useTransition();
  const [guardando, iniciar] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => iniciarBusqueda(async () => setResultados(texto.trim().length >= 2 ? await buscarPacientes(texto) : [])), 300);
    return () => clearTimeout(t);
  }, [texto]);

  // Al elegir al trabajador: sus vacaciones ya anotadas, para corregirlas si hace falta
  useEffect(() => {
    let vivo = true;
    setAnotadas([]); setEditando(null);
    if (elegido) listarVacaciones(elegido.id).then((v) => { if (vivo) setAnotadas(v); });
    return () => { vivo = false; };
  }, [elegido]);

  const guardar = () => iniciar(async () => {
    if (!elegido) return;
    setError(null);
    const r = editando ? await editarVacaciones(elegido.id, editando, desde, regreso) : await guardarVacaciones(elegido.id, desde, regreso);
    if (!r.ok) return setError(r.mensaje);
    setListo(`Vacaciones de ${elegido.nombre} ${editando ? "corregidas" : "anotadas"}. El servicio médico te avisará la cita del post vacacional.`);
  });
  const otra = () => { setListo(null); setElegido(null); setDesde(""); setRegreso(""); setTexto(""); setError(null); setEditando(null); };
  const corregir = (v: Vacacion) => { setEditando(v.id); setDesde(v.desde); setRegreso(v.regreso); setError(null); };
  const corta = (iso: string) => iso.split("-").reverse().join("/");
  const dias = desde && regreso && regreso > desde ? diasEntre(desde, regreso) : null;

  return (
    <Dialog open={abierto} onOpenChange={(v) => { setAbierto(v); if (!v) otra(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg"><Palmtree /> Anotar vacaciones</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Anotar vacaciones</DialogTitle>
          <DialogDescription>Así el servicio médico sabe cuándo regresa y le programa la evaluación post vacacional.</DialogDescription>
        </DialogHeader>
        {listo ? (
          <div className="space-y-4">
            <p role="status" className="flex items-start gap-2 text-sm text-ok-texto"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /> {listo}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={otra}>Anotar otra</Button>
              <Button type="button" onClick={() => setAbierto(false)}>Listo</Button>
            </div>
          </div>
        ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="mb-1.5"><Paso n={1} /> ¿Quién sale de vacaciones?</Label>
            {elegido ? (
              <p className="flex items-center gap-1 rounded-full border bg-muted/50 py-1 pl-3 pr-1 text-sm">
                <span className="flex-1">{elegido.nombre} <span className="text-muted-foreground">· {elegido.cedula}</span></span>
                <button type="button" aria-label="Cambiar trabajador" onClick={() => setElegido(null)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3.5" /> Cambiar</button>
              </p>
            ) : (
              <>
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar trabajador" placeholder="Cédula o nombre" className="h-10 w-full rounded-md border bg-transparent pl-9 pr-9 text-sm" />
                  {buscando && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
                </label>
                {texto.trim().length >= 2 && !buscando && resultados.length === 0 && <p className="mt-1 text-xs text-muted-foreground">No está en tu nómina. Prueba con la cédula sin puntos o con el apellido.</p>}
                {resultados.length > 0 && (
                  <ul className="mt-1 max-h-40 divide-y overflow-y-auto rounded-md border">
                    {resultados.map((p) => (
                      <li key={p.id}><button type="button" onClick={() => { setElegido(p); setTexto(""); }} className="w-full px-3 py-2 text-left text-sm hover:bg-muted">{p.nombre} <span className="text-muted-foreground">· {p.cedula}</span></button></li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {elegido && anotadas.length > 0 && (
              <div className="mt-2 space-y-1 text-xs">
                <p className="text-muted-foreground">Ya anotadas (toca una para corregir sus fechas):</p>
                <ul className="flex flex-wrap gap-1.5">
                  {anotadas.map((v) => (
                    <li key={v.id}>
                      <button type="button" onClick={() => editando === v.id ? (setEditando(null), setDesde(""), setRegreso("")) : corregir(v)}
                        className={`whitespace-nowrap rounded-full border px-2.5 py-1 hover:border-primary ${editando === v.id ? "border-primary bg-primary/10 font-medium text-primary" : ""}`}>
                        Del {corta(v.desde)} al {corta(v.regreso)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <label className="grid gap-1.5 text-sm font-medium"><span><Paso n={2} /> Sale el</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-10 rounded-md border bg-transparent px-3 text-sm font-normal" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium"><span><Paso n={3} /> Vuelve a trabajar el</span>
            <input type="date" value={regreso} min={desde || undefined} onChange={(e) => setRegreso(e.target.value)} className="h-10 rounded-md border bg-transparent px-3 text-sm font-normal" />
            {dias !== null && <span className="text-xs font-normal text-muted-foreground">{dias} {dias === 1 ? "día" : "días"} de vacaciones</span>}
          </label>
          <div className="flex items-center gap-2 sm:col-span-2">
            {error && <p role="status" className="text-sm text-alerta-texto">{error}</p>}
            <Button type="button" className="ml-auto" disabled={guardando || !elegido || !desde || !regreso} onClick={guardar}>
              {guardando && <Loader2 className="animate-spin" />} {editando ? "Guardar fechas" : "Anotar vacaciones"}
            </Button>
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
