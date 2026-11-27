import type { Metadata } from "next";
import { brand, title } from "../lib/config";
import "@fontsource-variable/bodoni-moda/standard.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "./style.css";
export const metadata: Metadata = {
  metadataBase: new URL(brand.siteUrl),
  title: { default: title, template: "%s · " + brand.name },
  applicationName: brand.name,
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preconnect"
          href="https://cdn.fontshare.com"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
