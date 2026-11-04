import {
  BarChart3,
  BookOpen,
  Building2,
  Settings,
  Receipt,
  Send,
  Stethoscope,
  Users,
  type LucideIcon,
} from "lucide-react";
import { REPORTES } from "@/lib/reportes-catalogo";
import { SECCIONES, SECCIONES_EMPRESA, type Seccion } from "@/lib/navegacion";

// Pantallas, pestañas y configuraciones que el buscador (Ctrl+K) encuentra por su nombre o por palabras
// comunes: «precios de servicios», «tarifas», «membrete», «vademécum»… No solo las secciones del menú.
// Al crear una pantalla o pestaña nueva, agrégala aquí con las palabras que usaría el médico para buscarla.

export type Atajo = {
  href: string;
  titulo: string;
  donde: string; // ruta visible: «Facturación › Servicios y precios»
  icono: LucideIcon;
  palabras?: string; // sinónimos y términos coloquiales, separados por espacio
  clinico?: boolean; // solo personal de salud
  roles?: string[]; // solo estos roles (si no se indica, todos los del servicio médico)
};

const GERENCIA = ["administrador", "gerente_medico"];

const FACTURACION: Atajo[] = [
  { href: "/facturacion?vista=servicios", titulo: "Servicios y precios", donde: "Facturación", icono: Receipt, palabras: "precio tarifa costo arancel baremo valor monto catalogo lista de precios cobrar" },
  { href: "/facturacion?vista=cobros", titulo: "Notas de cobro", donde: "Facturación", icono: Receipt, palabras: "factura facturar cobro recibo" },
  { href: "/facturacion/nuevo", titulo: "Nueva nota de cobro", donde: "Facturación", icono: Receipt, palabras: "factura facturar cobrar crear emitir" },
  { href: "/facturacion?vista=cuentas", titulo: "Cuentas por cobrar", donde: "Facturación", icono: Receipt, palabras: "deuda moroso pendiente pago saldo vencida" },
  { href: "/facturacion?vista=presupuestos", titulo: "Presupuestos", donde: "Facturación", icono: Receipt, palabras: "cotizacion oferta propuesta" },
  { href: "/facturacion?vista=atendidos", titulo: "Pacientes atendidos por facturar", donde: "Facturación", icono: Receipt, palabras: "facturar atendidos" },
  { href: "/facturacion", titulo: "Tasa BCV", donde: "Facturación", icono: Receipt, palabras: "dolar cambio bolivares divisa tasa del dia" },
];

const CONFIGURACION: Atajo[] = [
  { href: "/configuracion/organizacion", titulo: "Organización y documentos", donde: "Configuración", icono: Settings, palabras: "membrete rif direccion telefono logo encabezado datos del servicio titulos notas palabra aptitud" },
  { href: "/configuracion/perfil", titulo: "Mi perfil profesional", donde: "Configuración", icono: Settings, palabras: "firma sello cedula mpps colegio medicos inpsasel avisos celular notificaciones" },
  { href: "/configuracion/ingreso", titulo: "Ingreso y seguridad", donde: "Configuración", icono: Settings, palabras: "huella windows hello dos pasos codigo clave contraseña pin" },
  { href: "/configuracion/usuarios", titulo: "Usuarios y roles", donde: "Configuración", icono: Settings, palabras: "permisos acceso enfermera secretaria recepcion invitar rrhh" },
  { href: "/configuracion/listas", titulo: "Listas configurables", donde: "Configuración", icono: Settings, palabras: "maestros catalogos opciones valores" },
  { href: "/configuracion/clinica", titulo: "Ajustes clínicos", donde: "Configuración", icono: Settings, palabras: "precarga plantilla motivo perfil paraclinicos empresa recomendaciones examenes", clinico: true },
  { href: "/configuracion/plantillas", titulo: "Plantillas de examen", donde: "Configuración", icono: Settings, palabras: "examen fisico normal texto predeterminado" },
  { href: "/configuracion/auditoria", titulo: "Auditoría", donde: "Configuración", icono: Settings, palabras: "quien abrio historia cambios accesos bitacora registro" },
  { href: "/configuracion/respaldo", titulo: "Respaldos", donde: "Configuración", icono: Settings, palabras: "respaldar copia seguridad google drive restaurar backup" },
  { href: "/configuracion/equipos", titulo: "Equipos", donde: "Configuración", icono: Settings, palabras: "pc computadora escritorio sincronia revocar instalado" },
  { href: "/configuracion/cargos", titulo: "Unir cargos", donde: "Configuración", icono: Settings, palabras: "puestos duplicados juntar", roles: ["administrador"] },
  { href: "/configuracion/escaneados-same", titulo: "Escaneados del SAME", donde: "Configuración", icono: Settings, palabras: "subir pdf escaneos", clinico: true, roles: GERENCIA },
];

