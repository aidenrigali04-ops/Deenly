import "./globals.css";
import { Urbanist } from "next/font/google";
import { Providers } from "@/components/providers";
import { ReliabilityBanner } from "@/components/reliability-banner";
import { AppShell } from "@/components/app-shell";
import { Analytics } from "@vercel/analytics/next";

/** Matches Figma “Social Media App UI” primary typeface (global for light + dark shells). */
const urbanist = Urbanist({
  subsets: ["latin"],
  variable: "--font-urbanist",
  display: "swap",
  weight: ["400", "500", "600", "700"]
});

export const metadata = {
  title: "Deenly",
  description: "Muslim-first social platform"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={urbanist.variable}>
      <body>
        <Providers>
          <ReliabilityBanner />
          <AppShell>{children}</AppShell>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
