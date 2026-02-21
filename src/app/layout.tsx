import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastContextProvider, Toaster } from "@/components/ui/toast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Magnetiko — Shader Studio",
  description: "No-code shader studio powered by WebGPU",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <ToastContextProvider>
          {children}
          <Toaster />
        </ToastContextProvider>
      </body>
    </html>
  );
}
