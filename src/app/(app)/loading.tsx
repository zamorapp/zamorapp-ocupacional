// Se muestra al instante al cambiar de pantalla mientras llegan los datos
export default function Cargando() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-6" aria-busy="true" aria-label="Cargando">
      <div className="space-y-2">
        <div className="h-8 w-56 rounded-lg bg-muted" />
        <div className="h-4 w-80 max-w-full rounded bg-muted/70" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-24 rounded-xl bg-muted/70" />)}
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-5">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-5 rounded bg-muted/70" style={{ width: `${90 - i * 8}%` }} />)}
      </div>
    </div>
  );
}
