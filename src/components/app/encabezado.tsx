"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Building2, ChevronDown, Fingerprint, LogOut, Menu, Search, ShieldCheck, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BarraLateral } from "./barra-lateral";
import { abrirBuscador } from "./buscador-global";
import { SelectorTema } from "./selector-tema";
import { InstalarApp } from "./instalar-app";
import { IndicadorSincronia } from "./indicador-sincronia";
import { Notificaciones } from "./notificaciones";
import { HuellaCuenta } from "./huella";
import { elegirEmpresa, salir } from "./acciones";

const ESCRITORIO = process.env.NEXT_PUBLIC_ESCRITORIO === "1";

type Props = {
  usuario: { nombre: string; rol: string; demo: boolean };
  empresas: { id: string; nombre: string; trabajadores: number }[];
  empresaActiva: string | null;
  organizacion: string;
  portal?: boolean;
};

function iniciales(nombre: string) {
  const p = nombre.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 2 ? p[2][0] : p[1]?.[0] ?? "")).toUpperCase();
}

export function Encabezado({ usuario, empresas, empresaActiva, organizacion, portal = false }: Props) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [huellaAbierta, setHuellaAbierta] = useState(false);
  const [, iniciar] = useTransition();
  const actual = empresas.find((e) => e.id === empresaActiva)?.nombre ?? "Todas las empresas";
  const cambiar = (id: string | null) => iniciar(() => elegirEmpresa(id));

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur sm:gap-3 sm:px-6">
      <Sheet open={menuAbierto} onOpenChange={setMenuAbierto}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menú">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Menú</SheetTitle>
          <BarraLateral organizacion={organizacion} portal={portal} alNavegar={() => setMenuAbierto(false)} />
        </SheetContent>
      </Sheet>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="min-w-0 max-w-56 flex-1 justify-start gap-2 sm:flex-none">
            <Building2 className="text-primary" />
            <span className="truncate">{actual}</span>
            <ChevronDown className="ml-auto opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Empresa activa</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => cambiar(null)}>Todas las empresas</DropdownMenuItem>
          {empresas.length > 0 && <DropdownMenuSeparator />}
          {empresas.map((e) => (
            <DropdownMenuItem key={e.id} onSelect={() => cambiar(e.id)}>
              <span className="truncate">{e.nombre}</span>
              <span className="ml-auto text-xs text-muted-foreground">{e.trabajadores}</span>
            </DropdownMenuItem>
          ))}
          {empresas.length === 0 && (
            <DropdownMenuItem asChild>
              <Link href="/empresas" className="text-primary">Registrar la primera empresa</Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        onClick={abrirBuscador}
        className="ml-auto hidden h-10 w-full max-w-sm items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground transition hover:border-primary/50 md:flex"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Buscar por cédula, nombre o sección…</span>
        <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[11px]">Ctrl K</kbd>
      </button>
      <Button variant="ghost" size="icon" className="ml-auto md:hidden" aria-label="Buscar" onClick={abrirBuscador}>
        <Search />
      </Button>

      <InstalarApp />
      <IndicadorSincronia />
      <Notificaciones />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button aria-label="Mi cuenta" className="flex shrink-0 items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            <Avatar className="size-9">
              <AvatarFallback className="bg-primary/10 font-medium text-primary">{iniciales(usuario.nombre)}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>
            <div className="truncate font-medium">{usuario.nombre}</div>
            <div className="text-xs font-normal text-muted-foreground">{usuario.rol}{usuario.demo && " · modo demo"}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="px-1 py-1">
            <SelectorTema />
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/configuracion/perfil"><UserRound /> Mi perfil y firma</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/configuracion/ingreso"><ShieldCheck /> Ingreso y seguridad</Link>
          </DropdownMenuItem>
          {!usuario.demo && (
            <DropdownMenuItem onSelect={() => setHuellaAbierta(true)}>
              <Fingerprint /> {ESCRITORIO ? "Entrar con Windows Hello" : "Entrar con huella"}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => salir()}>
            <LogOut /> Salir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={huellaAbierta} onOpenChange={setHuellaAbierta}>
        <DialogContent className="p-0 sm:max-w-md">
          <DialogTitle className="sr-only">{ESCRITORIO ? "Entrar con Windows Hello" : "Entrar con huella"}</DialogTitle>
          {huellaAbierta && <HuellaCuenta />}
        </DialogContent>
      </Dialog>
    </header>
  );
}
