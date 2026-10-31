import { headers } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { AvisoActualizar } from "@/components/app/aviso-actualizar";
import { AvisoConflictos } from "@/components/app/aviso-conflictos";
import { AvisoHello } from "@/components/app/aviso-hello";
import { BarraInferior } from "@/components/app/barra-inferior";
import { BarraLateral } from "@/components/app/barra-lateral";
import { BuscadorGlobal } from "@/components/app/buscador-global";
import { Encabezado } from "@/components/app/encabezado";
import { empresaActivaId } from "@/lib/empresa-activa";
import { listarEmpresas } from "@/lib/empresas";
import { RUTAS_EMPRESA } from "@/lib/navegacion";
import { ETIQUETA_ROL, obtenerSesion } from "@/lib/sesion";
import { esRolEmpresa } from "@/lib/sesion-roles";
import { resumenTiempos } from "@/lib/tiempos";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const [sesion, empresas, activa, cabeceras] = await Promise.all([obtenerSesion(), listarEmpresas(true), empresaActivaId(), headers()]);

  // Los usuarios de empresas cliente (RR. HH., supervisor, delegado, auditor, trabajador) solo ven el portal,
  // sus trabajadores y accidentes; cualquier otra ruta los devuelve al portal
  const portal = esRolEmpresa(sesion.rol);
  const ruta = cabeceras.get("x-ruta") ?? "";
  // Al terminar de responder, una línea «[tiempo]» por pantalla en los registros del servidor (D1 de la auditoría)
  after(() => console.log(resumenTiempos(ruta || "/")));
  if (portal && ruta && !RUTAS_EMPRESA.some((r) => ruta === r || ruta.startsWith(r + "/"))) redirect("/portal");

  const usuario = {
    nombre: sesion.nombre,
    rol: sesion.rol ? ETIQUETA_ROL[sesion.rol] : "Sin rol asignado",
    demo: sesion.demo,
  };
  // Empresas inactivas: fuera del selector, salvo la que se abrió a propósito desde Empresas › Ver inactivas
  // (para consultar sus reportes o trabajadores); el portal de RR. HH. ve siempre las suyas
  const opciones = empresas
    .filter((e) => e.activa || portal || e.id === activa)
    .map((e) => ({ id: e.id, nombre: e.activa ? e.razonSocial : `${e.razonSocial} (inactiva)`, trabajadores: e.trabajadores }));
  // El registro rápido del buscador solo crea trabajadores en empresas activas
  const paraRegistrar = opciones.filter((o) => empresas.find((e) => e.id === o.id)?.activa);

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r bg-sidebar lg:block">
        <BarraLateral organizacion={sesion.organizacion} portal={portal} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Encabezado usuario={usuario} empresas={opciones} empresaActiva={activa} organizacion={sesion.organizacion} portal={portal} />
        <AvisoActualizar />
        {!portal && <AvisoHello />}
        {!portal && <AvisoConflictos />}
        <main className="flex-1 p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8">{children}</main>
      </div>
      <BarraInferior portal={portal} />
      <BuscadorGlobal portal={portal} empresas={paraRegistrar} empresaActiva={paraRegistrar.some((o) => o.id === activa) ? activa : null} clinico={!portal && sesion.clinico} />
    </div>
  );
}
