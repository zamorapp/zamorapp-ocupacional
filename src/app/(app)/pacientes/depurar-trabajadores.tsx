"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Search, Undo2, Upload, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Candidato, candidatosInactivar, deshacerInactivar, type Inactivados, inactivarTrabajadores } from "./acciones";
import { claveCedula, esEncabezadoCedula, esEncabezadoSigue, leerSigue } from "@/lib/depurar";
import { hoyCaracas, sumarMeses } from "@/lib/fecha";
import { fecha } from "@/lib/pacientes";
import { cn } from "@/lib/utils";

const SELECT = "h-10 w-full rounded-md border bg-transparent px-3 text-sm";
const MESES = [12, 18, 24] as const;
const TANDA = 150;

type Paso = "elegir" | "lista" | "hecho";
type DelExcel = { no: number; si: number; vacios: number; fuera: number };

/**
 * Depurar trabajadores (Cesar, 31-oct): inactiva en grupo a quienes ya no están en la empresa y nunca tuvieron egreso
 * (sobre todo los traídos del SAME). No es un egreso y nada se borra. Dos caminos: marcar en la lista, o descargar un
 * Excel para RR. HH., que escribe NO a quien ya no trabaja, y subirlo. Nada se aplica sin confirmar, y queda «Deshacer».
 */
