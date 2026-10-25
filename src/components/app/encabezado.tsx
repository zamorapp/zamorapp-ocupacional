"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Building2, ChevronDown, LogOut, Menu, Search, UserRound } from "lucide-react";
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
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BarraLateral } from "./barra-lateral";
import { Notificaciones } from "./notificaciones";
import { elegirEmpresa, salir } from "./acciones";

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
  const [, iniciar] = useTransition();
  const actual = empresas.find((e) => e.id === empresaActiva)?.nombre ?? "Todas las empresas";
  const cambiar = (id: string | null) => iniciar(() => elegirEmpresa(id));

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
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
          <Button variant="outline" className="max-w-56 justify-start gap-2">
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

      <label className="relative ml-auto hidden w-full max-w-sm md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Buscar por cédula, nombre o cargo…"
          onKeyDown={(e) => {
            if (e.key === "Enter") window.location.href = `/pacientes?q=${encodeURIComponent(e.currentTarget.value)}`;
          }}
          className="h-10 w-full rounded-lg border bg-card pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </label>

      <Notificaciones />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
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
          <DropdownMenuItem asChild>
            <Link href="/configuracion"><UserRound /> Mi perfil y firma</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => salir()}>
            <LogOut /> Salir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
