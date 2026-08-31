import type { Metadata } from "next";
import LoginGate from "@/components/LoginGate";
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
      <body>
        {/* Telegram girisi yapilandirilmamissa kapi seffaftir, uygulama acik acilir. */}
        <LoginGate>{children}</LoginGate>
      </body>
    </html>
  );
}
