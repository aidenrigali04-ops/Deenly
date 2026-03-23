import "./globals.css";
import { Nav } from "@/components/nav";
import { Providers } from "@/components/providers";

export const metadata = {
  title: "Deenly",
  description: "Muslim-first social platform"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Nav />
          <main className="container-shell py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
