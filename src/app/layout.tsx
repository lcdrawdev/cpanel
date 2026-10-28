import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: PRODUCT_NAME, template: `%s · ${PRODUCT_NAME}` },
  description: "Painel administrativo de dispositivos, playlists e códigos de ativação.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
