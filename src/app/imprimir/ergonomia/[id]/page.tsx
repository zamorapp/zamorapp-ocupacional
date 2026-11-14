import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { firmaDeDocumento, type AjustesDocumentos } from "@/lib/documentos";
import { GraficaDeb } from "@/components/ergonomia/grafica-deb";
import { DEPARTAMENTOS, metodoDe, NOMBRE_METODO, ordenarHallazgos, prioridad, SIN_LADO, vistaInforme, type Departamento, type Hallazgo } from "@/lib/ergonomia";
import { obtenerEvaluacion, obtenerEvaluacionEmpresa } from "@/lib/ergonomia-datos";
import { ahora } from "@/lib/fecha";
import { ESCALA_P, ESCALA_S } from "@/lib/puestos-tipos";
import { puedePortal } from "@/lib/permisos-portal";
import { obtenerSesion } from "@/lib/sesion";
import { esRolEmpresa } from "@/lib/sesion-roles";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraImpresion } from "../../barra";
import { Portada } from "../../vigilancia/portada";
import { firmantesAnteriores } from "@/lib/reportes";
import { hoyCaracas } from "@/lib/fecha";
import type { Firmantes } from "@/lib/firmantes";
import { Bloque, CasillaSello, fechaCorta, Ficha, Firmas, folio, Hoja, Membrete, Pie } from "../../componentes";

