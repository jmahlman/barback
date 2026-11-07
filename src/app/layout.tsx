import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Barback",
    template: "%s · Barback",
  },
  description:
    "Your home bar, organised. Track what you have, keep your recipes, and find out what you can make tonight.",
  applicationName: "Barback",
  appleWebApp: {
    capable: true,
    title: "Barback",
    statusBarStyle: "black-translucent",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0b0a0c",
  width: "device-width",
  initialScale: 1,
  // Allow pinch-zoom; forbidding it is an accessibility problem.
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
