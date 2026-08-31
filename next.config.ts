import type { NextConfig } from "next";

/**
 * GitHub Pages alt yolda yayinlaniyor (.../kargorseli/), bu yuzden basePath
 * gerekiyor. Yerel gelistirmede bos kalir ki `npm run dev` kokte calissin.
 * Workflow build sirasinda NEXT_PUBLIC_BASE_PATH=/kargorseli veriyor.
 *
 * trailingSlash onemli: sablonlar "templates/manifest.json" gibi goreli
 * yollarla cekiliyor. Adres /kargorseli/ seklinde bitmezse goreli yol
 * /templates/... olarak cozulur ve 404 verir.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  basePath,
  trailingSlash: true,
};

export default nextConfig;