// Listas configurables más buscadas (cada una abre su editor)
const LISTAS: [string, string, string][] = [
  ["motivo_consulta", "Motivos de consulta", "pre empleo preempleo egreso periodico reintegro"],
  ["diagnostico", "Diagnósticos", "cie10 cie enfermedades"],
  ["antecedente_medico", "Antecedentes médicos", "personales familiares"],
  ["habito", "Hábitos", "tabaco alcohol cafe"],
  ["examen_funcional", "Exámenes funcionales", "espirometria audiometria visiometria"],
  ["examen_fisico", "Examen físico", "sistemas"],
  ["paraclinico", "Paraclínicos", "laboratorio examenes hematologia orina heces rangos"],
  ["grupo_paraclinicos", "Perfiles de paraclínicos", "perfil laboratorio empresa"],
  ["especialidad", "Especialidades", "referencia interconsulta"],
  ["clasificacion_aptitud", "Clasificación de aptitud", "apto no apto"],
  ["recomendacion_aptitud", "Recomendaciones de aptitud", ""],
  ["limitacion_ocupacional", "Limitaciones ocupacionales", "restricciones"],
  ["causa_reposo", "Causas de reposo", "permiso"],
  ["recomendacion_empresa", "Recomendaciones a la empresa", ""],
  ["recomendacion_paciente", "Recomendaciones al paciente", "trabajador"],
  ["conclusion_consulta", "Conclusiones de consulta", ""],
  ["medicina", "Medicinas", "medicamentos vademecum farmacos recipe tratamiento"],
  ["tipo_paciente", "Tipos de paciente", ""],
  ["turno", "Turnos", "horario"],
  ["tipo_riesgo", "Tipos de riesgo", "riesgos puesto"],
  ["parte_cuerpo", "Partes del cuerpo (accidentes)", "lesion covenin"],
  ["forma_accidente", "Formas de accidente", "covenin"],
];

const OTROS: Atajo[] = [
  { href: "/pacientes/importar", titulo: "Importar trabajadores desde Excel", donde: "Pacientes", icono: Users, palabras: "nomina cargar excel hoja lista masivo" },
  { href: "/atencion/citas-lote", titulo: "Citas por lote", donde: "Atención médica", icono: Stethoscope, palabras: "agendar varias citas excel jornada", clinico: true },
  { href: "/atencion", titulo: "Agenda y cola de atención", donde: "Atención médica", icono: Stethoscope, palabras: "cita citas agenda espera cola siguiente paciente", clinico: true },
  { href: "/envios/por-enviar", titulo: "Constancias por enviar", donde: "Envíos", icono: Send, palabras: "pendientes correo whatsapp", clinico: true },
  { href: "/envios/bitacora", titulo: "Bitácora de envíos", donde: "Envíos", icono: Send, palabras: "enviados correos fallidos historial", clinico: true },
  { href: "/envios/plantillas", titulo: "Plantillas de correo", donde: "Envíos", icono: Send, palabras: "texto mensaje correo whatsapp", clinico: true },
  { href: "/empresas", titulo: "Sedes, dependencias y puestos", donde: "Empresas", icono: Building2, palabras: "cargos departamentos riesgos por puesto contactos rrhh" },
  { href: "/ayuda", titulo: "Lo nuevo y manual de uso", donde: "Manual de uso", icono: BookOpen, palabras: "ayuda como se usa instrucciones novedades" },
];

