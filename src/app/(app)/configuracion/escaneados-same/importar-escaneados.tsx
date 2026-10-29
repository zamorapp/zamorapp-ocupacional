"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FolderOpen, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { subirAdjunto } from "@/lib/preparar-archivo";
import { crearClienteNavegador } from "@/lib/supabase/client";

type Entrada = { archivo: string; original: string; origen: string; paciente: string; cedula?: string | null; consulta?: string | null; fecha?: string | null; descripcion?: string | null };
type Fila = Entrada & {
  file: File | null;
  trabajador: { id: string; org_id: string; nombre: string; cedula: string } | null;
  consultaId: string | null; firmada: boolean;
  estado: "listo" | "ya" | "sin_paciente" | "sin_archivo" | "subiendo" | "subido" | "error";
  nota?: string;
};

const marcaSame = (origen: string) => `[SAME ${origen}]`;
const soloDigitos = (s: string) => s.replace(/\D/g, "");
const trozos = <T,>(xs: T[], n = 100) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const fechaVe = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : "");

export function ImportarEscaneados({ demo }: { demo: boolean }) {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const elegir = async (lista: FileList | null) => {
    if (!lista?.length) return;
    setError(null);
    setFilas(null);
    const archivos = new Map([...lista].map((f) => [f.name, f]));
    const json = archivos.get("manifiesto.json");
    if (!json) return setError("En esa carpeta no está manifiesto.json. Elige la carpeta .zamorapp\\escaneados-same que creó el cargador.");
    setPreparando(true);
    try {
      const datos = JSON.parse((await json.text()).replace(/^﻿/, "")) as Entrada[] | Entrada;
      const manifiesto = Array.isArray(datos) ? datos : [datos];
      const supabase = crearClienteNavegador();

      // Paciente: por su código del SAME (pac:historia) y, si no, por cédula
      const codigos = [...new Set(manifiesto.map((m) => m.paciente))];
      const cedulas = [...new Set(manifiesto.map((m) => (m.cedula ?? "").trim()).filter(Boolean))];
      const trabajadores: { id: string; org_id: string; nombres: string; apellidos: string; cedula: string; codigo_origen: string | null }[] = [];
      for (const t of trozos(codigos)) {
        const { data } = await supabase.from("trabajadores").select("id, org_id, nombres, apellidos, cedula, codigo_origen").eq("origen", "integral").in("codigo_origen", t);
        trabajadores.push(...(data ?? []));
      }
      for (const t of trozos(cedulas)) {
        const { data } = await supabase.from("trabajadores").select("id, org_id, nombres, apellidos, cedula, codigo_origen").in("cedula", t);
        trabajadores.push(...(data ?? []));
      }
      const porCodigo = new Map(trabajadores.filter((t) => t.codigo_origen).map((t) => [t.codigo_origen!, t]));
      const porCedula = new Map(trabajadores.map((t) => [soloDigitos(t.cedula), t]));

      const codConsultas = [...new Set(manifiesto.flatMap((m) => (m.consulta ? [m.consulta] : [])))];
      const consultas = new Map<string, { id: string; trabajador_id: string; estado: string }>();
      for (const t of trozos(codConsultas)) {
        const { data } = await supabase.from("consultas").select("id, trabajador_id, estado, codigo_origen").eq("origen", "integral").in("codigo_origen", t);
        for (const c of data ?? []) consultas.set(c.codigo_origen as string, c);
      }

      // Ya subidos antes (se reconocen por la marca [SAME …] en la descripción): no se repiten
      const ids = [...new Set(trabajadores.map((t) => t.id))];
      const yaSubidos = new Set<string>();
      for (const t of trozos(ids)) {
        const { data } = await supabase.from("adjuntos").select("descripcion").in("trabajador_id", t).like("descripcion", "%[SAME %");
        for (const a of data ?? []) yaSubidos.add(a.descripcion as string);
      }
      const ya = (origen: string) => [...yaSubidos].some((d) => d.includes(marcaSame(origen)));

      setFilas(manifiesto.map((m): Fila => {
        const t = porCodigo.get(m.paciente) ?? (m.cedula ? porCedula.get(soloDigitos(m.cedula)) : undefined);
        const c = m.consulta ? consultas.get(m.consulta) : undefined;
        const enConsulta = c && t && c.trabajador_id === t.id ? c : undefined;
        const file = archivos.get(m.archivo) ?? null;
        return {
          ...m, file,
          trabajador: t ? { id: t.id, org_id: t.org_id, nombre: `${t.nombres} ${t.apellidos}`.trim(), cedula: t.cedula } : null,
          consultaId: enConsulta?.id ?? null, firmada: enConsulta?.estado === "firmada",
          estado: !file ? "sin_archivo" : !t ? "sin_paciente" : ya(m.origen) ? "ya" : "listo",
        };
      }));
    } catch (e) {
      setError((e as Error).message || "No se pudo leer la carpeta.");
    } finally {
      setPreparando(false);
    }
  };

  const cambiar = (i: number, c: Partial<Fila>) => setFilas((fs) => fs && fs.map((f, j) => (j === i ? { ...f, ...c } : f)));

  // De uno en uno: pocos archivos (unos 54) y así un fallo no deja nada a medias
  const subir = async () => {
    if (!filas) return;
    setSubiendo(true);
    const supabase = crearClienteNavegador();
    for (const [i, f] of filas.entries()) {
      if (f.estado !== "listo" && f.estado !== "error") continue;
      cambiar(i, { estado: "subiendo", nota: undefined });
      const descripcion = `${f.descripcion || f.original}${f.fecha ? ` · ${fechaVe(f.fecha)}` : ""} ${marcaSame(f.origen)}`.slice(0, 500);
      try {
        const datos = { orgId: f.trabajador!.org_id, trabajadorId: f.trabajador!.id };
        // Las consultas importadas suelen estar firmadas: entonces el archivo va a la ficha del paciente (con la fecha en la descripción)
        let a = null;
        if (f.consultaId && !f.firmada) a = await subirAdjunto(supabase, { ...datos, consultaId: f.consultaId }, f.file!).catch(() => null);
        a ??= await subirAdjunto(supabase, datos, f.file!);
        const { error: e } = await supabase.from("adjuntos").update({ descripcion }).eq("id", a.id);
        if (e) throw new Error(e.message);
        cambiar(i, { estado: "subido", nota: a.consulta_id ? "En su consulta" : "En la ficha del paciente" });
      } catch (e) {
        cambiar(i, { estado: "error", nota: (e as Error).message });
      }
    }
    setSubiendo(false);
  };

  const cuenta = (e: Fila["estado"]) => filas?.filter((f) => f.estado === e).length ?? 0;
  const porSubir = cuenta("listo") + cuenta("error");

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-4 sm:flex sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 text-sm">
            <FolderOpen className="mt-0.5 size-5 shrink-0 text-primary" />
            <p className="text-muted-foreground">
              Primero corre en la PC del SAME <code className="rounded bg-muted px-1">scripts\importar-integral\escaneados.ps1</code> (solo lee el SAME). Después elige aquí la carpeta que creó.
            </p>
          </div>
          {/* @ts-expect-error webkitdirectory no está en los tipos de React, pero Chrome y Edge lo aceptan */}
          <input ref={entrada} type="file" multiple webkitdirectory="" className="hidden" onChange={(e) => { void elegir(e.target.files); e.target.value = ""; }} />
          <Button onClick={() => entrada.current?.click()} disabled={demo || preparando || subiendo}>
            {preparando ? <Loader2 className="animate-spin" /> : <FolderOpen />} Elegir carpeta
          </Button>
        </CardContent>
      </Card>

      {error && <p role="alert" className="rounded-lg border border-alerta/50 bg-alerta/10 p-3 text-sm text-alerta-texto">{error}</p>}

      {filas && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" role="status">
              {filas.length} archivos · {cuenta("listo")} por subir · {cuenta("ya")} ya estaban · {cuenta("subido")} subidos
              {cuenta("sin_paciente") + cuenta("sin_archivo") ? ` · ${cuenta("sin_paciente") + cuenta("sin_archivo")} sin destino` : ""}
              {cuenta("error") ? ` · ${cuenta("error")} con error` : ""}
            </p>
            <Button onClick={subir} disabled={subiendo || !porSubir}>
              {subiendo ? <Loader2 className="animate-spin" /> : <Upload />} {cuenta("error") && !cuenta("listo") ? "Reintentar" : `Subir ${porSubir}`}
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Archivo</TableHead><TableHead>Paciente</TableHead><TableHead>Destino</TableHead><TableHead>Estado</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((f) => (
                  <TableRow key={f.origen}>
                    <TableCell className="max-w-56 truncate" title={f.original}>{f.descripcion || f.original}</TableCell>
                    <TableCell>{f.trabajador ? `${f.trabajador.nombre} · ${f.trabajador.cedula}` : <span className="text-muted-foreground">{f.cedula || f.paciente}</span>}</TableCell>
                    <TableCell className="text-muted-foreground">{f.consultaId && !f.firmada ? "Su consulta" : "Ficha del paciente"}{f.fecha ? ` · ${fechaVe(f.fecha)}` : ""}</TableCell>
                    <TableCell>
                      {f.estado === "subido" || f.estado === "ya" ? (
                        <span className="inline-flex items-center gap-1 text-ok-texto"><CheckCircle2 className="size-4" /> {f.estado === "ya" ? "Ya estaba" : f.nota}</span>
                      ) : f.estado === "subiendo" ? (
                        <span className="inline-flex items-center gap-1"><Loader2 className="size-4 animate-spin" /> Subiendo</span>
                      ) : f.estado === "listo" ? (
                        "Por subir"
                      ) : (
                        <span className="inline-flex items-center gap-1 text-aviso-texto" title={f.nota}>
                          <AlertTriangle className="size-4" />
                          {f.estado === "sin_paciente" ? "Paciente no está en zamorApp" : f.estado === "sin_archivo" ? "Falta el archivo en la carpeta" : `Error: ${f.nota}`}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
