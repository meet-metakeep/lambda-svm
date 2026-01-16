import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Solana Lambda Test",
  description: "Test USDC transfer using Lambda sponsor wallet on Solana Devnet",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Load MetaKeep SDK from CDN */}
        <Script 
          src="https://cdn.jsdelivr.net/npm/metakeep@2.2.8/lib/index.js"
          integrity="sha256-dVJ6hf8zqdtHxHJCDJnLAepAyCCbu6lCXzZS3lqMIto="
          crossOrigin="anonymous"
          strategy="beforeInteractive"
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
