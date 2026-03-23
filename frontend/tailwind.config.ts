import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "#0b1020",
        surface: "#141b2f",
        card: "#1b243a",
        accent: "#57c3a7",
        text: "#e6edf7",
        muted: "#95a5bd"
      },
      boxShadow: {
        soft: "0 10px 30px rgba(0,0,0,0.2)"
      }
    }
  },
  plugins: []
};

export default config;
