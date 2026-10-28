import { Anton, Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";

// next/font self-hosts the files at build time: the running dashboard makes no font requests.
const display = Anton({ subsets: ["latin"], weight: "400", variable: "--display" });
const sans = Manrope({ subsets: ["latin"], variable: "--sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--mono" });

export const metadata = {
  title: "shielded-lp",
  description: "Provide THORChain ZEC liquidity from shielded funds without linking your wallet to a public position.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