export const ATAJOS: Atajo[] = [
  ...FACTURACION,
  ...CONFIGURACION,
  ...LISTAS.map(([codigo, titulo, palabras]): Atajo => ({ href: `/configuracion/listas?l=${codigo}`, titulo, donde: "Configuración › Listas", icono: Settings, palabras })),
  ...REPORTES.map((r): Atajo => ({ href: `/reportes/${r.clave}`, titulo: r.titulo, donde: `Reportes › ${r.grupo}`, icono: BarChart3, palabras: `${r.corto} ${r.descripcion} reporte informe estadistica` })),
  ...OTROS,
];

// ── Búsqueda ─────────────────────────────────────────────────────────────

const VACIAS = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "o", "en", "a", "al", "para", "por", "un", "una", "mi", "mis", "se", "donde", "que", "como", "con", "sus", "su", "lo"]);

export const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
// Raíz simple: «precios» ≈ «precio», «servicios» ≈ «servicio», «configuraciones» ≈ «configuracion»
const raiz = (p: string) => (p.length > 4 ? p.replace(/(es|s)$/, "") : p);
const palabrasDe = (s: string) => normalizar(s).split(/[^a-z0-9ñ]+/).filter(Boolean);

export type Destino = Pick<Atajo, "href" | "titulo" | "icono"> & { descripcion: string };

type Opciones = { portal?: boolean; clinico?: boolean; rol?: string | null };

const visible = (a: { clinico?: boolean; roles?: string[] }, o: Opciones) => (o.clinico || !a.clinico) && (!a.roles || a.roles.includes(o.rol ?? ""));

// Cada palabra buscada debe estar (como inicio de palabra) en el título, la ruta o los sinónimos.
// Puntúa más lo que coincide en el título. Sin texto: las secciones del menú.
export function buscarSecciones(texto: string, o: Opciones = {}, limite = 8): Destino[] {
  const menu: Seccion[] = (o.portal ? SECCIONES_EMPRESA : SECCIONES).filter((s) => visible(s, o));
  const consulta = palabrasDe(texto).filter((p) => !VACIAS.has(p)).map(raiz);
  if (consulta.length === 0) return menu.map((s) => ({ href: s.href, titulo: s.titulo, icono: s.icono, descripcion: s.descripcion }));

  const candidatos: (Destino & { pTitulo: string[]; pResto: string[] })[] = [
    ...menu.map((s) => ({ href: s.href, titulo: s.titulo, icono: s.icono, descripcion: s.descripcion, pTitulo: palabrasDe(s.titulo), pResto: palabrasDe(s.descripcion) })),
    ...(o.portal ? [] : ATAJOS.filter((a) => visible(a, o))).map((a) => ({
      href: a.href,
      titulo: a.titulo,
      icono: a.icono,
      descripcion: a.donde,
      pTitulo: palabrasDe(a.titulo),
      pResto: palabrasDe(`${a.donde} ${a.palabras ?? ""}`),
    })),
  ];

  const empieza = (lista: string[], q: string) => lista.some((p) => p.startsWith(q) || raiz(p) === q);
  const puntuar = (c: (typeof candidatos)[number]) => {
    let puntos = 0, faltan = 0;
    for (const q of consulta) {
      if (empieza(c.pTitulo, q)) puntos += 3;
      else if (empieza(c.pResto, q)) puntos += 1;
      else faltan++;
    }
    return { c, puntos, faltan };
  };
  const puntuados = candidatos.map(puntuar);
  // Primero, las que tienen todas las palabras. Si ninguna, se tolera una frase («dónde coloco los precios»):
  // basta con la mitad de las palabras, siempre que coincida alguna de 4 letras o más.
  let hallados = puntuados.filter((x) => x.faltan === 0);
  if (hallados.length === 0 && consulta.length > 1)
    hallados = puntuados.filter((x) => x.puntos > 0 && x.faltan * 2 <= consulta.length && consulta.some((q) => q.length >= 4 && (empieza(x.c.pTitulo, q) || empieza(x.c.pResto, q))));
  const vistos = new Set<string>();
  return hallados
    .sort((a, b) => b.puntos - a.puntos)
    .filter(({ c }) => !vistos.has(c.href + c.titulo) && vistos.add(c.href + c.titulo))
    .slice(0, limite)
    .map(({ c }) => ({ href: c.href, titulo: c.titulo, icono: c.icono, descripcion: c.descripcion }));
}
