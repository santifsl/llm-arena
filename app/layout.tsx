import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Archivo, JetBrains_Mono, Literata } from "next/font/google";
import { Suspense } from "react";

import { AnalyticsListener } from "@/features/analytics/analytics-listener";
import { ThemeProvider } from "@/features/shell/theme-provider";

import "./globals.css";

// Signage and every piece of UI chrome. The width axis is loaded because the
// widened cut is what `.signage` uses to name and score things.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

// Model answers, and nothing else in the app.
const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
});

// Every measured number.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LLM Arena",
  description:
    "Send one prompt to up to three models at once, watch them answer, and vote for the best one.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme class is written by a script before hydration, so the server's
    // markup is expected to differ on this one element.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${archivo.variable} ${literata.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <ClerkProvider>
            {/* Reads search params, so it needs a boundary to keep the rest of
                the page static. It renders nothing. */}
            <Suspense fallback={null}>
              <AnalyticsListener />
            </Suspense>
            {children}
          </ClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
