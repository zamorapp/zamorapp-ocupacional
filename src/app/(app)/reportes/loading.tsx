// Esqueleto mientras se calculan los reportes del período
export default function Cargando() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-6" aria-busy>
      <div className="h-9 w-56 rounded-md bg-muted" />
      <div className="h-28 rounded-xl bg-muted" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-24 rounded-xl bg-muted" />)}</div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-64 rounded-xl bg-muted" />)}</div>
      <p className="text-center text-sm text-muted-foreground">Calculando los indicadores del período…</p>
    </div>
  );
}
