import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { SettingsProvider } from "@/lib/settings";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bharat Vyapar 3D: Indian Business Board Game",
  description: "Travel a ring of 40 Indian cities, buy and build properties, collect rent, trade and bankrupt your rivals. 2 to 4 players, offline vs AI or online.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#140b2b",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SettingsProvider>{children}</SettingsProvider>
      </body>
    </html>
  );
}
