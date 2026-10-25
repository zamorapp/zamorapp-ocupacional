"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, Building2, ChevronDown, LogOut, Menu, Search, UserRound } from "lucide-react";
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
import { EMPRESAS_DEMO } from "@/lib/demo";
import { BarraLateral } from "./barra-lateral";
import { salir } from "./acciones";

export function Encabezado() {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [empresa, setEmpresa] = useState("Todas las empresas");

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
          <BarraLateral alNavegar={() => setMenuAbierto(false)} />
        </SheetContent>
      </Sheet>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="max-w-56 justify-start gap-2">
            <Building2 className="text-primary" />
            <span className="truncate">{empresa}</span>
            <ChevronDown className="ml-auto opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Empresa activa</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setEmpresa("Todas las empresas")}>Todas las empresas</DropdownMenuItem>
          <DropdownMenuSeparator />
          {EMPRESAS_DEMO.map((e) => (
            <DropdownMenuItem key={e.rif} onSelect={() => setEmpresa(e.nombre)}>
              <span className="truncate">{e.nombre}</span>
              <span className="ml-auto text-xs text-muted-foreground">{e.trabajadores}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <label className="relative ml-auto hidden w-full max-w-sm md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Buscar por cédula, nombre o cargo…"
          className="h-10 w-full rounded-lg border bg-card pl-9 pr-14 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border bg-muted px-1.5 text-[11px] text-muted-foreground">Ctrl K</kbd>
      </label>

      <Button variant="ghost" size="icon" className="relative ml-auto md:ml-0" aria-label="Avisos">
        <Bell />
        <span className="absolute right-2 top-2 size-2 rounded-full bg-alerta" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            <Avatar className="size-9">
              <AvatarFallback className="bg-primary/10 font-medium text-primary">CE</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="font-medium">Cesar Enrique</div>
            <div className="text-xs font-normal text-muted-foreground">Gerente médico</div>
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
