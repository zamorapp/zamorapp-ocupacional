import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite compilar en otra carpeta sin tocar la del servidor de desarrollo en uso
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
