import Link from "next/link";
import type { ReactNode } from "react";
import { brand } from "../lib/config";

export default function GuideArticle({
  path,
  title,
  children,
}: {
  path: string;
  title: string;
  children: ReactNode;
}) {
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: new URL("/", brand.siteUrl).href },
      { "@type": "ListItem", position: 2, name: title, item: new URL(path, brand.siteUrl).href },
    ],
  };

  return (
    <main className="policy-page guide-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs).replace(/</g, "\\u003c") }}
      />
      <nav aria-label="Breadcrumb" className="guide-breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{title}</span>
      </nav>
      <article>
        <h1>{title}</h1>
        {children}
      </article>
    </main>
  );
}
