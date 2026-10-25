import { BarraLateral } from "@/components/app/barra-lateral";
import { Encabezado } from "@/components/app/encabezado";
import { empresaActivaId } from "@/lib/empresa-activa";
import { listarEmpresas } from "@/lib/empresas";
import { ETIQUETA_ROL, obtenerSesion } from "@/lib/sesion";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const [sesion, empresas, activa] = await Promise.all([obtenerSesion(), listarEmpresas(), empresaActivaId()]);
  const usuario = {
    nombre: sesion.nombre,
    rol: sesion.rol ? ETIQUETA_ROL[sesion.rol] : "Sin rol asignado",
    demo: sesion.demo,
  };
  const opciones = empresas.map((e) => ({ id: e.id, nombre: e.razonSocial, trabajadores: e.trabajadores }));

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r bg-card lg:block">
        <BarraLateral organizacion={sesion.organizacion} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Encabezado usuario={usuario} empresas={opciones} empresaActiva={activa} organizacion={sesion.organizacion} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
