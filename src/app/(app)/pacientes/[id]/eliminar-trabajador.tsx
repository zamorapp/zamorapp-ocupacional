"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EliminarPapelera } from "@/components/app/eliminar-papelera";
import { rutaConDeshacer } from "@/components/app/franja-deshacer";

/** «Eliminar» de la ficha (solo el administrador): trabajador repetido o registrado por error. Va a la Papelera. */
export function EliminarTrabajador({ trabajadorId, nombre }: { trabajadorId: string; nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button variant="outline" className="flex-1 text-destructive hover:text-destructive xl:flex-none" onClick={() => setAbierto(true)}
        title="Para un trabajador repetido o registrado por error. Queda en la Papelera, con Deshacer.">
        <Trash2 /> Eliminar
      </Button>
      <EliminarPapelera tipo="trabajador" id={trabajadorId} nombre={nombre} abierto={abierto} onAbierto={setAbierto}
        onEliminado={(papeleraId, mensaje) => router.push(rutaConDeshacer("/pacientes", papeleraId, mensaje, `/pacientes/${trabajadorId}`))} />
    </>
  );
}
