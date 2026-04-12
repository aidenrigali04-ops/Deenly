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
        text: "#1C1C1E",
        muted: "#8E8E93",
        brand: "#0A84FF",
        "brand-subtle": "rgba(10, 132, 255, 0.06)"
      },
      boxShadow: {
        soft: "0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)",
        elevated: "0 2px 8px rgba(0,0,0,0.04), 0 12px 32px rgba(0,0,0,0.08)",
        float: "0 4px 12px rgba(0,0,0,0.06), 0 20px 48px rgba(0,0,0,0.10)"
      },
      borderRadius: {
        panel: "1.5rem",
        control: "0.75rem",
        bubble: "1.25rem",
        pill: "999px"
      }
    }
  },
  plugins: []
};

export default config;
