import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VifaTube AI Engine",
  description: "AI Creator Suite for planning, writing, and repurposing video content.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
