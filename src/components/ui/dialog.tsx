"use client"

import * as React from "react"
import { cn } from "cn"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { confirmar } from "@/components/app/confirmar"

// ─── Ventanas a prueba de descuidos (Cesar, 12-nov) ───
// Ninguna ventana se cierra al hacer clic afuera. La X, «Cancelar» (DialogClose) y Escape cierran, pero si hay algo
// escrito o marcado sin guardar, antes preguntan «¿Desea cerrar?» (Cerrar / Seguir editando).
// Los cambios se notan solos: un campo en el que se escribió o un control que se marcó y que SIGUE en la ventana.
// Así, cuando el formulario se cambia por «Listo, enviado» (los campos desaparecen), cerrar ya no pregunta.
// Para decidirlo a mano: <Dialog hayCambios={…}> o useCambiosDialogo().limpiar() cuando lo hecho ya quedó guardado.
// Un cierre por código (setAbierto(false) tras guardar) no pregunta: solo los cierres que pide la persona.
type Guardia = { marcar: (el: Element) => void; limpiar: () => void }
const GuardiaDialogo = React.createContext<Guardia | null>(null)

/** Dentro de una ventana: `limpiar()` cuando lo escrito ya quedó guardado (la X ya no pregunta). */
export function useCambiosDialogo(): Pick<Guardia, "limpiar"> {
  return React.useContext(GuardiaDialogo) ?? { limpiar: () => {} }
}

export const PREGUNTA_CERRAR = {
  titulo: "¿Desea cerrar?",
  texto: "Se perderán los cambios que no ha guardado.",
  accion: "Cerrar",
  cancelar: "Seguir editando",
  peligro: true,
} as const

function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  hayCambios,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root> & {
  /** true: siempre pregunta al cerrar; false: nunca; sin indicar: pregunta si queda algo escrito o marcado. */
  hayCambios?: boolean
}) {
  const [interno, setInterno] = React.useState(defaultOpen ?? false)
  const controlado = open !== undefined
  const abierto = controlado ? open : interno
  const tocados = React.useRef(new Set<Element>())
  const preguntando = React.useRef(false)

  // Cada vez que se abre empieza limpia; al cerrar, se revisa que la página no quede sin clics
  React.useEffect(() => {
    instalarGuardian()
    if (abierto) {
      tocados.current.clear()
      return
    }
    const t = setTimeout(destrabarPagina, 500)
    return () => clearTimeout(t)
  }, [abierto])

  const cambiar = React.useCallback(
    async (v: boolean) => {
      const sucio = [...tocados.current].some((el) => el.isConnected)
      if (!v && (hayCambios ?? sucio)) {
        if (preguntando.current) return
        preguntando.current = true
        const si = await confirmar(PREGUNTA_CERRAR)
        preguntando.current = false
        if (!si) return
      }
      if (!controlado) setInterno(v)
      onOpenChange?.(v)
    },
    [hayCambios, controlado, onOpenChange]
  )

  const guardia = React.useMemo<Guardia>(
    () => ({ marcar: (el) => { tocados.current.add(el) }, limpiar: () => { tocados.current.clear() } }),
    []
  )

  return (
    <GuardiaDialogo.Provider value={guardia}>
      <DialogPrimitive.Root data-slot="dialog" open={abierto} onOpenChange={cambiar} {...props} />
    </GuardiaDialogo.Provider>
  )
}

// ─── Nunca una app trabada (Cesar, 12-nov: tras «Abrir WhatsApp» o «Ver cómo lo verá» en otra ventana y cerrar el
// diálogo, ya no abría ningún otro y había que reiniciar) ───
// Mientras una ventana está abierta, Radix pone pointer-events:none en <body> y lo quita al desmontarla. Si ese
// paso se pierde (la app pierde el foco por otra ventana, una animación de salida que no termina), todo queda
// muerto a los clics. Guardián único: al cerrar, al volver el foco y ante cualquier clic, si no queda ninguna
// ventana ni menú abierto, se le devuelven los clics a la página.
const ABIERTOS = '[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"],[role="menu"][data-state="open"],[role="listbox"][data-state="open"]'
export function destrabarPagina() {
  if (typeof document === "undefined") return
  if (document.body.style.pointerEvents === "none" && !document.querySelector(ABIERTOS)) {
    document.body.style.pointerEvents = ""
  }
}
let guardianInstalado = false
function instalarGuardian() {
  if (guardianInstalado || typeof window === "undefined") return
  guardianInstalado = true
  window.addEventListener("focus", () => setTimeout(destrabarPagina, 50))
  document.addEventListener("visibilitychange", () => setTimeout(destrabarPagina, 50))
  // Con <body> sin clics, el clic llega a <html>: se destraba y el siguiente clic ya funciona
  document.addEventListener("pointerdown", destrabarPagina, true)
}

// Lo que cuenta como cambio: escribir en un campo o marcar un control. Un buscador (type=search) o lo que esté
// dentro de [data-sin-cambios] no cuenta. Una opción de lista desplegable se va al elegirla: cuenta la ventana entera.
const CONTROLES = '[role="checkbox"],[role="radio"],[role="switch"],[role="option"],[role="menuitemcheckbox"],[role="menuitemradio"],[aria-pressed]'
function cambioEn(t: EventTarget | null, tipo: "escribir" | "elegir", ventana: Element): Element | null {
  if (!(t instanceof Element) || t.closest("[data-sin-cambios]")) return null
  if (tipo === "escribir") return t instanceof HTMLInputElement && t.type === "search" ? null : t
  const control = t.closest(CONTROLES)
  if (!control) return null
  return control.getAttribute("role")?.startsWith("option") || control.getAttribute("role")?.startsWith("menuitem") ? ventana : control
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:pointer-events-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  cerrarAlTocarFuera = false,
  onInteractOutside,
  onInputCapture,
  onChangeCapture,
  onClickCapture,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  /** Solo para ventanas sin formulario (p. ej. el buscador): un clic afuera la cierra. */
  cerrarAlTocarFuera?: boolean
}) {
  const guardia = React.useContext(GuardiaDialogo)
  const marcar = (e: React.SyntheticEvent<HTMLDivElement>, tipo: "escribir" | "elegir") => {
    const el = cambioEn(e.target, tipo, e.currentTarget)
    if (el) guardia?.marcar(el)
  }
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 outline-none data-[state=closed]:pointer-events-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg",
          className
        )}
        onInteractOutside={(e) => {
          onInteractOutside?.(e)
          if (!cerrarAlTocarFuera) e.preventDefault()
        }}
        onInputCapture={(e) => { onInputCapture?.(e); marcar(e, "escribir") }}
        onChangeCapture={(e) => { onChangeCapture?.(e); marcar(e, "escribir") }}
        onClickCapture={(e) => { onClickCapture?.(e); marcar(e, "elegir") }}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            title="Cerrar"
            className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Cerrar</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Cerrar</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
