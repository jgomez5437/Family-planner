import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Family Planner — Schedule, Medications, Tasks & Family Wall",
  description:
    "Full-stack family organizer for events, tasks, child medication schedules, printable caregiver sheets, and a private family wall.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
