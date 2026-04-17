import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-urbanist)", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        background: "#f4f5f7",
        surface: "#ffffff",
        card: "#ffffff",
        accent: "#000000",
        text: "#111111",
        muted: "#6b7280",
        /** Figma “Social Media App UI” — dark surfaces + gold accent */
        social: {
          bg: "#000000",
          card: "#414141",
          accent: "#feb101",
          link: "#01dcfe",
          pill: "rgba(255,255,255,0.12)",
          pillBorder: "rgba(255,255,255,0.12)"
        }
      },
      boxShadow: {
        soft: "0 8px 24px rgba(15, 23, 42, 0.08)"
      },
      borderRadius: {
        panel: "1.25rem",
        control: "0.85rem",
        pill: "999px"
      }
    }
  },
  plugins: []
};

export default config;
