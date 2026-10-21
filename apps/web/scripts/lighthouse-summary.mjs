// Lighthouse scores of the median run per page as a Markdown table, for the CI job summary.
// Reads the manifest that `lhci autorun` writes (lighthouserc.json, upload.outputDir). Usage: node scripts/lighthouse-summary.mjs
import { readFileSync } from "node:fs";

const MIN = 90;
const runs = JSON.parse(
  readFileSync(".lighthouseci/reports/manifest.json", "utf8"),
).filter((run) => run.isRepresentativeRun);
const categories = ["performance", "accessibility", "best-practices", "seo"];
const mark = (score) => `${score < MIN ? "⚠️ " : ""}${score}`;

const lines = [
  "### Lighthouse, mobile (median of 3 runs)",
  "",
  `| Page | ${categories.join(" | ")} | First paint |`,
  `|---|${categories.map(() => "---:").join("|")}|---:|`,
];
for (const run of runs) {
  const report = JSON.parse(readFileSync(run.jsonPath, "utf8"));
  const fcp = report.audits["first-contentful-paint"].numericValue;
  const scores = categories.map((name) =>
    mark(Math.round(run.summary[name] * 100)),
  );
  lines.push(
    `| ${new URL(run.url).pathname} | ${scores.join(" | ")} | ${fcp > 1500 ? "⚠️ " : ""}${(fcp / 1000).toFixed(1)} s |`,
  );
}
lines.push(
  "",
  `Target (docs/prd/quality.md): at least ${MIN} in each category and first paint under 1.5 s. A warning for now, not a failed check.`,
);
console.log(lines.join("\n"));
