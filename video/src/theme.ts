import { loadFont as anton } from "@remotion/google-fonts/Anton";
import { loadFont as geist } from "@remotion/google-fonts/GeistMono";
import { loadFont as manrope } from "@remotion/google-fonts/Manrope";

// Same type and colors as the app (apps/dashboard/app/globals.css).
export const DISPLAY = anton("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;
export const SANS = manrope("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] }).fontFamily;
export const MONO = geist("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily;

export const C = {
  ink: "#0d0c14",
  ink2: "#16141f",
  ink3: "#201d2c",
  paper: "#f6f4fb",
  dim: "#a19eb4",
  line: "rgba(246,244,251,0.1)",
  zec: "#f4b728",
  thor: "#2ed8b6",
  violet: "#8a7cf8",
  pink: "#f472b6",
  orange: "#ff8a3d",
};

export const FPS = 30;
