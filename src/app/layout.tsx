import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ArwaTube AI Engine",
  description: "AI Creator Suite for planning, writing, and repurposing video content.",
};

// Runs before paint to avoid a flash of the wrong theme: applies the stored
// preference if one exists, otherwise falls back to the OS-level light/dark
// preference. Must stay a plain inline script (not a useEffect) since it
// needs to run before the page renders, not after React hydrates.
const THEME_INIT_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem('theme');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
