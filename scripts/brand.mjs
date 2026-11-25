import { readFileSync, writeFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8"),
  brand = JSON.parse(read("lib/brand.json"));
const pkg = JSON.parse(read("package.json"));
pkg.name = brand.slug;
pkg.repository = `https://github.com/${brand.repositoryOwner}/${brand.slug}.git`;
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
const lock = JSON.parse(read("package-lock.json"));
lock.name = lock.packages[""].name = brand.slug;
writeFileSync("package-lock.json", JSON.stringify(lock, null, 2) + "\n");
writeFileSync(
  "README.md",
  read("README.md").replace(
    /^#[^\n]*\n[\s\S]*?<!-- brand-end -->/,
    `# ${brand.name} — ${brand.descriptor}\n\n${brand.tagline}\n\n<!-- brand-end -->`,
  ),
);
