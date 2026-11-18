import Link from "next/link";
import { Building2, CalendarClock, Check, FileCheck2, ShieldCheck, Smartphone, Stethoscope, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormularioLogin } from "@/app/login/formulario-login";
import { APP_NOMBRE } from "@/lib/config";
import { esRolEmpresa, nombreRolInvitado, type Rol } from "@/lib/sesion-roles";
import { Aceptar, SalirParaRegistrarse } from "./aceptar";
import { FichaBoton, MarcoEnlace, TarjetaEnlace } from "@/components/enlace/marco-enlace";

// Trato (regla de Cesar): «usted» para la gente de la empresa cliente; «tú» para su equipo (enfermería, médico, recepción…)
const PASOS = { usted: ["Cree su cuenta", "Confirme su correo", "Entre"], tu: ["Crea tu cuenta", "Confirma tu correo", "Entra"] };

// Guía de 3 pasos: RR. HH. siempre sabe en cuál va. Sin sesión va en el 1 (el 2 lo indica el formulario al registrarse);
// al volver del correo ya tiene sesión y va en el 3.
function Pasos({ actual, u }: { actual: number; u: boolean }) {
  return (
    <ol className="grid grid-cols-3 gap-2 text-center text-xs">
      {PASOS[u ? "usted" : "tu"].map((t, i) => {
        const n = i + 1;
        return (
          <li key={t} className="space-y-1">
            <span className={`mx-auto grid size-8 place-items-center rounded-full text-sm font-semibold ${n < actual ? "bg-ok/15 text-ok-texto" : n === actual ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {n < actual ? <Check className="size-4" /> : n}
            </span>
            <span className={n === actual ? "block font-medium" : "block text-muted-foreground"}>{t}</span>
          </li>
        );
      })}
    </ol>
  );
}

// Lo que RR. HH. puede hacer en el portal (nada clínico); los demás roles ven su rol y su empresa (migración 966)
const BENEFICIOS: [typeof CalendarClock, string, string][] = [
  [CalendarClock, "Pida evaluaciones", "Con fecha y hora, también para trabajadores nuevos."],
  [FileCheck2, "Reciba las constancias", "Las de aptitud, apenas el médico las firma."],
  [ShieldCheck, "Solo ve su empresa", "La historia clínica queda con el personal de salud."],
];

const AVISO: Record<"usted" | "tu", Record<string, string>> = {
  usted: {
    usada: "Esta invitación ya se usó. Si es usted, ingrese normalmente; si no, pida un enlace nuevo al servicio médico.",
    vencida: "Esta invitación venció. Pida un enlace nuevo al servicio médico.",
    anulada: "Esta invitación fue anulada. Pida un enlace nuevo al servicio médico.",
  },
  tu: {
    usada: "Esta invitación ya se usó. Si eres tú, ingresa normalmente; si no, pide un enlace nuevo al servicio médico.",
    vencida: "Esta invitación venció. Pide un enlace nuevo al servicio médico.",
    anulada: "Esta invitación fue anulada. Pide un enlace nuevo al servicio médico.",
  },
};

export type DatosInvitacion = { empresa: string | null; organizacion: string; nombre: string | null; estado: string; invita: string | null; otro_rol: boolean; rol: Rol | null };

// Lo que ve quien abre el enlace (aparte de la consulta, para probar la pantalla con datos falsos)
export function VistaInvitacion({ token, inv, correo, conSesion }: { token: string; inv: DatosInvitacion | undefined; correo: string | null; conSesion: boolean }) {
  const rol: Rol = inv?.rol ?? "gerente_empresa";
  const esRrhh = rol === "gerente_empresa";
  const deEmpresa = esRolEmpresa(rol);
  const nombreRol = esRrhh ? "RR. HH." : nombreRolInvitado(rol);
  const u = deEmpresa; // «usted» solo para la empresa cliente
  const t = (usted: string, tu: string) => (u ? usted : tu);
  const beneficios: [typeof CalendarClock, string, string][] = esRrhh ? BENEFICIOS : [
    [UserRound, t(`Su rol: ${nombreRol}`, `Tu rol: ${nombreRol}`), t("Lo eligió el servicio médico; solo verá lo que le toca a ese rol.", "Lo eligió el servicio médico; solo verás lo que le toca a ese rol.")],
    [Building2, inv?.empresa ? `Empresa: ${inv.empresa}` : "Todas las empresas del servicio", deEmpresa || rol === "enfermeria" ? "Solo los trabajadores de esa empresa." : "Las que atiende el servicio médico."],
    [Smartphone, "Desde la web o el celular", t("Entre con su correo y su contraseña.", "Entra con tu correo y tu contraseña.")],
  ];
  return (
    <MarcoEnlace servicio={inv?.organizacion ?? APP_NOMBRE} subtitulo={deEmpresa ? "Portal de empresas" : "Equipo de salud"} ancho="max-w-md">
      <TarjetaEnlace className="space-y-6 sm:p-8">
        {!inv ? (
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Enlace no válido</h1>
            <p className="text-sm text-muted-foreground">Revise que lo copió completo o pida uno nuevo al servicio médico.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {/* «Le invita el Dr. …» sale de Configuración › Organización; sin eso, el nombre del servicio */}
              <p className="text-xs font-semibold uppercase tracking-[.08em] text-primary">{esRrhh ? "Portal de su empresa" : `Invitación como ${nombreRol}`}</p>
              <h1 className="flex items-start gap-2 text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                {deEmpresa ? <Building2 className="mt-1 size-6 shrink-0 text-primary" /> : <Stethoscope className="mt-1 size-6 shrink-0 text-primary" />} {inv.empresa ?? inv.organizacion}
              </h1>
              <p className="text-sm text-muted-foreground">
                {`${inv.nombre ? `${inv.nombre.split(" ")[0]}, ` : ""}${t(inv.nombre ? "le" : "Le", inv.nombre ? "te" : "Te")} invita ${inv.invita ?? inv.organizacion}.`}
              </p>
            </div>
            <ul className="space-y-2 text-sm">
              {beneficios.map(([Icono, titulo, detalle], i) => (
                <li key={titulo} className="rounded-xl border bg-background px-3 py-2.5">
                  <FichaBoton icono={Icono} titulo={titulo} detalle={detalle} indice={i} />
                </li>
              ))}
            </ul>
            {inv.estado !== "vigente" && !conSesion ? (
              <p className="rounded-md bg-aviso/15 px-3 py-2 text-sm text-aviso-texto">{AVISO[u ? "usted" : "tu"][inv.estado]}</p>
            ) : conSesion && inv.otro_rol ? (
              // Sesión abierta con una cuenta del servicio (p. ej. el médico probando en su teléfono): nunca se convierte
              // en RR. HH.; se ofrece salir y crear la cuenta nueva aquí mismo
              <div className="space-y-3 border-t pt-5">
                <p className="rounded-md bg-aviso/15 px-3 py-2 text-sm text-aviso-texto">
                  Este teléfono tiene abierta la cuenta {correo ? <strong className="[overflow-wrap:anywhere]">{correo}</strong> : "de otra persona"}, que ya tiene otro rol en este servicio médico. La cuenta de {nombreRol} debe ser otra, con {t("su", "tu")} propio correo.
                </p>
                <SalirParaRegistrarse token={token} rol={nombreRol} />
                <Button variant="ghost" className="w-full" asChild><Link href="/panel">Volver a zamorApp</Link></Button>
              </div>
            ) : conSesion ? (
              <div className="space-y-4 border-t pt-5">
                <Pasos actual={3} u={u} />
                <p className="text-sm">{t("Su cuenta está lista. Toque el botón para terminar.", "Tu cuenta está lista. Toca el botón para terminar.")}</p>
                <Aceptar token={token} texto={inv.estado === "vigente" ? (esRrhh ? "Aceptar y entrar al portal" : "Aceptar y entrar") : (deEmpresa ? "Entrar al portal" : "Entrar")} />
              </div>
            ) : (
              <div className="space-y-4 border-t pt-5">
                <Pasos actual={1} u={u} />
                <div className="rounded-md bg-primary/5 p-3 text-sm">
                  <p className="font-medium">{t("Paso 1: llene sus datos y toque «Crear cuenta».", "Paso 1: llena tus datos y toca «Crear cuenta».")}</p>
                  <p className="text-muted-foreground">{t("Use un correo que abra a diario. Después le llegará un correo para confirmar (paso 2). Si ya tiene cuenta, toque «Ingresar».", "Usa un correo que abras a diario. Después te llegará un correo para confirmar (paso 2). Si ya tienes cuenta, toca «Ingresar».")}</p>
                </div>
                <FormularioLogin modoDemo={false} siguiente={`/invitacion/${token}`} modoInicial="registro" nombreInicial={inv.nombre ?? undefined} trato={u ? "usted" : "tu"} />
              </div>
            )}
          </>
        )}
        {/* Con el formulario a la vista sobra: ya trae «¿Ya tiene cuenta? Ingresar» */}
        {!(inv && !conSesion && inv.estado === "vigente") && <p className="text-center text-xs text-muted-foreground"><Link href="/login" className="hover:underline">Ir al ingreso</Link></p>}
      </TarjetaEnlace>
    </MarcoEnlace>
  );
}
