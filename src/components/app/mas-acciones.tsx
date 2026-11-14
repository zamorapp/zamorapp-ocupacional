"use client";

import type { ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// En el celular, las acciones secundarias de una pantalla van aquí para que la principal quede sola y a la vista.
// Los hijos son <DropdownMenuItem asChild><Link …/></DropdownMenuItem>. En PC (sm y más) no se muestra: los
// botones de siempre siguen a la vista.
export function MasAcciones({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn("min-h-11 sm:hidden", className)}><Ellipsis /> Más acciones</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
