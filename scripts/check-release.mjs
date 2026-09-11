#!/usr/bin/env node
// Guards the two things a tag pipeline can get wrong that npm cannot take back
// afterwards: publishing a version the tag does not name, and uploading to a
// registry the job holds no credentials for.
//
// Run from the workspace root, with the tag as its only argument:
//   node scripts/check-release.mjs v0.1.0
import { execFileSync } from "node:child_process";

const tag = process.argv[2];
if (!tag) {
  console.error("usage: check-release.mjs <tag>");
  process.exit(2);
}

const version = tag.replace(/^v/, "");
const registry = `${process.env.CI_API_V4_URL}/projects/${process.env.CI_PROJECT_ID}/packages/npm/`;

// Asking npm rather than reading package.json keeps this correct if the
// `workspaces` array ever grows a glob.
const packages = JSON.parse(
  execFileSync(
    "npm",
    ["pkg", "get", "version", "publishConfig.registry", "--workspaces"],
    { encoding: "utf8" },
  ),
);

const problems = [];
for (const [name, pkg] of Object.entries(packages)) {
  if (pkg.version !== version) {
    problems.push(`${name}: version is ${pkg.version}, tag ${tag} says ${version}`);
  }
  // npm ignores this field for a scoped package — `@skema:registry` wins, and
  // the job passes this very URL on the command line instead. Checked anyway,
  // so a manifest cannot quietly name a different project than the one the
  // release actually uploads to.
  if (pkg["publishConfig.registry"] !== registry) {
    problems.push(
      `${name}: publishConfig.registry is ${pkg["publishConfig.registry"]}, this project is ${registry}`,
    );
  }
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}

console.log(`${Object.keys(packages).join(", ")} — version ${version}, registry ok`);
