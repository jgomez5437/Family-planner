import type { Metadata, Viewport } from "next";
import { PwaProvider } from "@/components/pwa/PwaContext";
import { ThemeProvider } from "@/components/ThemeContext";
import { THEME_COLORS, THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  applicationName: "Family Planner",
  title: "Family Planner — Schedule, Medications, Tasks & Family Wall",
  description:
    "Full-stack family organizer for events, tasks, child medication schedules, printable caregiver sheets, and a private family wall.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Family Planner",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <PwaProvider>{children}</PwaProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
