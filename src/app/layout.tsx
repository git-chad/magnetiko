import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { ToastContextProvider, Toaster } from "@/components/ui/toast";
import { ThemeProvider, COOKIE_NAME } from "@/components/ui/theme-provider";

export const metadata: Metadata = {
  title: "Magnetiko — Shader Studio",
  description: "No-code shader studio powered by WebGPU",
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
