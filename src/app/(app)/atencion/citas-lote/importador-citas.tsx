"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Download, Loader2, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { leerCSV } from "@/lib/importar";
import { cn } from "@/lib/utils";
import { importarCitas, trabajadoresPorCedula } from "../citas-acciones";

type Motivo = { id: string; nombre: string; codigo: string | null };
type Fila = { fila: number; cedula: string; paciente: string; trabajadorId: string | null; fecha: string; hora: string | null; motivo: string; motivoId: string | null; errores: string[] };

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/_/g, " ").trim().toLowerCase();
const COLUMNAS = { cedula: ["cedula", "ci", "documento"], fecha: ["fecha", "fecha cita", "dia"], hora: ["hora", "hora cita"], motivo: ["motivo", "motivo consulta", "tipo de evaluacion", "evaluacion"] };

function aTexto(v: unknown) {
  if (v instanceof Date) return v.toISOString();
  return v === null || v === undefined ? "" : String(v).trim();
}

function fechaISO(v: string) {
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

function horaHHMM(v: string) {
  if (!v) return null;
  const iso = v.match(/T(\d{2}):(\d{2})/); // hora que Excel entrega como fecha
  if (iso) return `${iso[1]}:${iso[2]}`;
  const m = v.match(/^(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]?.toLowerCase().startsWith("p") && h < 12) h += 12;
  if (m[3]?.toLowerCase().startsWith("a") && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function cedulaNormal(v: string) {
  const m = v.toUpperCase().replace(/[.\s]/g, "").match(/^([VEP])?-?(\d{5,9})$/);
  return m ? `${m[1] ?? "V"}-${m[2]}` : null;
}

function descargarPlantilla() {
  const csv = "﻿CEDULA;FECHA;HORA;MOTIVO\r\n12345678;27/10/2026;08:00;Periódico\r\n";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  Object.assign(document.createElement("a"), { href: url, download: "plantilla-citas.csv" }).click();
  URL.revokeObjectURL(url);
}

export function ImportadorCitas({ motivos }: { motivos: Motivo[] }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [leyendo, iniciarLectura] = useTransition();
  const [guardando, iniciarGuardado] = useTransition();

  const buscarMotivo = (t: string) => {
    const k = sinAcentos(t);
    return motivos.find((m) => sinAcentos(m.nombre) === k || (m.codigo && sinAcentos(m.codigo) === k)) ?? motivos.find((m) => k && sinAcentos(m.nombre).includes(k));
  };

  const procesar = (f: File) =>
    iniciarLectura(async () => {
      setError(null);
      setResultado(null);
      setArchivo(f.name);
      try {
        const celdas: unknown[][] = /\.csv$/i.test(f.name) ? leerCSV(await f.text()) : await (await import("read-excel-file")).default(f);
        const cab = (celdas[0] ?? []).map((c) => sinAcentos(aTexto(c)));
        const idx = Object.fromEntries(Object.entries(COLUMNAS).map(([k, alias]) => [k, cab.findIndex((h) => alias.includes(h))])) as Record<keyof typeof COLUMNAS, number>;
        if (idx.cedula < 0 || idx.fecha < 0) {
          setFilas([]);
          setError("El archivo debe tener al menos las columnas CEDULA y FECHA.");
          return;
        }
        const crudas = celdas.slice(1).filter((r) => r.some((c) => aTexto(c)));
        const cedulas = crudas.map((r) => cedulaNormal(aTexto(r[idx.cedula]))).filter(Boolean) as string[];
        const encontrados = await trabajadoresPorCedula([...new Set(cedulas)]);
        setFilas(
          crudas.map((r, i) => {
            const errores: string[] = [];
            const ced = cedulaNormal(aTexto(r[idx.cedula]));
            const t = ced ? encontrados[ced] : undefined;
            if (!ced) errores.push("Cédula inválida");
            else if (!t) errores.push("No está en Pacientes");
            const fecha = fechaISO(aTexto(r[idx.fecha]));
            if (!fecha) errores.push("Fecha inválida");
            const motivoTxt = idx.motivo >= 0 ? aTexto(r[idx.motivo]) : "";
            const motivo = motivoTxt ? buscarMotivo(motivoTxt) : undefined;
            if (motivoTxt && !motivo) errores.push(`Motivo desconocido: ${motivoTxt}`);
            return {
              fila: i + 2,
              cedula: ced ?? aTexto(r[idx.cedula]),
              paciente: t?.nombre ?? "",
              trabajadorId: t?.id ?? null,
              fecha: fecha ?? aTexto(r[idx.fecha]),
              hora: idx.hora >= 0 ? horaHHMM(aTexto(r[idx.hora])) : null,
              motivo: motivo?.nombre ?? motivoTxt,
              motivoId: motivo?.id ?? null,
              errores,
            };
          }),
        );
      } catch {
        setError("No se pudo leer el archivo. Usa .xlsx o .csv");
      }
    });

  const validas = filas.filter((f) => !f.errores.length);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            className="flex h-24 flex-1 items-center justify-center gap-3 rounded-xl border-2 border-dashed transition hover:border-primary/50 hover:bg-muted/40"
          >
            {leyendo ? <Loader2 className="size-6 animate-spin text-primary" /> : <Upload className="size-6 text-primary" />}
            <span className="font-medium">{archivo ?? "Elegir archivo Excel o CSV"}</span>
          </button>
          <input ref={entrada} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) procesar(f); e.target.value = ""; }} />
          <div className="text-sm text-muted-foreground">
            Columnas: <b className="text-foreground">CEDULA, FECHA</b> y, si quieres, HORA y MOTIVO.<br />
            Los pacientes deben estar registrados.
            <Button variant="link" className="h-auto p-0" onClick={descargarPlantilla}><Download /> Plantilla</Button>
          </div>
        </CardContent>
      </Card>

      {error && <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"><XCircle className="size-4" /> {error}</p>}
      {resultado && (
        <p className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm", resultado.ok ? "bg-ok/10 text-ok" : "bg-destructive/10 text-destructive")}>
          {resultado.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />} {resultado.mensaje}
          {resultado.ok && <Link href="/atencion" className="ml-auto font-medium hover:underline">Ver la cola</Link>}
        </p>
      )}

      {filas.length > 0 && (
        <Card className="overflow-hidden py-0">
          <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
            <span className="font-medium">{filas.length} filas</span>
            <span className="rounded-full bg-ok/15 px-2.5 py-0.5 text-xs font-medium text-ok">{validas.length} válidas</span>
            {filas.length > validas.length && <span className="rounded-full bg-alerta/15 px-2.5 py-0.5 text-xs font-medium text-alerta">{filas.length - validas.length} con errores</span>}
            <Button
              className="ml-auto"
              disabled={!validas.length || guardando || resultado?.ok}
              onClick={() => iniciarGuardado(async () => setResultado(await importarCitas(validas.map((f) => ({ trabajadorId: f.trabajadorId!, fecha: f.fecha, hora: f.hora, motivoId: f.motivoId })))))}
            >
              {guardando && <Loader2 className="animate-spin" />} Agendar {validas.length} citas
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-5">Fila</TableHead><TableHead>Cédula</TableHead><TableHead>Paciente</TableHead>
                <TableHead>Fecha</TableHead><TableHead>Hora</TableHead><TableHead>Motivo</TableHead><TableHead className="pr-5">Revisión</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={f.fila} className={f.errores.length ? "bg-alerta/5" : undefined}>
                  <TableCell className="pl-5 text-muted-foreground">{f.fila}</TableCell>
                  <TableCell className="font-mono text-sm">{f.cedula}</TableCell>
                  <TableCell>{f.paciente || "—"}</TableCell>
                  <TableCell>{/^\d{4}-/.test(f.fecha) ? f.fecha.split("-").reverse().join("/") : f.fecha}</TableCell>
                  <TableCell>{f.hora ?? "—"}</TableCell>
                  <TableCell>{f.motivo || "—"}</TableCell>
                  <TableCell className="pr-5">{f.errores.length ? <span className="text-sm text-alerta">{f.errores.join(" · ")}</span> : <CheckCircle2 className="size-4 text-ok" />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
