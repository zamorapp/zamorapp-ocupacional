import type { Icono } from "@/lib/dietas";

// Dibujos planos y simples para las hojas que se entregan al trabajador: se entienden de un vistazo, también en
// blanco y negro. «no»: tachado en rojo (lo que debe evitar).
const DIBUJOS: Record<Icono, React.ReactNode> = {
  verduras: (
    <>
      <path d="M24 44V28" stroke="#5c8a3a" strokeWidth="4" strokeLinecap="round" />
      <path d="M24 34l-6-6M24 32l6-6" stroke="#5c8a3a" strokeWidth="3" strokeLinecap="round" />
      <circle cx="16" cy="20" r="8" fill="#3f9d5a" /><circle cx="32" cy="20" r="8" fill="#3f9d5a" />
      <circle cx="24" cy="13" r="9" fill="#4fb36a" /><circle cx="24" cy="23" r="7" fill="#3a8f52" />
    </>
  ),
  pescado: (
    <>
      <path d="M6 24c8-12 24-12 32 0-8 12-24 12-32 0z" fill="#5b9bd5" />
      <path d="M36 24l8-8v16z" fill="#4a86c0" />
      <circle cx="14" cy="22" r="2" fill="#fff" />
      <path d="M22 18c2 4 2 8 0 12" stroke="#cfe3f5" strokeWidth="2" fill="none" />
    </>
  ),
  fruta: (
    <>
      <path d="M24 14c-10-6-20 2-17 14 2 9 9 16 17 13 8 3 15-4 17-13 3-12-7-20-17-14z" fill="#e0483e" />
      <path d="M24 14c0-4 1-7 3-9" stroke="#6b4423" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M26 10c4-5 10-4 11-2-3 3-8 4-11 2z" fill="#4fb36a" />
      <ellipse cx="15" cy="22" rx="3" ry="5" fill="#f28b82" />
    </>
  ),
  agua: (
    <>
      <path d="M12 8h24l-3 34H15z" fill="#eaf4fb" stroke="#7fb3d9" strokeWidth="2" />
      <path d="M13.6 20h20.8l-1.8 21H15.4z" fill="#7fc4ef" />
      <path d="M20 26c0 2 2 3 2 5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  sal: (
    <>
      <path d="M16 18h16v24H16z" fill="#f2f2f2" stroke="#8a9a98" strokeWidth="2" />
      <path d="M17 10h14l1 8H16z" fill="#b8c2c0" />
      <circle cx="21" cy="13" r="1.3" fill="#555" /><circle cx="27" cy="13" r="1.3" fill="#555" />
      <text x="24" y="35" textAnchor="middle" fontSize="11" fontWeight="800" fill="#8a9a98">S</text>
    </>
  ),
  refresco: (
    <>
      <path d="M20 6h8v6c4 3 5 6 5 10v20H15V22c0-4 1-7 5-10z" fill="#7a3b1e" />
      <path d="M15 24h18v8H15z" fill="#e0483e" />
      <path d="M20 4h8v3h-8z" fill="#c9302c" />
    </>
  ),
  azucar: (
    <>
      <path d="M10 20l10-5 10 5v12l-10 5-10-5z" fill="#fafafa" stroke="#b8c2c0" strokeWidth="2" />
      <path d="M10 20l10 5 10-5M20 25v12" stroke="#b8c2c0" strokeWidth="2" fill="none" />
      <path d="M22 12l8-4 8 4v9l-8 4-8-4z" fill="#fff" stroke="#c9d1cf" strokeWidth="2" />
    </>
  ),
  arepa: (
    <>
      <ellipse cx="24" cy="26" rx="18" ry="14" fill="#f1d9a0" stroke="#d9b56a" strokeWidth="2" />
      <circle cx="17" cy="23" r="2" fill="#c9974a" /><circle cx="29" cy="30" r="2" fill="#c9974a" /><circle cx="27" cy="20" r="1.5" fill="#c9974a" />
    </>
  ),
  huevo: (
    <>
      <path d="M24 6c-9 0-15 14-15 22a15 15 0 0030 0c0-8-6-22-15-22z" fill="#fff" stroke="#c9d1cf" strokeWidth="2" />
      <circle cx="24" cy="29" r="7" fill="#f6b93b" />
    </>
  ),
  rinon: (
    <>
      <path d="M30 8c-10-2-20 6-20 17s9 18 18 15c5-2 4-7 0-9-3-2-3-6 0-8 5-3 7-14 2-15z" fill="#b5523b" />
      <path d="M26 22c4 0 8 2 10 6" stroke="#e8a090" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  ),
  reloj: (
    <>
      <circle cx="24" cy="25" r="17" fill="#fff" stroke="#2f7d6a" strokeWidth="3" />
      <path d="M24 14v11l7 5" stroke="#15201e" strokeWidth="3" strokeLinecap="round" fill="none" />
    </>
  ),
  balanza: (
    <>
      <rect x="8" y="14" width="32" height="28" rx="6" fill="#e6eceb" stroke="#8a9a98" strokeWidth="2" />
      <path d="M15 24a9 9 0 0118 0z" fill="#fff" stroke="#8a9a98" strokeWidth="1.5" />
      <path d="M24 24l4-6" stroke="#e0483e" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  aceite: (
    <>
      <path d="M20 4h8v8c5 3 7 7 7 12v18H13V24c0-5 2-9 7-12z" fill="#c6d36b" stroke="#8a9a3a" strokeWidth="2" />
      <ellipse cx="24" cy="32" rx="5" ry="6" fill="#6f8a2e" />
    </>
  ),
  granos: (
    <>
      <path d="M6 24h36c0 10-8 16-18 16S6 34 6 24z" fill="#d9b56a" />
      <ellipse cx="16" cy="22" rx="3" ry="2" fill="#5a2d1a" /><ellipse cx="24" cy="20" rx="3" ry="2" fill="#5a2d1a" />
      <ellipse cx="31" cy="22" rx="3" ry="2" fill="#7a3b1e" /><ellipse cx="20" cy="24" rx="3" ry="2" fill="#7a3b1e" /><ellipse cx="28" cy="24" rx="3" ry="2" fill="#5a2d1a" />
    </>
  ),
  leche: (
    <>
      <path d="M14 8h20l-2 34H16z" fill="#fff" stroke="#9cc3df" strokeWidth="2" />
      <path d="M14.6 16h18.8l-1.4 25H16z" fill="#f7f9fb" />
      <path d="M15 16c3 2 6-2 9 0s6 2 9 0" stroke="#9cc3df" strokeWidth="1.5" fill="none" />
    </>
  ),
  corazon: (
    <>
      <path d="M24 42S6 31 6 18a9 9 0 0118-3 9 9 0 0118 3c0 13-18 24-18 24z" fill="#e0483e" />
      <path d="M10 24h8l3-6 4 12 3-6h10" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" fill="none" />
    </>
  ),
  caminar: (
    <>
      <circle cx="27" cy="8" r="4" fill="#2f7d6a" />
      <path d="M26 14l-4 12 6 6v10M22 26l-6 16M25 16l8 6M24 16l-8 4-2 6" stroke="#2f7d6a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  pastilla: (
    <>
      <rect x="6" y="18" width="36" height="14" rx="7" fill="#fff" stroke="#2f7d6a" strokeWidth="3" />
      <path d="M24 18v14" stroke="#2f7d6a" strokeWidth="3" />
      <path d="M8.5 25a5.5 5.5 0 015.5-5.5h10v11H14a5.5 5.5 0 01-5.5-5.5z" fill="#5b9bd5" />
      <circle cx="34" cy="40" r="5" fill="#f2c94c" /><circle cx="14" cy="9" r="4" fill="#f28b82" />
    </>
  ),
  cigarro: (
    <>
      <rect x="4" y="26" width="32" height="8" rx="1.5" fill="#fff" stroke="#6b4423" strokeWidth="2" />
      <rect x="4" y="26" width="9" height="8" rx="1.5" fill="#e8a25a" />
      <rect x="36" y="26" width="6" height="8" rx="1" fill="#e0483e" />
      <path d="M40 22c-3-4 3-6 0-10M44 22c-3-4 3-6 0-10" stroke="#9aa7a4" strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
  alcohol: (
    <>
      <path d="M12 8h16l-2 14a6 6 0 01-12 0z" fill="#fff" stroke="#6b4423" strokeWidth="2.5" />
      <path d="M13.5 14h13l-1.2 8a5 5 0 01-10.6 0z" fill="#b5413a" />
      <path d="M20 28v12M14 41h12" stroke="#6b4423" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="32" y="14" width="10" height="28" rx="3" fill="#7a5a2a" /><rect x="34.5" y="7" width="5" height="9" rx="1.5" fill="#7a5a2a" />
    </>
  ),
  cama: (
    <>
      <path d="M4 40V16M4 32h40v8" stroke="#2f7d6a" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="7" y="24" width="10" height="7" rx="3" fill="#cfe5e1" />
      <path d="M17 24h24a3 3 0 013 3v5H17z" fill="#5b9bd5" />
      <path d="M30 6h7l-7 8h7" stroke="#0f6f68" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  embutido: (
    <>
      <path d="M8 30c0-10 8-18 18-18h4c6 0 10 4 10 10s-4 10-10 10H10a2 2 0 01-2-2z" fill="#c0504d" />
      <circle cx="18" cy="22" r="2" fill="#f2c4b8" /><circle cx="26" cy="26" r="1.8" fill="#f2c4b8" /><circle cx="32" cy="19" r="1.6" fill="#f2c4b8" />
      <path d="M40 22c3 0 4 2 5 4" stroke="#6b4423" strokeWidth="2" fill="none" strokeLinecap="round" />
      <rect x="10" y="36" width="20" height="8" rx="2" fill="#9aa7a4" /><rect x="12" y="38" width="16" height="4" rx="1" fill="#fff" />
    </>
  ),
  hierbas: (
    <>
      <path d="M14 44V22M14 30l-6-6M14 26l6-6" stroke="#3f9d5a" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="8" cy="22" rx="4" ry="6" fill="#4fb36a" transform="rotate(-40 8 22)" /><ellipse cx="20" cy="18" rx="4" ry="6" fill="#4fb36a" transform="rotate(40 20 18)" />
      <circle cx="31" cy="34" r="9" fill="#f3efe4" stroke="#9a8a6a" strokeWidth="2" /><path d="M31 25c-1-4 1-7 3-8" stroke="#3f9d5a" strokeWidth="2" fill="none" />
      <circle cx="38" cy="14" r="7" fill="#f2c94c" /><path d="M38 9v10M33 14h10" stroke="#e0b030" strokeWidth="1.5" />
    </>
  ),
  frito: (
    <>
      <ellipse cx="22" cy="30" rx="18" ry="7" fill="#3a3f3e" /><path d="M40 30h7" stroke="#3a3f3e" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="22" cy="28" rx="15" ry="4.5" fill="#e8a25a" />
      <path d="M14 22l-2-5M22 20v-6M30 22l2-5" stroke="#e0b030" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="10" cy="14" r="1.8" fill="#e0b030" /><circle cx="34" cy="12" r="1.8" fill="#e0b030" />
    </>
  ),
  plancha: (
    <>
      <rect x="4" y="22" width="40" height="18" rx="3" fill="#3a3f3e" />
      <path d="M10 22v18M18 22v18M26 22v18M34 22v18" stroke="#5b605f" strokeWidth="2" />
      <ellipse cx="24" cy="21" rx="13" ry="5" fill="#d9b48a" stroke="#8a5a2a" strokeWidth="1.5" />
      <path d="M17 21l4-3M24 22l4-3M30 21l3-2" stroke="#8a5a2a" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 12c-2-3 2-4 0-7M28 12c-2-3 2-4 0-7" stroke="#9aa7a4" strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
  manteca: (
    <>
      <path d="M6 32l8-12h28v12z" fill="#f6e08a" stroke="#c9a52a" strokeWidth="2" strokeLinejoin="round" />
      <rect x="6" y="32" width="36" height="8" fill="#f2d35e" stroke="#c9a52a" strokeWidth="2" />
      <path d="M4 42h40" stroke="#9aa7a4" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  estomago: (
    <>
      <path d="M18 6v8c0 4-8 6-10 14-2 10 6 16 16 16 10 0 18-6 18-16 0-6-4-10-10-10-4 0-6 2-8 0V6z" fill="#f28b82" stroke="#b5413a" strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 30c4 4 12 4 18 0" stroke="#b5413a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </>
  ),
  intestino: (
    <>
      <rect x="6" y="8" width="36" height="34" rx="10" fill="none" stroke="#e0827a" strokeWidth="5" />
      <path d="M14 18h18M14 26h20M14 34h16" stroke="#f2a59d" strokeWidth="4.5" strokeLinecap="round" />
    </>
  ),
  gota: (
    <>
      <path d="M6 40c0-6 4-10 10-12l16-4c6-1 10 2 10 6v6c0 3-2 6-6 6H8a2 2 0 01-2-2z" fill="#f6e3d4" stroke="#8a5a3a" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="36" cy="30" r="6" fill="#e0483e" fillOpacity=".75" />
      <path d="M36 18l2-6M42 22l5-3M30 20l-2-6" stroke="#e0483e" strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  higado: (
    <>
      <path d="M4 22c4-10 18-12 30-10 8 1 10 6 8 10-3 6-8 6-12 10-4 4-8 8-14 6-8-3-14-8-12-16z" fill="#a0522d" />
      <path d="M26 14c-2 8-2 14 2 22" stroke="#7a3a1d" strokeWidth="2" fill="none" />
      <circle cx="14" cy="22" r="2.5" fill="#f2c94c" /><circle cx="20" cy="28" r="2" fill="#f2c94c" /><circle cx="34" cy="20" r="2" fill="#f2c94c" />
    </>
  ),
  sol: (
    <>
      <circle cx="24" cy="24" r="9" fill="#f2c94c" />
      <path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.5 10.5l4.2 4.2M33.3 33.3l4.2 4.2M10.5 37.5l4.2-4.2M33.3 14.7l4.2-4.2" stroke="#e8833a" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
};

export function IconoSalud({ icono, no, className = "size-[12mm]" }: { icono: Icono; no?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={`shrink-0 ${className}`} aria-hidden>
      {DIBUJOS[icono]}
      {no && (
        <>
          <circle cx="24" cy="24" r="20" fill="none" stroke="#c62828" strokeWidth="4" />
          <path d="M10 10l28 28" stroke="#c62828" strokeWidth="4" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
