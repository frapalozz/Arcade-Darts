import type { Metadata, Viewport } from "next";
import { Press_Start_2P, Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ['latin'],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap"
})

const pressStart = Press_Start_2P({
  variable: "--font-press-start",
  subsets: ['latin'],
  display: 'swap',
  weight: ['400']
})

export const metadata: Metadata = {
  title: "Arcade Darts",
  description: "Real-time multiplayer darts game",
  metadataBase: new URL('https://darts.palozz.com'),
  openGraph: {
    title: "Arcade Darts",
    description: "Real-time multiplayer darts game",
    siteName: "Arcade Darts"
  }
};

// Necessario per un vero layout responsive su mobile (+ colore barra del browser e area sicura del notch)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050505",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      className={`${pressStart.variable} ${spaceGrotesk.variable} font-body h-full antialiased`}
    >
      <body className="min-h-dvh w-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
