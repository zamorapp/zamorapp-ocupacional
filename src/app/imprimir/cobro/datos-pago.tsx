// Condiciones y datos para el pago al pie de la nota de cobro / recibo (Configuración › Organización › Documentos).
// Más de 3 líneas de cuentas: dos columnas para que el recibo no crezca a otra hoja (Diseño, 05-nov).
export function DatosPagoCobro({ condiciones, datosPago }: { condiciones: string; datosPago: string }) {
  const lineas = datosPago.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!condiciones && !lineas.length) return null;
  return (
    <div data-prueba="cobro-pago" className="mt-4 break-inside-avoid rounded-md border border-neutral-300 px-3 py-2 text-[12px] leading-snug">
      {condiciones && <p><b>Condiciones de pago:</b> {condiciones}</p>}
      {lineas.length > 0 && (
        <div className={condiciones ? "mt-1.5" : ""}>
          <b>Datos para el pago</b>
          <div className={lineas.length > 3 ? "columns-2 gap-6" : ""}>
            {lineas.map((l, k) => <div key={k} className="break-inside-avoid">{l}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}
