import { Familjen_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// next/font self-hosts the files at build time: the running dashboard makes no font requests.
const sans = Familjen_Grotesk({ subsets: ["latin"], variable: "--sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--mono" });

export const metadata = {
  title: "Shielded LP",
  description: "Your private THORChain ZEC position, next to what the public sees.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