export function DepurarTrabajadores({ empresas, empresaInicial }: { empresas: { id: string; nombre: string }[]; empresaInicial: string }) {
  const router = useRouter();
  const archivo = useRef<HTMLInputElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [paso, setPaso] = useState<Paso>("elegir");
  const [empresa, setEmpresa] = useState(empresaInicial);
  const [meses, setMeses] = useState<number | null>(12);
  const [desde, setDesde] = useState(() => sumarMeses(hoyCaracas(), -12));
  const [lista, setLista] = useState<Candidato[]>([]);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState("");
  const [mostrar, setMostrar] = useState(TANDA);
  const [motivo, setMotivo] = useState("");
  const [excel, setExcel] = useState<DelExcel | null>(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [hecho, setHecho] = useState<Inactivados | null>(null);
  const [ocupado, iniciar] = useTransition();

  const reiniciar = () => {
    setPaso("elegir"); setLista([]); setMarcados(new Set()); setFiltro(""); setMostrar(TANDA); setExcel(null); setMensaje(null); setHecho(null);
  };
  const elegirMeses = (m: number) => { setMeses(m); setDesde(sumarMeses(hoyCaracas(), -m)); };

  const verLista = () => iniciar(async () => {
    setMensaje(null);
    const r = await candidatosInactivar(empresa || null, desde);
    if (!r.ok || !r.candidatos) return setMensaje({ ok: false, texto: r.mensaje });
    setLista(r.candidatos);
    // Sin marcar de entrada: Cesar decide (o RR. HH. con el Excel) a quién inactivar
    setMarcados(new Set());
    setMotivo(`Sin consulta desde el ${fecha(desde)}`);
    setPaso("lista");
  });

  const subirExcel = (f: File) => iniciar(async () => {
    setMensaje(null);
    try {
      const filas: unknown[][] = await (await import("read-excel-file")).default(f);
      const enc = filas.findIndex((fila) => fila.some(esEncabezadoCedula) && fila.some(esEncabezadoSigue));
      if (enc < 0) return setMensaje({ ok: false, texto: "Ese Excel no tiene las columnas «Cédula» y «¿Sigue en la empresa?». Usa el que descargaste aquí." });
      const cCed = filas[enc].findIndex(esEncabezadoCedula);
      const cSig = filas[enc].findIndex(esEncabezadoSigue);
      const porCedula = new Map(lista.map((c) => [claveCedula(c.cedula), c.id]));
      const nuevos = new Set<string>();
      const cuenta: DelExcel = { no: 0, si: 0, vacios: 0, fuera: 0 };
      for (const fila of filas.slice(enc + 1)) {
        const clave = claveCedula(fila[cCed]);
        if (!clave) continue;
        const id = porCedula.get(clave);
        if (!id) { cuenta.fuera++; continue; }
        const sigue = leerSigue(fila[cSig]);
        if (sigue === false) { nuevos.add(id); cuenta.no++; } else if (sigue === true) cuenta.si++; else cuenta.vacios++;
      }
      setMarcados(nuevos);
      setExcel(cuenta);
      setMotivo("No aparece en la nómina (RR. HH.)");
    } catch {
      setMensaje({ ok: false, texto: "No se pudo leer el archivo. Guárdalo como Excel (.xlsx) y vuelve a subirlo." });
    }
  });

  const inactivar = () => iniciar(async () => {
    const r = await inactivarTrabajadores([...marcados], hoyCaracas(), motivo);
    setMensaje({ ok: r.ok, texto: r.mensaje });
    if (r.ok && r.hecho) { setHecho(r.hecho); setPaso("hecho"); }
  });
  const deshacer = () => iniciar(async () => {
    if (!hecho) return;
    const r = await deshacerInactivar(hecho);
    setMensaje({ ok: r.ok, texto: r.mensaje });
    if (r.ok) { setHecho(null); router.refresh(); }
  });

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return q ? lista.filter((c) => `${c.cedula} ${c.nombres} ${c.apellidos} ${c.cargo ?? ""}`.toLowerCase().includes(q)) : lista;
  }, [lista, filtro]);
  const alternar = (id: string) => setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todosVisibles = visibles.length > 0 && visibles.every((c) => marcados.has(c.id));
  const marcarVisibles = () => setMarcados((m) => {
    const n = new Set(m);
    for (const c of visibles) if (todosVisibles) n.delete(c.id); else n.add(c.id);
    return n;
  });
  const urlExcel = `/pacientes/depurar-excel?${new URLSearchParams({ empresa, desde })}`;

  return (
    <Dialog open={abierto} onOpenChange={(v) => { if (!v && paso === "hecho") router.refresh(); setAbierto(v); if (!v) reiniciar(); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><UserMinus /> Depurar trabajadores</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Depurar trabajadores</DialogTitle>
          <DialogDescription>
            Para quienes ya no están en la empresa pero nunca tuvieron egreso (por ejemplo, los traídos del SAME). Quedan
            «Inactivos»: no cuentan en conteos, estadísticas ni alertas, y sus datos e historia se conservan para un reingreso.
          </DialogDescription>
        </DialogHeader>

        {paso === "elegir" && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="dep-empresa" className="mb-1.5">Empresa</Label>
              <select id="dep-empresa" className={SELECT} value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
                <option value="">Todas las empresas</option>
                {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div>
              <Label className="mb-1.5">Sin consulta desde hace</Label>
              <div className="flex flex-wrap items-center gap-2">
                {MESES.map((m) => (
                  <button key={m} type="button" onClick={() => elegirMeses(m)} aria-pressed={meses === m}
                    className={cn("h-10 rounded-md border px-3 text-sm transition", meses === m ? "border-primary bg-primary/10 font-medium text-primary" : "hover:border-primary")}>
                    {m} meses
                  </button>
                ))}
                <Input aria-label="O desde una fecha" type="date" max={hoyCaracas()} className="h-10 w-auto" value={desde}
                  onChange={(e) => { setDesde(e.target.value); setMeses(null); }} />
              </div>
            </div>
            {mensaje && !mensaje.ok && <p role="alert" className="text-sm text-destructive">{mensaje.texto}</p>}
            <Button className="w-full" onClick={verLista} disabled={ocupado || !desde}>
              {ocupado && <Loader2 className="animate-spin" />} Ver la lista
            </Button>
          </div>
        )}

        {paso === "lista" && (
          <div className="space-y-3">
            {lista.length === 0 ? (
              <p className="rounded-md bg-muted px-3 py-3 text-sm text-muted-foreground">
                Nadie para depurar: todos tienen consulta desde el {fecha(desde)} o ya están inactivos o egresados.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-2 rounded-lg border bg-muted/40 p-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <p><span className="font-medium">{lista.length}</span> sin consulta desde el {fecha(desde)}. ¿Confirmas con RR. HH.?</p>
                  <Button variant="outline" size="sm" asChild>
                    <a href={urlExcel} download><Download /> Excel para RR. HH.</a>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => archivo.current?.click()} disabled={ocupado}>
                    {ocupado ? <Loader2 className="animate-spin" /> : <Upload />} Subir el de RR. HH.
                  </Button>
                  <input ref={archivo} type="file" accept=".xlsx" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) subirExcel(f); e.target.value = ""; }} />
                </div>
                {excel && (
                  <p role="status" className="rounded-md bg-ok/10 px-3 py-2 text-sm">
                    RR. HH. respondió: <span className="font-medium">{excel.no} ya no están</span> (marcados) · {excel.si} siguen
                    {excel.vacios > 0 && ` · ${excel.vacios} sin responder (no se marcan)`}
                    {excel.fuera > 0 && ` · ${excel.fuera} cédulas que no están en esta lista (se ignoran)`}.
                  </p>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={filtro} onChange={(e) => { setFiltro(e.target.value); setMostrar(TANDA); }} placeholder="Buscar en la lista" className="h-10 pl-9" />
                  </label>
                  <Button variant="ghost" size="sm" onClick={marcarVisibles}>{todosVisibles ? "Desmarcar" : "Marcar"} {filtro ? "los que se ven" : "todos"}</Button>
                </div>
                <ul className="max-h-[40dvh] divide-y overflow-y-auto rounded-lg border">
                  {visibles.slice(0, mostrar).map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50">
                        <input type="checkbox" className="size-4 accent-primary" checked={marcados.has(c.id)} onChange={() => alternar(c.id)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{c.apellidos} {c.nombres}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[c.cedula, !empresa && c.empresa, c.cargo].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-xs text-muted-foreground">
                          {c.ultimaConsulta ? <>Última consulta<br />{fecha(c.ultimaConsulta)}</> : "Nunca consultado"}
                        </span>
                      </label>
                    </li>
                  ))}
                  {visibles.length > mostrar && (
                    <li><Button variant="ghost" className="w-full" onClick={() => setMostrar((n) => n + TANDA)}>Ver {Math.min(TANDA, visibles.length - mostrar)} más</Button></li>
                  )}
                </ul>
                <div>
                  <Label htmlFor="dep-motivo" className="mb-1.5">Motivo</Label>
                  <Input id="dep-motivo" maxLength={200} className="h-10" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                </div>
              </>
            )}
            {mensaje && !mensaje.ok && <p role="alert" className="text-sm text-destructive">{mensaje.texto}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="ghost" onClick={reiniciar} disabled={ocupado}>Cambiar empresa o fecha</Button>
              {lista.length > 0 && (
                <Button className="flex-1" onClick={inactivar} disabled={ocupado || marcados.size === 0}>
                  {ocupado && <Loader2 className="animate-spin" />}
                  {marcados.size === 0 ? "Marca a quienes ya no están" : `Inactivar ${marcados.size} ${marcados.size === 1 ? "trabajador" : "trabajadores"}`}
                </Button>
              )}
            </div>
          </div>
        )}

        {paso === "hecho" && (
          <div className="space-y-3">
            <p role="status" className={mensaje?.ok ? "text-sm text-ok-texto" : "text-sm text-destructive"}>{mensaje?.texto}</p>
            <div className="flex gap-2">
              {hecho && (
                <Button variant="outline" className="flex-1" onClick={deshacer} disabled={ocupado}>
                  {ocupado ? <Loader2 className="animate-spin" /> : <Undo2 />} Deshacer
                </Button>
              )}
              <Button className="flex-1" onClick={() => { setAbierto(false); reiniciar(); router.refresh(); }} disabled={ocupado}>Listo</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
