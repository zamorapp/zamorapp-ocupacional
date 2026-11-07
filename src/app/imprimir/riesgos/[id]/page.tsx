import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { AjustesDocumentos } from "@/lib/documentos";
import { BarrasPuestos, DonaGrupos, FichasGrupo, LetraGrupo, MatrizRiesgos, Tarjetas } from "@/components/riesgos/graficas";
import { LeyendaMapa, MapaRiesgos } from "@/components/riesgos/mapa";
import { DEPARTAMENTOS } from "@/lib/ergonomia";
import { ahora, hoyCaracas } from "@/lib/fecha";
import type { Firmantes } from "@/lib/firmantes";
import { firmantesAnteriores } from "@/lib/reportes";
import { obtenerEvaluacionRiesgos, obtenerEvaluacionRiesgosEmpresa } from "@/lib/riesgos-datos";
import { BASE_LEGAL, fueraDeRango, MEDICIONES, NOMBRE_GRUPO, nivelFila, porPuesto, TIPOS_EVALUACION, TIPOS_MEDIDA } from "@/lib/riesgos-puesto";
import { puedePortal } from "@/lib/permisos-portal";
import { obtenerSesion } from "@/lib/sesion";
import { esRolEmpresa } from "@/lib/sesion-roles";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraImpresion } from "../../barra";
import { Portada } from "../../vigilancia/portada";
import { Bloque, CasillaSello, fechaCorta, Ficha, Firmas, folio, Hoja, Membrete, Pie } from "../../componentes";

