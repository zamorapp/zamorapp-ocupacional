"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, FileUp, Loader2, Lock, Printer } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { imprimirPagina } from "@/lib/escritorio";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { cajasAbajo, cajasDondeDiceFirma, estamparPdf, type Caja, type Colocacion, type Imagen } from "@/lib/firmar-pdf";
import { cn } from "@/lib/utils";

type Alcance = "esta" | "ultima" | "todas";
type Modo = "auto" | "abajo" | "manual";
type Punto = { x: number; y: number };
const MAX_MB = 40;

async function pdfjs() {
  const p = await import("pdfjs-dist");
  p.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  return p;
}

function proporcionDe(url: string): Promise<number> {
  return new Promise((ok) => {
    const i = new Image();
    i.onload = () => ok(i.naturalWidth ? i.naturalHeight / i.naturalWidth : 1);
    i.onerror = () => ok(1);
    i.src = url;
  });
}

function Opcion({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={activo} onClick={onClick}
      className={cn("rounded-full border px-3 py-1.5 text-sm transition-colors", activo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
      {activo && "✓ "}{children}
    </button>
  );
}

// Las imágenes se guardan como data URL (Mi perfil). Si alguna vez llega otra cosa (un enlace), no se puede estampar.
const esDataUrl = (u: string | null) => Boolean(u && /^data:image\/(png|jpe?g);base64,/i.test(u));

export function FirmarPdf({ firma: firmaUrl, sello: selloUrl, orgId }: { firma: string | null; sello: string | null; orgId: string | null }) {
  const firma = esDataUrl(firmaUrl) ? firmaUrl : null, sello = esDataUrl(selloUrl) ? selloUrl : null;
  const imagenRara = (firmaUrl && !firma) || (selloUrl && !sello);
  const [archivo, setArchivo] = useState<{ nombre: string; bytes: ArrayBuffer; kb: number } | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pagina, setPagina] = useState(0);
  const [imgs, setImgs] = useState<{ firma: Imagen | null; sello: Imagen | null }>({ firma: null, sello: null });
  const [usarFirma, setUsarFirma] = useState(Boolean(firma));
  const [usarSello, setUsarSello] = useState(Boolean(sello));
  const [alcance, setAlcance] = useState<Alcance>("esta");
  const [tam, setTam] = useState(1);
  const [modo, setModo] = useState<Modo>("auto");
  const [manual, setManual] = useState<{ firma: Punto | null; sello: Punto | null }>({ firma: null, sello: null });
  const [vista, setVista] = useState<Colocacion>({ firma: null, sello: null });
  const [relacion, setRelacion] = useState(11 / 8.5);
  const [noEncontro, setNoEncontro] = useState(false);
  const [ocupado, setOcupado] = useState<"" | "abrir" | "descargar" | "imprimir">("");
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState("");
  const [impresion, setImpresion] = useState<string[]>([]);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const hoja = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void Promise.all([firma ? proporcionDe(firma) : null, sello ? proporcionDe(sello) : null]).then(([pf, ps]) =>
      setImgs({ firma: firma && pf ? { url: firma, proporcion: pf } : null, sello: sello && ps ? { url: sello, proporcion: ps } : null }));
  }, [firma, sello]);

  const activas = useCallback(() => ({ f: usarFirma ? imgs.firma : null, s: usarSello ? imgs.sello : null }), [usarFirma, usarSello, imgs]);

  // Cajas de una página según el modo elegido. «manual» repite en todas las páginas el lugar donde se soltó.
  const colocacion = useCallback(async (indice: number): Promise<Colocacion & { encontrado: boolean }> => {
    const { f, s } = activas();
    const p = await doc!.getPage(indice + 1);
    const v = p.getViewport({ scale: 1 });
    const rel = v.height / v.width;
    const base = cajasAbajo(f, s, tam, rel);
    if (modo === "manual") {
      const desde = (pto: Punto | null, c: Caja | null): Caja | null => (c && pto ? { ...c, x: Math.min(Math.max(pto.x, 0), 1 - c.w), y: Math.min(Math.max(pto.y, 0), 1 - c.h) } : c);
      return { firma: desde(manual.firma, base.firma), sello: desde(manual.sello, base.sello), encontrado: true };
    }
    if (modo === "auto") {
      const aqui = await cajasDondeDiceFirma(p, f, s, tam);
      if (aqui) return { ...aqui, encontrado: true };
    }
    return { ...base, encontrado: modo === "abajo" };
  }, [activas, doc, manual, modo, tam]);

  // Dibuja la página y sus cajas
  useEffect(() => {
    if (!doc) return;
    let vivo = true;
    let tarea: { cancel: () => void } | null = null;
    void (async () => {
      const p = await doc.getPage(pagina + 1);
      const ancho = hoja.current?.clientWidth ?? 600;
      const v1 = p.getViewport({ scale: 1 });
      const v = p.getViewport({ scale: (ancho / v1.width) * Math.min(window.devicePixelRatio || 1, 2) });
      const c = lienzo.current;
      if (!c || !vivo) return;
      c.width = v.width;
      c.height = v.height;
      setRelacion(v1.height / v1.width);
      const r = p.render({ canvasContext: c.getContext("2d")!, viewport: v });
      tarea = r;
      await r.promise.catch(() => {});
      const k = await colocacion(pagina);
      if (vivo) {
        setVista({ firma: k.firma, sello: k.sello });
        setNoEncontro(modo === "auto" && !k.encontrado);
      }
    })();
    return () => { vivo = false; tarea?.cancel(); };
  }, [doc, pagina, colocacion, modo]);

  const abrir = async (f: File | undefined) => {
    setError(""); setHecho("");
    if (!f) return;
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) return setError("Ese archivo no es un PDF.");
    if (f.size > MAX_MB * 1024 * 1024) return setError(`El PDF pesa más de ${MAX_MB} MB. Elige uno más liviano.`);
    setOcupado("abrir");
    try {
      const bytes = await f.arrayBuffer();
      const p = await pdfjs();
      // pdf.js se queda con el arreglo que recibe: se le pasa una copia para conservar el original
      const d = await p.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
      await doc?.destroy();
      setArchivo({ nombre: f.name, bytes, kb: Math.round(f.size / 1024) });
      setDoc(d);
      setPagina(alcance === "ultima" ? d.numPages - 1 : 0);
      setModo("auto");
      setManual({ firma: null, sello: null });
    } catch (e) {
      setError((e as { name?: string })?.name === "PasswordException" ? "Ese PDF tiene contraseña. Ábrelo, quítale la contraseña y vuelve a subirlo." : "No se pudo abrir ese PDF. Puede estar dañado.");
    } finally {
      setOcupado("");
    }
  };

  const paginas = (): number[] => {
    const n = doc?.numPages ?? 0;
    if (alcance === "todas") return Array.from({ length: n }, (_, i) => i);
    if (alcance === "ultima") return [n - 1];
    return [pagina];
  };

  const firmado = async () => {
    const { f, s } = activas();
    return estamparPdf(archivo!.bytes.slice(0), { firma: f?.url ?? null, sello: s?.url ?? null }, paginas(), colocacion);
  };

  // Rastro en la bitácora (archivo, páginas y hora del servidor); el PDF no sale del equipo. Nunca bloquea:
  // sin internet o con un error, el PDF firmado igual se descarga o imprime.
  const anotar = () => {
    if (!orgId || !archivo) return;
    try {
      void crearClienteNavegador().rpc("registrar_firma_pdf", {
        p_org: orgId, p_archivo: archivo.nombre, p_paginas: paginas().map((i) => i + 1), p_total: doc?.numPages ?? 0,
      }).then(() => {}, () => {});
    } catch { /* sin conexión configurada: el PDF igual sale */ }
  };

  const nombreFirmado = () => `${archivo!.nombre.replace(/\.pdf$/i, "")}-firmado.pdf`;

  const descargar = async () => {
    setError(""); setHecho(""); setOcupado("descargar");
    try {
      const bytes = await firmado();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      a.download = nombreFirmado();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      setHecho(`Listo: ${nombreFirmado()} quedó en tu carpeta Descargas.`);
      anotar();
    } catch {
      setError("No se pudo firmar ese PDF. Si está protegido, ábrelo, guárdalo de nuevo como PDF y vuelve a intentar.");
    } finally {
      setOcupado("");
    }
  };

  // Imprimir: el PDF firmado se dibuja en imágenes solo para la impresión (sirve igual en la web y en el escritorio)
  const imprimir = async () => {
    setError(""); setHecho(""); setOcupado("imprimir");
    try {
      const bytes = await firmado();
      const p = await pdfjs();
      const d = await p.getDocument({ data: bytes }).promise;
      const urls: string[] = [];
      for (let i = 1; i <= d.numPages; i++) {
        const pg = await d.getPage(i);
        const v = pg.getViewport({ scale: 2 });
        const c = document.createElement("canvas");
        c.width = v.width; c.height = v.height;
        await pg.render({ canvasContext: c.getContext("2d")!, viewport: v }).promise;
        urls.push(c.toDataURL("image/jpeg", 0.92));
      }
      await d.destroy();
      setImpresion(urls);
      await new Promise((r) => setTimeout(r, 150));
      await imprimirPagina();
      anotar();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "No se pudo imprimir. Usa «Descargar» y ábrelo para imprimir.");
    } finally {
      setOcupado("");
      setTimeout(() => setImpresion([]), 1000);
    }
  };

  // Arrastrar firma o sello con el dedo o el ratón
  const arrastrar = (cual: "firma" | "sello") => (ev: React.PointerEvent<HTMLDivElement>) => {
    const caja = vista[cual];
    const cont = hoja.current?.getBoundingClientRect();
    if (!caja || !cont) return;
    ev.preventDefault();
    (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
    const dx = (ev.clientX - cont.left) / cont.width - caja.x, dy = (ev.clientY - cont.top) / cont.height - caja.y;
    const otra = cual === "firma" ? "sello" : "firma";
    const mover = (e: PointerEvent) => {
      const x = Math.min(Math.max((e.clientX - cont.left) / cont.width - dx, 0), 1 - caja.w);
      const y = Math.min(Math.max((e.clientY - cont.top) / cont.height - dy, 0), 1 - caja.h);
      setVista((v) => ({ ...v, [cual]: { ...caja, x, y } }));
    };
    const soltar = (e: PointerEvent) => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      const x = Math.min(Math.max((e.clientX - cont.left) / cont.width - dx, 0), 1 - caja.w);
      const y = Math.min(Math.max((e.clientY - cont.top) / cont.height - dy, 0), 1 - caja.h);
      const o = vista[otra];
      setManual({ [cual]: { x, y }, [otra]: o ? { x: o.x, y: o.y } : null } as { firma: Punto | null; sello: Punto | null });
      setModo("manual");
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  };

  const n = doc?.numPages ?? 0;
  const nada = !(usarFirma && imgs.firma) && !(usarSello && imgs.sello);

  return (
    <div className="space-y-4">
      <input ref={entrada} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => { void abrir(e.target.files?.[0]); e.target.value = ""; }} />
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void abrir(e.dataTransfer.files?.[0]); }}
        className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed bg-card p-3"
      >
        <FileUp className="size-6 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          {archivo ? (
            <>
              <p className="truncate font-semibold">{archivo.nombre}</p>
              <p className="text-sm text-muted-foreground">{n} {n === 1 ? "página" : "páginas"} · {archivo.kb} KB</p>
            </>
          ) : (
            <p className="text-muted-foreground">Arrastra aquí el PDF o elígelo de tu equipo.</p>
          )}
        </div>
        <Button type="button" variant={archivo ? "outline" : "default"} onClick={() => entrada.current?.click()} disabled={ocupado === "abrir"}>
          {ocupado === "abrir" ? <Loader2 className="animate-spin" /> : <FileUp />} {archivo ? "Cambiar PDF" : "Elegir PDF"}
        </Button>
      </div>

      {imagenRara && (
        <p role="alert" className="rounded-lg border border-aviso/40 bg-aviso/10 p-3 text-sm text-aviso-texto">
          {firmaUrl && !firma ? "Tu firma" : "Tu sello"} no se pudo leer. Vuelve a cargarlo en <a href="/configuracion/perfil" className="underline">Mi perfil</a>.
        </p>
      )}
      {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {hecho && <p role="status" className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">{hecho}</p>}

      {doc && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_300px]">
          <Card className="gap-0 p-3 sm:p-4">
            <div ref={hoja} className="relative mx-auto w-full touch-none select-none overflow-hidden rounded bg-white shadow" style={{ aspectRatio: `1 / ${relacion}`, maxWidth: `max(280px, calc((100dvh - 13rem) / ${relacion}))` }}>
              <canvas ref={lienzo} className="absolute inset-0 size-full" />
              {(["firma", "sello"] as const).map((cual) => {
                const c = vista[cual], img = imgs[cual];
                if (!c || !img) return null;
                return (
                  <div key={cual} role="button" tabIndex={0} aria-label={`Mover ${cual}`} onPointerDown={arrastrar(cual)}
                    className="absolute cursor-grab rounded border-2 border-dashed border-primary bg-white/40 active:cursor-grabbing"
                    style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` }}>
                    <span className="absolute -top-5 left-0 rounded bg-primary px-1.5 text-[11px] leading-4 text-primary-foreground">{cual === "firma" ? "Firma" : "Sello"}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element -- data URL privada de firma_sello() */}
                    <img src={img.url} alt="" draggable={false} className="pointer-events-none size-full object-contain" />
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button type="button" variant="outline" size="icon" aria-label="Página anterior" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}><ChevronLeft /></Button>
              <span>Página <b>{pagina + 1}</b> de {n}</span>
              <Button type="button" variant="outline" size="icon" aria-label="Página siguiente" disabled={pagina >= n - 1} onClick={() => setPagina((p) => p + 1)}><ChevronRight /></Button>
            </div>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              {noEncontro ? "No encontré la palabra «Firma» en esta página: la puse abajo a la derecha. " : ""}Arrastra la firma o el sello con el dedo o el ratón.
            </p>
          </Card>

          <Card className="gap-0 p-4">
            <p className="mb-2 text-sm font-semibold">Qué estampar</p>
            <div className="flex flex-wrap gap-2">
              {imgs.firma && <Opcion activo={usarFirma} onClick={() => setUsarFirma((v) => !v)}>Firma</Opcion>}
              {imgs.sello && <Opcion activo={usarSello} onClick={() => setUsarSello((v) => !v)}>Sello</Opcion>}
            </div>
            <p className="mb-2 mt-4 text-sm font-semibold">En qué páginas</p>
            <div className="flex flex-wrap gap-2">
              <Opcion activo={alcance === "esta"} onClick={() => setAlcance("esta")}>Esta página</Opcion>
              <Opcion activo={alcance === "ultima"} onClick={() => { setAlcance("ultima"); setPagina(n - 1); }}>Última</Opcion>
              <Opcion activo={alcance === "todas"} onClick={() => setAlcance("todas")}>Todas</Opcion>
            </div>
            <label htmlFor="tam-firma" className="mb-2 mt-4 block text-sm font-semibold">Tamaño ({Math.round(tam * 100)}{"\u00a0"}%)</label>
            <input id="tam-firma" type="range" min={0.5} max={1.8} step={0.05} value={tam} onChange={(e) => setTam(Number(e.target.value))} className="w-full accent-[var(--primary)]" />
            <p className="mb-2 mt-4 text-sm font-semibold">Posición</p>
            <div className="flex flex-wrap gap-2">
              <Opcion activo={modo === "auto" && !noEncontro} onClick={() => setModo("auto")}>Donde dice «Firma»</Opcion>
              <Opcion activo={modo === "abajo" || (modo === "auto" && noEncontro)} onClick={() => setModo("abajo")}>Abajo a la derecha</Opcion>
              {modo === "manual" && <Opcion activo onClick={() => {}}>Donde la dejé</Opcion>}
            </div>
            <div className="mt-5 grid gap-2">
              <Button type="button" size="lg" onClick={() => void descargar()} disabled={nada || ocupado !== ""}>
                {ocupado === "descargar" ? <Loader2 className="animate-spin" /> : <Download />} Descargar PDF firmado
              </Button>
              <Button type="button" variant="outline" onClick={() => void imprimir()} disabled={nada || ocupado !== ""}>
                {ocupado === "imprimir" ? <Loader2 className="animate-spin" /> : <Printer />} Imprimir
              </Button>
            </div>
            <p className="mt-4 flex gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              <Lock className="mt-0.5 size-4 shrink-0" />
              Solo el médico ve esta función. El PDF no se sube a ningún lado: se firma en tu equipo y se descarga.
            </p>
          </Card>
        </div>
      )}

      {impresion.length > 0 && createPortal(
        <div id="impresion-firmada">
          <style>{"@media screen{#impresion-firmada{display:none}}@media print{body>*:not(#impresion-firmada){display:none!important}@page{margin:0}#impresion-firmada img{display:block;width:100%;break-after:page}}"}</style>
          {/* eslint-disable-next-line @next/next/no-img-element -- páginas dibujadas solo para imprimir */}
          {impresion.map((u, i) => <img key={i} src={u} alt="" />)}
        </div>,
        document.body,
      )}
    </div>
  );
}

