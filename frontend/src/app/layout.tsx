import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// DESIGN.md names Inter as the open-source substitute for proprietary Pin Sans.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Flatter — Find your people. Then your place.",
  description:
    "India-first roommate matching for students and working professionals. Find compatible flatmates before you find a property.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body className="flex min-h-screen flex-col">
        <ClerkProvider appearance={{ variables: {
          colorPrimary: "#e60023",
          colorPrimaryForeground: "#ffffff",
          colorBackground: "#ffffff",
          colorForeground: "#000000",
          colorMutedForeground: "#62625b",
          colorInput: "#ffffff",
          colorInputForeground: "#000000",
          colorDanger: "#9e0a0a",
          borderRadius: "1rem",
          fontFamily: "var(--font-inter), system-ui, sans-serif",
        } }}>{children}</ClerkProvider>
      </body>
    </html>
  );
}
