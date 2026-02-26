import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { ToastContextProvider, Toaster } from "@/components/ui/toast";
import { ThemeProvider, COOKIE_NAME } from "@/components/ui/theme-provider";

function resolveMetadataBase(): URL {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL ??
    "http://localhost:3000";
  const normalized =
    raw.startsWith("http://") || raw.startsWith("https://")
      ? raw
      : `https://${raw}`;
  return new URL(normalized);
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: "Magnetiko — Shader Studio",
  description: "No-code shader studio powered by WebGPU",
  openGraph: {
    title: "Magnetiko — Shader Studio",
    description: "No-code shader studio powered by WebGPU",
    images: [
      {
        url: "/og-image.png",
        width: 1760,
        height: 920,
        alt: "Magnetiko",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Magnetiko — Shader Studio",
    description: "No-code shader studio powered by WebGPU",
    images: ["/og-image.png"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const savedTheme = cookieStore.get(COOKIE_NAME)?.value;
  const theme = savedTheme === "dark" ? "dark" : "light";

  return (
    <html lang="en" className={theme} suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider defaultTheme={theme}>
          <ToastContextProvider>
            {children}
            <Toaster />
          </ToastContextProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
