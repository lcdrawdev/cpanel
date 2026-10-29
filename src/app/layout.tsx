import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: PRODUCT_NAME, template: `%s · ${PRODUCT_NAME}` },
  description: "Painel administrativo de dispositivos, playlists e códigos de ativação.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Browser extensions (e.g. one that adds gan-extension-id, Grammarly) write attributes on <html>/<body>
  // before React loads; suppressHydrationWarning ignores those, and only on these two tags.
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
