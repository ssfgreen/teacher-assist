import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#0f1729",
          800: "#1b2740",
          700: "#34425e",
          600: "#56637e",
        },
        paper: {
          50: "#f7faff",
          100: "#f1f5fb",
          200: "#e8eef6",
          300: "#e1e8f0",
          400: "#c9d4e2",
        },
        surface: {
          app: "#f3f7ff",
          main: "#ffffffd9",
          sidebar: "#ffffffbf",
          panel: "#ffffff",
          muted: "#ffffffa6",
          selected: "#2664eb1a",
          input: "#ffffffe6",
          overlay: "#0f172966",
        },
        accent: {
          100: "#2664eb14",
          500: "#2664eb",
          600: "#134DCB",
          700: "#134DCB",
        },
        danger: {
          50: "#fff1f2",
          500: "#dd4d5a",
          700: "#9a2f3a",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
        body: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
