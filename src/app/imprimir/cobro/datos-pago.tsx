// Condiciones y datos para el pago al pie de la nota de cobro / recibo (Configuración › Organización › Documentos).
// El texto se ordena solo: una línea que termina en «:» (p. ej. «Cuentas bancarias:», «Pago móvil:», «Binance:»)
// abre un recuadro con ese título; lo que va antes del primer título (el titular) sale arriba, a todo el ancho.
// En cada línea, lo que va antes del primer « · » sale en negrita (banco, código). Sin títulos: un solo bloque.
type Seccion = { titulo: string; lineas: string[] };

const esTitulo = (l: string) => l.endsWith(":") && l.length <= 40;

export function seccionesPago(texto: string) {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const cabecera: string[] = [];
  const secciones: Seccion[] = [];
  for (const l of lineas) {
    if (esTitulo(l)) secciones.push({ titulo: l.slice(0, -1).trim(), lineas: [] });
    else if (secciones.length) secciones[secciones.length - 1].lineas.push(l);
    else cabecera.push(l);
  }
  return { cabecera, secciones: secciones.filter((s) => s.lineas.length) };
}

function Linea({ texto }: { texto: string }) {
  const k = texto.indexOf(" · ");
  if (k < 0) return <div className="break-inside-avoid">{texto}</div>;
  const [nombre, valor] = [texto.slice(0, k), texto.slice(k + 3)];
  // Línea larga (cuenta de 20 dígitos, correo): el nombre arriba y el dato debajo, sin cortarlo
  if (texto.length > 32) return <div className="mb-0.5 break-inside-avoid"><b className="font-semibold">{nombre}</b><div className="whitespace-nowrap tabular-nums text-neutral-800">{valor}</div></div>;
  return <div className="break-inside-avoid"><b className="font-semibold">{nombre}</b><span className="tabular-nums text-neutral-800"> · {valor}</span></div>;
}

export function DatosPagoCobro({ condiciones, datosPago }: { condiciones: string; datosPago: string }) {
  const { cabecera, secciones } = seccionesPago(datosPago);
  if (!condiciones && !cabecera.length && !secciones.length) return null;
  const columnas = secciones.length >= 3 ? "grid-cols-[1.25fr_1fr_1fr]" : secciones.length === 2 ? "grid-cols-2" : "grid-cols-1";
  return (
    <div data-prueba="cobro-pago" className="mt-4 break-inside-avoid text-[12px] leading-snug">
      {condiciones && <p className="mb-2 border-l-[3px] border-neutral-800 pl-2"><b>Condiciones de pago:</b> {condiciones}</p>}
      {(cabecera.length > 0 || secciones.length > 0) && (
        <div className="rounded-md border border-neutral-400">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 rounded-t-md bg-neutral-100 px-3 py-1">
            <span className="text-[10.5px] font-extrabold uppercase tracking-[.12em]">Datos para el pago</span>
            {secciones.length > 0 && cabecera.length > 0 && <span className="text-[11.5px]">{cabecera.join(" · ")}</span>}
          </div>
          {secciones.length > 0 ? (
            <div className={`grid ${columnas} divide-x divide-neutral-300`}>
              {secciones.map((s) => (
                <div key={s.titulo} className="break-inside-avoid px-3 py-1.5">
                  <div className="mb-0.5 text-[10px] font-extrabold uppercase tracking-[.1em] text-neutral-600">{s.titulo}</div>
                  {s.lineas.map((l, k) => <Linea key={k} texto={l} />)}
                </div>
              ))}
            </div>
          ) : (
            <div className={`px-3 py-1.5 ${cabecera.length > 3 ? "columns-2 gap-6" : ""}`}>{cabecera.map((l, k) => <Linea key={k} texto={l} />)}</div>
          )}
        </div>
      )}
    </div>
  );
}
