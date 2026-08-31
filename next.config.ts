import type { NextConfig } from "next";

/**
 * GitHub Pages alt yolda yayinlaniyor (.../kargorseli/), bu yuzden basePath
 * gerekiyor. Yerel gelistirmede ve Vercel'de bos kalir, site kokte calisir.
 * Workflow build sirasinda NEXT_PUBLIC_BASE_PATH=/kargorseli veriyor.
 *
 * Sablonlar `${NEXT_PUBLIC_BASE_PATH}/templates/...` seklinde mutlak yolla
 * cekiliyor; bu yuzden trailingSlash gibi bir ayara ihtiyac yok.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  basePath,
};

export default nextConfig;
