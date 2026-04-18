import "./globals.css";
import { Providers } from "@/components/providers";
import { ReliabilityBanner } from "@/components/reliability-banner";
import { AppShell } from "@/components/app-shell";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "Deenly",
  description: "Muslim-first social platform"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
