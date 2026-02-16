import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import { Navbar } from "@/components/layout/navbar";
import { PageTransition } from "@/components/layout/page-transition";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Terra Capital | Tokenizacion Agro en Stellar",
  description:
    "Plataforma legal-tecnologica para tokenizar tierra, cultivos y activos productivos con fideicomiso y Stellar.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${sora.variable} ${manrope.variable} min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)] antialiased`}>
        <AppProviders>
          <Navbar />
          <PageTransition>{children}</PageTransition>
        </AppProviders>
      </body>
    </html>
  );
}