export const metadata: Metadata = { title: "Identificación de riesgos y mapa de riesgos" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Colores de papel por nivel (legibles en blanco y negro por la palabra)
const NIVEL: Record<string, string> = {
  Bajo: "border border-[#1d7a46] bg-[#e7f4ec] font-bold text-[#1d7a46]",
  Medio: "border border-[#7a5300] bg-[#fdf4dc] font-bold text-[#7a5300]",
  Alto: "border border-[#b42318] bg-[#fdecea] font-bold text-[#b42318]",
  Crítico: "border border-[#b42318] bg-[#b42318] font-bold text-white",
};

export default async function ImprimirRiesgos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await obtenerSesion();
  // La empresa lee la vista (solo cerradas, sin observaciones); lo decide el rol, nunca la dirección
  const empresaRol = esRolEmpresa(sesion.rol);
  const ev = empresaRol ? await obtenerEvaluacionRiesgosEmpresa(id) : await obtenerEvaluacionRiesgos(id);
  if (!ev || (!sesion.orgId && !sesion.demo)) notFound();
  // RR. HH. sin el permiso «Descargar documentos» no abre informes (Usuarios y roles)
  if (!puedePortal(sesion, "descargas")) notFound();

  const supabase = sesion.demo ? null! : await crearClienteServidor();
  const sinDatos = { data: null };
  const [{ data: org }, { data: emp }, firmas, plano, previos] = sesion.demo ? [sinDatos, sinDatos, null, null, null] as const : await Promise.all([
    supabase.from("organizaciones").select("nombre, rif, direccion, telefono, correo, ajustes, logo").eq("id", sesion.orgId!).single(),
    supabase.from("empresas").select("razon_social, rif, logo, nil, actividad_economica, direccion, telefono").eq("id", ev.empresaId).single(),
    ev.evaluadoPor
      ? Promise.all([
          supabase.from("perfiles").select("nombre_completo, cedula, especialidad, mpps, registro_inpsasel, mostrar_firma, mostrar_sello").eq("id", ev.evaluadoPor).maybeSingle(),
          supabase.rpc("firma_sello", { p_usuario: ev.evaluadoPor }).maybeSingle(),
        ]).then(([{ data: p }, { data: img }]) => (p ? { ...p, ...((img as { firma_url: string | null; sello_url: string | null } | null) ?? { firma_url: null, sello_url: null }) } : null))
      : Promise.resolve(null),
    ev.mapa.plano ? supabase.storage.from("mapas-riesgo").createSignedUrl(ev.mapa.plano, 600).then(({ data }) => data?.signedUrl ?? null) : Promise.resolve(null),
    firmantesAnteriores(ev.empresaId).catch(() => null),
  ]);

  // Fotos de la zona: solo el servicio (la empresa no las ve, igual que en ergonomía)
  const rutasFotos = empresaRol || sesion.demo ? [] : ev.puestos.flatMap((p) => (p.fotos ?? []).map((f) => f.ruta));
  const { data: firmadas } = rutasFotos.length ? await supabase.storage.from("mapas-riesgo").createSignedUrls(rutasFotos, 600) : { data: [] };
  const urlFoto = new Map((firmadas ?? []).map((u) => [u.path, u.signedUrl]));

  const doc = {
    org: { ...(org ?? { nombre: sesion.organizacion, rif: null, direccion: null, telefono: null, correo: null, logo: null }), ajustes: (org?.ajustes ?? {}) as AjustesDocumentos },
    empresa: { razon_social: emp?.razon_social ?? ev.empresa, rif: emp?.rif ?? "", logo: (emp?.logo as string | null) ?? null },
    impreso: { por: sesion.nombre, el: new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date(ahora())) },
  };
  const tipo = TIPOS_EVALUACION.find((t) => t.clave === ev.tipo) ?? TIPOS_EVALUACION[0];
  const borrador = ev.estado !== "cerrada";
  const firma = firmas && firmas.mostrar_firma !== false ? firmas.firma_url : null;
  const sello = firmas && firmas.mostrar_sello !== false ? firmas.sello_url : null;
  const expuestos = ev.puestos.reduce((a, p) => a + (p.expuestos ?? 0), 0);
  const numero = new Map(ev.filas.map((f, i) => [f.id, i + 1]));
  const grupos = porPuesto(ev.filas);
  const conMediciones = ev.tipo === "oficina" && ev.puestos.some((p) => p.mediciones && Object.values(p.mediciones).some((v) => typeof v === "number"));
  const firmantes: Firmantes = {
    ...(previos ?? {}),
    medico: firmas?.nombre_completo
      ? { nombre: firmas.nombre_completo, cedula: firmas.cedula ?? "", cargo: firmas.especialidad || "Evaluador", registro: firmas.registro_inpsasel || firmas.mpps || "" }
      : previos?.medico,
  };
  const ficha = emp ? { razonSocial: emp.razon_social, rif: emp.rif ?? "", nil: emp.nil ?? null, actividad: emp.actividad_economica ?? null, direccion: emp.direccion ?? null, telefono: emp.telefono ?? null } : { razonSocial: ev.empresa, rif: "", nil: null, actividad: null, direccion: null, telefono: null };
  const marcaAgua = borrador && <div className="pointer-events-none absolute top-[40%] left-1/2 -translate-x-1/2 -rotate-12 text-[64px] font-extrabold tracking-widest text-[#b42318]/10">BORRADOR</div>;

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={empresaRol ? "/portal" : `/riesgos/${ev.id}`} titulo={`Riesgos · ${ev.titulo}`} />
      <Portada
        logoEmpresa={doc.empresa.logo}
        orgLogo={doc.org.logo}
        empresa={ficha}
        firmantes={firmantes}
        fechaEmision={ev.cerradaEn ? hoyCaracas(ev.cerradaEn) : ev.fecha}
        titulo={ev.titulo}
        subtitulo={tipo.nombre}
        org={doc.org.nombre}
        textos={{
          serie: "Evaluaciones de riesgos y puestos de trabajo",
          documento: "Identificación de riesgos por puesto de trabajo y mapa de riesgos",
          norma: `${BASE_LEGAL}${borrador ? " · BORRADOR" : ""}`,
          control: "Identificación y evaluación de riesgos",
          rango: `Evaluado el ${fechaCorta(ev.fecha)}`,
          elaborado: "Elaborado por · evaluador",
          sinDatos: "Sin datos: se toman del último informe de vigilancia de esta empresa (Reportes › Portada y firmantes)",
          sinElaborado: "Sin datos: es quien hizo la evaluación",
        }}
      />

      {/* Hoja 1: datos, resultados y gráficas */}
      <Hoja className="relative print:block">
        {marcaAgua}
        <Membrete d={doc} />
        <div className="mt-5 mb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-balance">Identificación de riesgos por puesto de trabajo</h1>
            <span className="mt-1.5 inline-block rounded bg-doc-suave px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-doc-acento">{BASE_LEGAL}</span>
          </div>
          <div className="shrink-0 text-right font-cifra text-[10.5px] leading-relaxed text-doc-tenue">
            <div>Folio <b className="font-medium text-[#15201e]">{folio("IR", ev.id)}</b></div>
            <div>Evaluado <b className="font-medium text-[#15201e]">{fechaCorta(ev.fecha)}</b></div>
          </div>
        </div>
        <Ficha
          celdas={[
            { k: "Qué se evalúa", v: ev.titulo, ancho: 2, destacada: true },
            { k: "Tipo", v: tipo.nombre },
            { k: "Motivo", v: ev.motivo || "—" },
            { k: "Participantes", v: ev.participantes || "—", ancho: 4 },
            ...(ev.acta ? [{ k: "Acta", v: ev.acta, ancho: 2 as const }] : []),
          ]}
        />
        <Bloque titulo="Resultados">
          <Tarjetas filas={ev.filas} expuestos={expuestos} puestos={ev.puestos.length} impreso />
          <div className="mt-3 grid grid-cols-2 gap-4">
            <DonaGrupos filas={ev.filas} impreso />
            <MatrizRiesgos filas={ev.filas} impreso />
          </div>
        </Bloque>
        <Bloque titulo="Riesgos por puesto y nivel"><BarrasPuestos filas={ev.filas} impreso /></Bloque>
        {ev.conclusion && <Bloque titulo="Conclusión"><div className="whitespace-pre-line">{ev.conclusion}</div></Bloque>}
        <Pie d={doc} derecha={`Folio ${folio("IR", ev.id)}`} />
      </Hoja>

      {/* Hoja 2: mapa de riesgos */}
      <Hoja className="relative print:block">
        {marcaAgua}
        <Membrete d={doc} />
        <h2 className="mt-5 mb-1 text-xl font-extrabold tracking-tight">Mapa de riesgos</h2>
        <p className="mb-3 text-[12px] text-doc-tenue">Cada símbolo lleva la letra del grupo y el número del riesgo en la tabla; el anillo indica su nivel. Sirve para informar a los trabajadores expuestos por área (NT-04-2023, art. 14.1.5).</p>
        <MapaRiesgos mapa={ev.mapa} filas={ev.filas} planoUrl={plano} impreso />
        <div className="mt-2"><LeyendaMapa impreso /></div>
        <Bloque titulo="Cada grupo de riesgo"><FichasGrupo filas={ev.filas} impreso /></Bloque>
        <Pie d={doc} derecha={`Folio ${folio("IR", ev.id)}`} />
      </Hoja>

      {/* Hoja 3 en adelante: tabla por puesto, mediciones y firmas. Puede ocupar varias hojas: no se achica (mismo ancho
          y márgenes que las demás); empieza en hoja nueva y las filas no se parten */}
      <Hoja corte={false} className="relative break-before-page print:block">
        {marcaAgua}
        <Membrete d={doc} />
        <h2 className="mt-5 mb-3 text-xl font-extrabold tracking-tight">Riesgos y medidas por puesto de trabajo</h2>
        {grupos.map((g) => {
          const p = ev.puestos.find((x) => x.clave === g.clave);
          const filas = [...g.filas].sort((a, b) => (nivelFila(b)?.n ?? 0) - (nivelFila(a)?.n ?? 0));
          return (
            <Bloque key={g.clave} titulo={`${g.puesto}${p?.area ? ` · ${p.area}` : ""}${p?.expuestos != null ? ` · ${p.expuestos} expuestos` : ""}`}>
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-doc-linea text-left text-[9.5px] uppercase tracking-[.08em] text-doc-tenue">
                    <th className="py-1 pr-1.5 font-semibold">N.º</th>
                    <th className="py-1 pr-1.5 font-semibold">Riesgo y posible daño</th>
                    <th className="py-1 pr-1.5 font-semibold">Nivel</th>
                    <th className="py-1 pr-1.5 font-semibold">Medida</th>
                    <th className="py-1 pr-1.5 font-semibold">Responsable</th>
                    <th className="py-1 font-semibold">Plazo</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => {
                    const n = nivelFila(f);
                    return (
                      <tr key={f.id} className="break-inside-avoid border-b border-doc-linea/70 align-top">
                        <td className="py-1 pr-1.5"><span className="inline-flex items-center gap-1"><LetraGrupo g={f.grupo} chico /><span className="font-cifra">{numero.get(f.id)}</span></span></td>
                        <td className="py-1 pr-1.5">
                          <div className="font-semibold">{f.agente} <span className="font-normal text-doc-tenue">· {NOMBRE_GRUPO[f.grupo]}</span></div>
                          {f.efecto && <div className="text-doc-tenue">{f.efecto}</div>}
                          {f.controles && <div className="text-[11px] text-doc-tenue">Ya existe: {f.controles}</div>}
                        </td>
                        <td className="py-1 pr-1.5">{n ? <span className={`whitespace-nowrap rounded px-1 py-[1px] ${NIVEL[n.texto]}`}>{n.texto} {n.n}</span> : "—"}</td>
                        <td className="py-1 pr-1.5">{f.medida || "—"}{f.tipoMedida && <div className="text-[11px] text-doc-tenue">{TIPOS_MEDIDA.find((t) => t.clave === f.tipoMedida)?.nombre}</div>}</td>
                        <td className="py-1 pr-1.5">{DEPARTAMENTOS.find((d) => d.clave === f.responsable)?.nombre ?? "—"}</td>
                        <td className="py-1 whitespace-nowrap">{f.plazo || n?.plazo || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!empresaRol && (p?.fotos?.length ?? 0) > 0 && (
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {p!.fotos!.map((f, i) => (
                    <figure key={f.ruta} className="break-inside-avoid">
                      {urlFoto.get(f.ruta)
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={urlFoto.get(f.ruta) ?? undefined} alt={f.nota} className="aspect-[4/3] w-full rounded border border-doc-linea object-cover" />
                        : <div className="grid aspect-[4/3] place-items-center rounded border border-doc-linea text-doc-tenue">Foto {i + 1}</div>}
                      <figcaption className="mt-0.5 text-[11px] text-doc-tenue">{f.nota}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </Bloque>
          );
        })}
        <p className="mt-1 text-[12px] text-doc-tenue">Nivel = probabilidad × severidad (1 a 5). Bajo 1–4 · Medio 5–9 · Alto 10–16 · Crítico 20–25. Las medidas siguen el orden: eliminar, sustituir, ingeniería, administrativas y equipo de protección personal.</p>

        {conMediciones && (
          <Bloque titulo="Mediciones del ambiente de trabajo">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-doc-linea text-left text-[9.5px] uppercase tracking-[.08em] text-doc-tenue">
                  <th className="py-1 pr-2 font-semibold">Puesto</th>
                  {MEDICIONES.map((m) => <th key={m.clave} className="py-1 pr-2 font-semibold">{m.nombre} ({m.unidad})<div className="normal-case tracking-normal">Ref. {m.ref}</div></th>)}
                </tr>
              </thead>
              <tbody>
                {ev.puestos.map((p) => (
                  <tr key={p.clave} className="border-b border-doc-linea/70">
                    <td className="py-1 pr-2 font-semibold">{p.puesto}</td>
                    {MEDICIONES.map((m) => {
                      const v = p.mediciones?.[m.clave];
                      return <td key={m.clave} className={`py-1 pr-2 font-cifra ${fueraDeRango(m, v) ? "font-bold text-[#b42318]" : ""}`}>{typeof v === "number" ? String(v).replace(".", ",") : "—"}{fueraDeRango(m, v) && " · fuera"}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[9px] text-doc-tenue">Fuentes: {[...new Set(MEDICIONES.map((m) => m.fuente))].join("; ")}.</p>
          </Bloque>
        )}

        {!empresaRol && ev.observaciones && <Bloque titulo="Observaciones y seguimiento">{ev.observaciones}</Bloque>}

        <Firmas>
          <div className="flex items-end gap-3">
            <div className="w-44 text-center text-[10px] leading-[1.35]">
              <div className="relative mb-1 h-14 border-b border-[#15201e]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {firma && !borrador && <img src={firma} alt="" className="absolute inset-x-0 -bottom-2 mx-auto max-h-20 max-w-[90%] object-contain" />}
              </div>
              {firmas?.nombre_completo && <div className="text-[11px] font-bold">{firmas.nombre_completo}</div>}
              <div className="text-doc-tenue">{[firmas?.especialidad || "Evaluador", firmas?.mpps && `MPPS ${firmas.mpps}`, firmas?.registro_inpsasel && `INPSASEL ${firmas.registro_inpsasel}`].filter(Boolean).join(" · ")}</div>
            </div>
            <CasillaSello imagen={borrador ? null : sello} className="h-[64px] w-[104px]" />
          </div>
          {["Representante de la empresa", "Delegado(a) de prevención", "Comité de Seguridad y Salud Laboral"].map((t) => (
            <div key={t} className="w-36 text-center text-[10px] leading-[1.35]">
              <div className="mb-1 h-14 border-b border-[#15201e]" />
              <div className="text-doc-tenue">{t}</div>
            </div>
          ))}
        </Firmas>
        <Pie d={doc} derecha={`Folio ${folio("IR", ev.id)}`} />
      </Hoja>
    </div>
  );
}
