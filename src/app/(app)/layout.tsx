import { BarraLateral } from "@/components/app/barra-lateral";
import { Encabezado } from "@/components/app/encabezado";

export default function LayoutApp({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r bg-card lg:block">
        <BarraLateral />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Encabezado />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
