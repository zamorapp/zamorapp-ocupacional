// Vista del menú: «barra» (menú lateral de siempre) o «botones» (pantalla /menu con tarjetas grandes).
// Se guarda en este equipo (al instante, también sin internet) y en la cuenta de la nube (user_metadata.vista_menu),
// para que la elección siga al usuario en otra PC o en el celular. Preferencia visual, no dato clínico.

export type VistaMenu = "barra" | "botones";
export const CLAVE_VISTA_MENU = "zamorapp-vista-menu";

export const esVistaMenu = (v: unknown): v is VistaMenu => v === "barra" || v === "botones";

// Antes de pintar: marca <html data-menu="…"> para no mostrar la barra un instante y luego esconderla.
// Lo de este equipo manda; si nunca se eligió aquí, vale lo guardado en la nube.
export const scriptVistaMenu = (nube: VistaMenu | null) =>
  `(function(){try{var v=localStorage.getItem('${CLAVE_VISTA_MENU}');if(v!=='barra'&&v!=='botones')v=${JSON.stringify(nube ?? "barra")};document.documentElement.dataset.menu=v}catch(e){document.documentElement.dataset.menu=${JSON.stringify(nube ?? "barra")}}})();`;

export function leerVistaMenu(): VistaMenu {
  return document.documentElement.dataset.menu === "botones" ? "botones" : "barra";
}

export function aplicarVistaMenu(vista: VistaMenu) {
  document.documentElement.dataset.menu = vista;
  try {
    localStorage.setItem(CLAVE_VISTA_MENU, vista);
  } catch {}
  window.dispatchEvent(new Event("zamorapp-vista-menu"));
  // A la nube sin esperar: si no hay internet, queda en este equipo y se vuelve a intentar en el próximo cambio
  // (el cliente se carga aquí para que el servidor pueda leer este archivo sin arrastrarlo)
  if (process.env.NEXT_PUBLIC_SUPABASE_URL)
    void import("@/lib/supabase/client")
      .then(({ crearClienteNavegador }) => crearClienteNavegador().auth.updateUser({ data: { vista_menu: vista } }))
      .catch(() => {});
}

