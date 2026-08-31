import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kâr Görseli Üretici",
  description:
    "Hisse, lot ve maliyet parametrelerinden şablonlu kâr/zarar görselleri üretir ve PNG olarak indirir.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
