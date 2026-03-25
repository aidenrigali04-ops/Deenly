import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "#f4f5f7",
        surface: "#ffffff",
        card: "#ffffff",
        accent: "#000000",
        text: "#111111",
        muted: "#6b7280"
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