export const metadata: Metadata = { title: "Evaluación ergonómica" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Colores de papel por nivel (también legibles en blanco y negro por el texto)
const NIVEL: Record<string, string> = {
  Bajo: "border border-[#1d7a46] bg-[#e7f4ec] font-bold text-[#1d7a46]",
  Medio: "border border-[#7a5300] bg-[#fdf4dc] font-bold text-[#7a5300]",
  Alto: "border border-[#b42318] bg-[#fdecea] font-bold text-[#b42318]",
  Crítico: "border border-[#b42318] bg-[#b42318] font-bold text-white",
};
const URGENCIA = ["border border-[#1d7a46] bg-[#e7f4ec] text-[#1d7a46]", "border border-[#1d7a46] bg-[#e7f4ec] text-[#1d7a46]", "border border-[#7a5300] bg-[#fdf4dc] text-[#7a5300]", "border border-[#b42318] bg-[#fdecea] text-[#b42318]", "border border-[#b42318] bg-[#b42318] text-white"];

// Qué recibe cada departamento además de sus medidas
const ENFOQUE: Record<Departamento, string> = {
  ingenieria: "Medidas de diseño del puesto, equipos y herramientas. Son las más eficaces: eliminan o reducen el riesgo en su origen.",
  operaciones: "Medidas de organización del trabajo: métodos, ritmo, pausas y rotación entre tareas.",
  rrhh: "Medidas de formación, rotación del personal, jornada y reubicación. No incluye datos de salud de ningún trabajador.",
  sst: "Vigilancia de la salud de los expuestos, notificación de riesgos y seguimiento de todas las medidas.",
};

export default async function ImprimirErgonomia({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ para?: string }> }) {
  const [{ id }, { para }] = await Promise.all([params, searchParams]);
  const sesion = await obtenerSesion();
  const ev = esRolEmpresa(sesion.rol) ? await obtenerEvaluacionEmpresa(id) : await obtenerEvaluacion(id);
  if (!ev || (!sesion.orgId && !sesion.demo)) notFound();
  // RR. HH. sin el permiso «Descargar documentos» no abre informes (Usuarios y roles)
  if (!puedePortal(sesion, "descargas")) notFound();
  const { depto, conMetodo, conFotos } = vistaInforme(sesion.rol, para);

  const fotosVisibles = conFotos ? ev.fotos : [];
  const supabase = sesion.demo ? null! : await crearClienteServidor();
  const sinDatos = { data: null };
  const [{ data: org }, { data: emp }, firmas, { data: urls }, previos] = sesion.demo ? [sinDatos, sinDatos, null, { data: [] }, null] as const : await Promise.all([
    supabase.from("organizaciones").select("nombre, rif, direccion, telefono, correo, ajustes, logo").eq("id", sesion.orgId!).single(),
    supabase.from("empresas").select("razon_social, rif, logo, nil, actividad_economica, direccion, telefono").eq("id", ev.empresaId).single(),
    ev.evaluadoPor
      ? Promise.all([
          supabase.from("perfiles").select("nombre_completo, cedula, especialidad, mpps, registro_inpsasel, mostrar_firma, mostrar_sello").eq("id", ev.evaluadoPor).maybeSingle(),
          firmaDeDocumento(ev.evaluadoPor, "ergonomia", id).then((data) => ({ data })),
        ]).then(([{ data: p }, { data: img }]) => (p ? { ...p, ...((img as { firma_url: string | null; sello_url: string | null } | null) ?? { firma_url: null, sello_url: null }) } : null))
      : Promise.resolve(null),
    fotosVisibles.length ? supabase.storage.from("ergonomia").createSignedUrls(fotosVisibles.map((f) => f.ruta), 600) : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
    // Portada: responsables del último informe de vigilancia de la empresa (Reportes › Portada y firmantes); sin acceso, vacía
    firmantesAnteriores(ev.empresaId).catch(() => null),
  ]);
  const url = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]));

  const doc = {
    org: { ...(org ?? { nombre: sesion.organizacion, rif: null, direccion: null, telefono: null, correo: null, logo: null }), ajustes: (org?.ajustes ?? {}) as AjustesDocumentos },
    empresa: { razon_social: emp?.razon_social ?? ev.empresa, rif: emp?.rif ?? "", logo: (emp?.logo as string | null) ?? null },
    impreso: { por: sesion.nombre, el: new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date(ahora())) },
  };
  const metodo = metodoDe(ev.metodo);
  const r = metodo ? metodo.calcular(ev.datos) : null;
  const todos = ordenarHallazgos(ev.hallazgos);
  const hallazgos = depto ? todos.filter((h) => h.departamento === depto.clave) : todos;
  const max = todos.map((h) => prioridad(h)).find(Boolean) ?? null;
  const firma = firmas && firmas.mostrar_firma !== false ? firmas.firma_url : null;
  const sello = firmas && firmas.mostrar_sello !== false ? firmas.sello_url : null;
  const borrador = ev.estado !== "cerrada";
  // Portada: «Elaborado por» es quien evaluó el puesto; el resto, los responsables de la empresa
  const firmantes: Firmantes = {
    ...(previos ?? {}),
    medico: firmas?.nombre_completo
      ? { nombre: firmas.nombre_completo, cedula: firmas.cedula ?? "", cargo: firmas.especialidad || "Médico ocupacional", registro: firmas.registro_inpsasel || firmas.mpps || "" }
      : previos?.medico,
  };
  const ficha = emp ? { razonSocial: emp.razon_social, rif: emp.rif ?? "", nil: emp.nil ?? null, actividad: emp.actividad_economica ?? null, direccion: emp.direccion ?? null, telefono: emp.telefono ?? null } : { razonSocial: ev.empresa, rif: "", nil: null, actividad: null, direccion: null, telefono: null };
  const corto = NOMBRE_METODO[ev.metodo].split(" · ")[0];

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={`/ergonomia/${ev.id}`} titulo={`Ergonomía · ${ev.puesto}${depto ? ` · ${depto.nombre}` : ""}`} />
      <Portada
        logoEmpresa={doc.empresa.logo}
        orgLogo={doc.org.logo}
        empresa={ficha}
        firmantes={firmantes}
        fechaEmision={ev.cerradaEn ? hoyCaracas(ev.cerradaEn) : ev.fecha}
        titulo={ev.puesto}
        subtitulo={ev.tarea ? ev.tarea.slice(0, 80) : null}
        org={doc.org.nombre}
        textos={{
          serie: "Ergonomía · evaluación de puestos de trabajo",
          documento: depto ? `Informe ergonómico del puesto para ${depto.nombre}` : `Evaluación ergonómica del puesto · ${corto}`,
          // El nombre del estudio aplicado va en todas las versiones (Cesar, 05-nov); RR. HH. sigue sin puntajes, fotos ni detalle
          norma: `Estudio aplicado: ${NOMBRE_METODO[ev.metodo]} · LOPCYMAT art. 56 y 59 · NT-04-2023${borrador ? " · BORRADOR" : ""}`,
          control: "Evaluación ergonómica de puestos de trabajo",
          rango: `Evaluado el ${fechaCorta(ev.fecha)}`,
          elaborado: "Elaborado por · evaluador del puesto",
          sinDatos: "Sin datos: se toman del último informe de vigilancia de esta empresa (Reportes › Portada y firmantes)",
          sinElaborado: "Sin datos: es quien evaluó el puesto",
        }}
      />
      <Hoja className="relative print:block">
        {borrador && <div className="pointer-events-none absolute top-[40%] left-1/2 -translate-x-1/2 -rotate-12 text-[64px] font-extrabold tracking-widest text-[#b42318]/10">BORRADOR</div>}
        <Membrete d={doc} />
        <div className="mt-5 mb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-balance">{depto ? `Ergonomía del puesto · ${depto.nombre}` : "Evaluación ergonómica del puesto de trabajo"}</h1>
            <span className="mt-1.5 inline-block rounded bg-doc-suave px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-doc-acento">
              {NOMBRE_METODO[ev.metodo].split(" · ")[0]} · LOPCYMAT art. 56 · NT-04-2023
            </span>
          </div>
          <div className="shrink-0 text-right font-cifra text-[10.5px] leading-relaxed text-doc-tenue">
            <div>Folio <b className="font-medium text-[#15201e]">{folio(depto ? `EG-${depto.clave.slice(0, 3).toUpperCase()}` : "EG", ev.id)}</b></div>
            <div>Evaluado <b className="font-medium text-[#15201e]">{fechaCorta(ev.fecha)}</b></div>
          </div>
        </div>

        <Ficha
          celdas={[
            { k: "Puesto", v: ev.puesto, ancho: 2, destacada: true },
            { k: "Tarea observada", v: ev.tarea || "—", ancho: 2 },
            ...(SIN_LADO.includes(ev.metodo) ? [] : [{ k: "Lado evaluado", v: ev.lado ? ev.lado[0].toUpperCase() + ev.lado.slice(1) : "—" }]),
            { k: "Trabajadores expuestos", v: ev.trabajadoresObservados ?? "—", ancho: SIN_LADO.includes(ev.metodo) ? 2 as const : undefined },
            {
              k: metodo ? `Resultado ${metodo.corto}` : "Riesgo máximo", ancho: 2,
              v: r?.completo
                ? <>{r.texto ?? `${r.puntaje} de ${r.maximo}`} · {r.nivel}{r.subtexto && <span className="block text-[10px] font-normal">{r.subtexto}</span>}</>
                : max ? `${max.texto} (${max.n})` : "—",
            },
          ]}
        />

        {depto && <Bloque titulo="Para qué es este informe">{ENFOQUE[depto.clave]} Contiene {hallazgos.length} de los {todos.length} hallazgos de la evaluación; el informe completo lo tiene el servicio de seguridad y salud.</Bloque>}

        {ev.conclusion && <Bloque titulo="Conclusión">{ev.conclusion}</Bloque>}

        {r?.completo && metodo && conMetodo && (
          <Bloque titulo={`Resultado del método ${metodo.corto}`}>
            {r.factores ? (
              <div className="grid grid-cols-[1fr_1.2fr] gap-5">
                <GraficaDeb factores={r.factores} otros={r.otros} impreso />
                <div>
                  <div className="text-[13px] font-bold">{r.nivel} · {r.texto}</div>
                  <div>{r.accion}.</div>
                  {r.factores.filter((f) => f.zona === "rojo" || f.zona === "amarillo").map((f) => (
                    <div key={f.clave} className="mt-1 text-[9.5px]"><b>{f.nombre}:</b> {[...f.rojas, ...f.fallas].join("; ")}. Evaluación específica: {f.especifica}.</div>
                  ))}
                  <div className="mt-0.5 text-[9px] text-doc-tenue">Fuente: {metodo.fuente}</div>
                </div>
              </div>
            ) : (
            <div className="grid grid-cols-[auto_1fr] items-center gap-4">
              <div className={`rounded-lg px-4 py-2 text-center ${URGENCIA[r.urgencia]}`}>
                <div className="font-cifra text-[28px] font-semibold leading-none">{r.texto ? r.texto.replace(/^(IL|ICKL) | puntos$/g, "") : r.puntaje}</div>
                <div className="text-[8.5px] font-bold uppercase tracking-[.1em]">{!r.texto ? `de ${r.maximo}` : r.texto.endsWith(" puntos") ? "puntos" : `índice ${r.texto.split(" ")[0]}`}</div>
              </div>
              <div>
                <div className="text-[13px] font-bold">{r.nivel}</div>
                <div>{r.accion}.</div>
                {!depto && <div className="mt-1 text-[9.5px] text-doc-tenue">{r.parciales.map((p) => `${p.etiqueta} ${String(p.valor).replace(".", ",")}`).join(" · ")}</div>}
                <div className="mt-0.5 text-[9px] text-doc-tenue">Fuente: {metodo.fuente}</div>
              </div>
            </div>
            )}
          </Bloque>
        )}

        {fotosVisibles.length > 0 && (
          <Bloque titulo="Registro fotográfico">
            <div className="grid grid-cols-3 gap-2">
              {fotosVisibles.map((f, i) => (
                <figure key={f.ruta} className="break-inside-avoid">
                  {url.get(f.ruta) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url.get(f.ruta) ?? undefined} alt={f.nota || `Foto ${i + 1}`} className="aspect-[4/3] w-full rounded border border-doc-linea object-cover" />
                  ) : (
                    <div className="grid aspect-[4/3] place-items-center rounded border border-doc-linea text-doc-tenue">Foto {i + 1}</div>
                  )}
                  <figcaption className="mt-0.5 text-[9.5px] text-doc-tenue">{i + 1}. {f.nota}</figcaption>
                </figure>
              ))}
            </div>
          </Bloque>
        )}

        <Bloque titulo={depto ? "Riesgos y medidas a su cargo" : "Riesgos identificados y medidas, por prioridad"}>
          {hallazgos.length === 0 ? (
            <p>Sin hallazgos{depto ? " para este departamento" : ""}.</p>
          ) : (
            <Tabla hallazgos={hallazgos} conDepto={!depto} />
          )}
          <p className="mt-1.5 text-[9.5px] text-doc-tenue">Prioridad = probabilidad × severidad (1 a 5). Bajo 1–4 · Medio 5–9 · Alto 10–16 · Crítico 20–25.</p>
        </Bloque>

        {!depto && todos.length > 0 && (
          <Bloque titulo="Resumen por departamento">
            <div className="grid grid-cols-4 gap-2">
              {DEPARTAMENTOS.filter((d) => todos.some((h) => h.departamento === d.clave)).map((d) => {
                const del = todos.filter((h) => h.departamento === d.clave);
                const p = del.map((h) => prioridad(h)).find(Boolean);
                return (
                  <div key={d.clave} className="rounded-lg border border-doc-linea px-2.5 py-1.5">
                    <div className="text-[8.5px] font-bold uppercase tracking-[.1em] text-doc-tenue">{d.nombre}</div>
                    <div className="font-cifra text-[18px] font-medium">{del.length}</div>
                    {p && <span className={`rounded px-1 text-[9px] font-bold ${NIVEL[p.texto]}`}>máx. {p.texto}</span>}
                  </div>
                );
              })}
            </div>
          </Bloque>
        )}

        {!depto && ev.observaciones && <Bloque titulo="Observaciones y seguimiento">{ev.observaciones}</Bloque>}

        <Firmas>
          <div className="flex items-end gap-3">
            <div className="w-48 text-center text-[10px] leading-[1.35]">
              <div className="relative mb-1 h-14 border-b border-[#15201e]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {firma && !borrador && <img src={firma} alt="" className="absolute inset-x-0 -bottom-2 mx-auto max-h-20 max-w-[90%] object-contain" />}
              </div>
              {firmas?.nombre_completo && <div className="text-[11px] font-bold">{firmas.nombre_completo}</div>}
              <div className="text-doc-tenue">{[firmas?.especialidad || "Evaluador", firmas?.mpps && `MPPS ${firmas.mpps}`, firmas?.registro_inpsasel && `INPSASEL ${firmas.registro_inpsasel}`].filter(Boolean).join(" · ")}</div>
            </div>
            <CasillaSello imagen={borrador ? null : sello} className="h-[64px] w-[104px]" />
          </div>
          <div className="w-40 text-center text-[10px] leading-[1.35]">
            <div className="mb-1 h-14 border-b border-[#15201e]" />
            <div className="text-doc-tenue">{depto ? `Recibido por ${depto.nombre}` : "Representante de la empresa"}</div>
          </div>
          {!depto && (
            <div className="w-40 text-center text-[10px] leading-[1.35]">
              <div className="mb-1 h-14 border-b border-[#15201e]" />
              <div className="text-doc-tenue">Delegado(a) de prevención</div>
            </div>
          )}
        </Firmas>
        <Pie d={doc} derecha={`Folio ${folio("EG", ev.id)}`} />
      </Hoja>
    </div>
  );
}

