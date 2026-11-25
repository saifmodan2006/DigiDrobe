import type { Metadata } from "next";
import { brand, title } from "../lib/config";
import "./style.css";
export const metadata: Metadata = {
  title: { default: title, template: "%s · " + brand.name },
  applicationName: brand.name,
  description: brand.tagline,
  openGraph: { title, description: brand.tagline },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
