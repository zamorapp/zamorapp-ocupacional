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