function Tabla({ hallazgos, conDepto }: { hallazgos: Hallazgo[]; conDepto: boolean }) {
  return (
    <table className="w-full border-collapse text-[10.5px]">
      <thead>
        <tr className="border-b border-doc-linea text-left text-[8.5px] uppercase tracking-[.1em] text-doc-tenue">
          <th className="py-1 pr-2 font-semibold">Prioridad</th>
          <th className="py-1 pr-2 font-semibold">Riesgo y posible daño</th>
          <th className="py-1 pr-2 font-semibold">Medida recomendada</th>
          {conDepto && <th className="py-1 pr-2 font-semibold">Responsable</th>}
          <th className="py-1 font-semibold">Plazo</th>
        </tr>
      </thead>
      <tbody>
        {hallazgos.map((h) => {
          const p = prioridad(h);
          return (
            <tr key={h.id} className="break-inside-avoid border-b border-doc-linea/70 align-top">
              <td className="py-1 pr-2">
                {p ? <span className={`whitespace-nowrap rounded px-1.5 py-[1px] font-bold ${NIVEL[p.texto]}`}>{p.texto} {p.n}</span> : <span className="text-doc-tenue">—</span>}
                {h.p > 0 && h.s > 0 && <div className="mt-0.5 text-[8.5px] text-doc-tenue">{ESCALA_P[h.p]} · {ESCALA_S[h.s]}</div>}
              </td>
              <td className="py-1 pr-2">
                <div className="font-semibold">{h.factor}</div>
                {h.consecuencia && <div className="text-doc-tenue">{h.consecuencia}</div>}
              </td>
              <td className="py-1 pr-2">{h.medida || "—"}</td>
              {conDepto && <td className="py-1 pr-2">{DEPARTAMENTOS.find((d) => d.clave === h.departamento)?.nombre}</td>}
              <td className="py-1 whitespace-nowrap">{h.plazo || p?.plazo || "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
