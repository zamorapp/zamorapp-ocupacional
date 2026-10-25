"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Search, UserPlus, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ESTILO_APTITUD,
  ETIQUETA_APTITUD,
  ETIQUETA_ESTADO,
  type EstadoTrabajador,
  type Trabajador,
  edad,
  iniciales,
} from "@/lib/pacientes";
import { cn } from "@/lib/utils";

const TODAS = "todas";

// Quita acentos y guiones para buscar "v18456123" o "gonzalez" igual que "V-18.456.123" o "González"
function normalizar(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[-.\s]/g, "").toLowerCase();
}

export function ListaPacientes({ trabajadores }: { trabajadores: Trabajador[] }) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [empresa, setEmpresa] = useState(TODAS);
  const [estado, setEstado] = useState<EstadoTrabajador | typeof TODAS>(TODAS);

  const empresas = useMemo(() => [...new Set(trabajadores.map((t) => t.empresa))].sort(), [trabajadores]);

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda);
    return trabajadores.filter(
      (t) =>
        (empresa === TODAS || t.empresa === empresa) &&
        (estado === TODAS || t.estado === estado) &&
        (!q || normalizar(`${t.cedula} ${t.nombres} ${t.apellidos} ${t.cargo} ${t.historia}`).includes(q)),
    );
  }, [trabajadores, busqueda, empresa, estado]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Pacientes</h1>
          <p className="text-muted-foreground">{trabajadores.length} trabajadores en el expediente</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/pacientes/importar"><FileSpreadsheet /> Importar Excel</Link>
          </Button>
          <Button disabled title="Disponible al conectar Supabase">
            <UserPlus /> Nuevo paciente
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Cédula, nombre, cargo o nº de historia"
            className="h-11 w-full rounded-lg border bg-card pl-9 pr-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
        <Select value={empresa} onValueChange={setEmpresa}>
          <SelectTrigger className="h-11! w-full bg-card sm:w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas las empresas</SelectItem>
            {empresas.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={estado} onValueChange={(v) => setEstado(v as EstadoTrabajador | typeof TODAS)}>
          <SelectTrigger className="h-11! w-full bg-card sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todos los estados</SelectItem>
            {Object.entries(ETIQUETA_ESTADO).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden py-0">
        {filtrados.length === 0 ? (
          <div className="grid place-items-center gap-2 py-16 text-center text-muted-foreground">
            <Users className="size-8" />
            Ningún trabajador coincide con la búsqueda.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-5">Trabajador</TableHead>
                <TableHead className="hidden md:table-cell">Empresa · Cargo</TableHead>
                <TableHead className="hidden lg:table-cell">Edad</TableHead>
                <TableHead>Aptitud</TableHead>
                <TableHead className="hidden sm:table-cell pr-5">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((t) => (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => router.push(`/pacientes/${t.id}`)}>
                  <TableCell className="py-3 pl-5">
                    <Link href={`/pacientes/${t.id}`} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                      <Avatar className="size-9">
                        <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">{iniciales(t)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{t.nombres} {t.apellidos}</div>
                        <div className="font-mono text-xs text-muted-foreground">{t.cedula}</div>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden max-w-56 md:table-cell">
                    <div className="truncate">{t.empresa}</div>
                    <div className="truncate text-xs text-muted-foreground">{t.cargo}</div>
                  </TableCell>
                  <TableCell className="hidden tabular-nums lg:table-cell">{edad(t.fechaNacimiento)}</TableCell>
                  <TableCell>
                    {t.aptitud ? (
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", ESTILO_APTITUD[t.aptitud])}>
                        {ETIQUETA_APTITUD[t.aptitud]}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin evaluar</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden pr-5 text-sm text-muted-foreground sm:table-cell">{ETIQUETA_ESTADO[t.estado]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
