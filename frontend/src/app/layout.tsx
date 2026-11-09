import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

// Fallbacks for Marlin Soft / Abc Favorit Mono (unlicensed here, see DESIGN.md): Inter Black + Geist Mono.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "700", "900"] });
const label = Geist_Mono({ variable: "--font-label", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Flatter — Find your people. Then your place.",
  description:
    "India-first roommate matching for students and working professionals. Find compatible flatmates before you find a property.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${label.variable} antialiased`}>
      <body className="flex min-h-screen flex-col">
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  );
}
