import type { NextConfig } from "next";

/**
 * Site Vercel'de kokte yayinlaniyor, basePath bos kaliyor. Alt yolda bir yere
 * (ornegin GitHub Pages) kurulacaksa NEXT_PUBLIC_BASE_PATH verilir; sablon ve
 * /api yollari bu oneki kullaniyor.
 *
 * Not: `output: "export"` kaldirildi. Telegram girisi ve kanal loglari
 * app/api altindaki route handler'larda calisiyor; statik export bunlari
 * derlemez. Statik bir kopya gerekirse giris kapisi da devre disi kalir.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  basePath,
};

export default nextConfig;
