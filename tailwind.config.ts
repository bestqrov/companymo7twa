import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#18181b",
          raised: "#27272a",
          border: "#3f3f46",
        },
        accent: {
          DEFAULT: "#a3e635",
        },
      },
    },
  },
  plugins: [],
};

export default config;
