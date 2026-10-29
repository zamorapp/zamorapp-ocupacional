"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, FileSpreadsheet, Loader2, Search, Stethoscope, Users } from "lucide-react";
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
  type PacienteFila,
  edad,
  iniciales,
} from "@/lib/pacientes";
import { cn } from "@/lib/utils";
import { iniciarConsulta } from "../atencion/acciones";
import { buscarPacientesLista } from "./acciones";

const TODAS = "todas";
const PAGINA = 50;

type Pagina = { filas: PacienteFila[]; total: number };
type Props = {
  pagina: Pagina;
  empresas: { id: string; nombre: string }[];
  empresaInicial: string;
  estadoInicial: EstadoTrabajador | "";
  busquedaInicial: string;
  nuevo: React.ReactNode;
  depurar?: React.ReactNode;
  clinico?: boolean;
  importar?: boolean;
};

export function ListaPacientes({ pagina, empresas, empresaInicial, estadoInicial, busquedaInicial, nuevo, depurar, clinico = false, importar = true }: Props) {
  const router = useRouter();
  const [abriendo, iniciarApertura] = useTransition();
  const [atendiendo, setAtendiendo] = useState<string | null>(null);
  const [errorAtender, setErrorAtender] = useState<string | null>(null);
  const atender = (id: string) => {
    setAtendiendo(id);
    iniciarApertura(async () => {
      const r = await iniciarConsulta(id);
      if (r && !r.ok) setErrorAtender(r.mensaje);
    });
  };

  // La lista llega de 50 en 50 desde el servidor: al escribir o cambiar un filtro se pide otra vez (300 ms después
  // de la última tecla), y «Mostrar más» agrega la página siguiente. Así la pantalla no manda los 4.000 trabajadores.
  const [busqueda, setBusqueda] = useState(busquedaInicial);
  const [empresa, setEmpresa] = useState(empresaInicial || TODAS);
  const [estado, setEstado] = useState<EstadoTrabajador | typeof TODAS>(estadoInicial || TODAS);
  const [filas, setFilas] = useState(pagina.filas);
  const [total, setTotal] = useState(pagina.total);
  const [buscando, setBuscando] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const primera = useRef(true);
  const pedido = useRef(0);

  const filtros = () => ({ q: busqueda, empresa: empresa === TODAS ? null : empresa, estado: estado === TODAS ? null : estado });

  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    const n = ++pedido.current;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const r = await buscarPacientesLista({ ...filtros(), desde: 0 });
        if (n !== pedido.current) return; // ya hay una búsqueda más nueva
        setFilas(r.filas);
        setTotal(r.total);
        setErrorBusqueda(null);
      } catch {
        if (n === pedido.current) setErrorBusqueda("No se pudo buscar. Revisa la conexión y vuelve a intentar.");
      } finally {
        if (n === pedido.current) setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, empresa, estado]);

  async function mostrarMas() {
    setCargandoMas(true);
    try {
      const r = await buscarPacientesLista({ ...filtros(), desde: filas.length });
      setFilas((f) => [...f, ...r.filas.filter((x) => !f.some((y) => y.id === x.id))]);
      setTotal(r.total);
    } catch {
      setErrorBusqueda("No se pudo cargar más. Revisa la conexión y vuelve a intentar.");
    } finally {
      setCargandoMas(false);
    }
  }

  const sinFiltros = !busqueda && empresa === TODAS && estado === TODAS;
  const quedan = Math.max(0, total - filas.length);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Pacientes</h1>
          <p className="text-muted-foreground" aria-live="polite">
            {sinFiltros ? `${total} trabajadores en el expediente` : `${total} coinciden con la búsqueda`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {depurar}
          {importar && (
            <Button variant="outline" asChild>
              <Link href="/pacientes/importar"><FileSpreadsheet /> Importar Excel</Link>
            </Button>
          )}
          {nuevo}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Cédula, nombre o nº de historia"
            aria-label="Buscar paciente"
            className="h-11 w-full rounded-lg border bg-card pl-9 pr-9 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {buscando && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Buscando" />}
        </label>
        <Select value={empresa} onValueChange={setEmpresa}>
          <SelectTrigger aria-label="Empresa" className="h-11! w-full bg-card sm:w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas las empresas</SelectItem>
            {empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={estado} onValueChange={(v) => setEstado(v as EstadoTrabajador | typeof TODAS)}>
          <SelectTrigger aria-label="Estado" className="h-11! w-full bg-card sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todos los estados</SelectItem>
            {Object.entries(ETIQUETA_ESTADO).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden py-0" aria-busy={buscando}>
        {errorBusqueda && <p className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">{errorBusqueda}</p>}
        {filas.length === 0 ? (
          <div className="grid place-items-center gap-2 py-16 text-center text-muted-foreground">
            <Users className="size-8" />
            {sinFiltros && total === 0
              ? "Aún no hay pacientes. Regístralos uno a uno o importa la nómina desde Excel."
              : "Ningún trabajador coincide con la búsqueda."}
          </div>
        ) : (
          <>
          {errorAtender && <p className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive sm:hidden">{errorAtender}</p>}
          <ul className={cn("divide-y sm:hidden", buscando && "opacity-60")}>
            {filas.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <Link href={`/pacientes/${t.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar className="size-10">
                    <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">{iniciales(t)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium leading-tight">{t.nombres} {t.apellidos}</div>
                    <div className="truncate text-xs text-muted-foreground"><span className="font-mono">{t.cedula}</span> · {t.empresa}</div>
                    <div className="mt-1">
                      {t.aptitud ? (
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", ESTILO_APTITUD[t.aptitud])}>{ETIQUETA_APTITUD[t.aptitud]}</span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">Sin evaluar</span>
                      )}
                    </div>
                  </div>
                </Link>
                {clinico ? (
                  <Button size="sm" variant="outline" className="shrink-0 text-primary" disabled={abriendo} onClick={() => atender(t.id)} aria-label={`Atender a ${t.nombres} ${t.apellidos}`}>
                    {abriendo && atendiendo === t.id ? <Loader2 className="animate-spin" /> : <Stethoscope />} Atender
                  </Button>
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                )}
              </li>
            ))}
          </ul>
          <Table className={cn("hidden sm:table", buscando && "opacity-60")}>
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
              {filas.map((t) => (
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
                  <TableCell className="hidden tabular-nums lg:table-cell">{edad(t.fechaNacimiento) ?? "—"}</TableCell>
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
          </>
        )}
        {quedan > 0 && (
          <div className="flex flex-col gap-3 border-t px-5 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>Mostrando {filas.length} de {total}. Escribe en el buscador para encontrar a alguien al instante.</span>
            <Button variant="outline" size="sm" disabled={cargandoMas} onClick={mostrarMas}>
              {cargandoMas ? <Loader2 className="animate-spin" /> : null} Mostrar {Math.min(PAGINA, quedan)} más
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
