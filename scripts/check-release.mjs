/**
 * Verifies that the three workspace packages (diagram, collab-protocol, docs)
 * are all published at the exact version corresponding to the given tag.
 * Exits with 1 if any check fails.
 *
 *     node scripts/check-release.mjs v0.1.2
 */
import { execSync } from "node:child_process";

const tag = process.argv[2];
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error("Usage: node scripts/check-release.mjs <tag>");
  console.error("  <tag> must be vX.Y.Z");
  process.exit(1);
}

const expectedVersion = tag.slice(1);
const projectId = "86362004"; // skema-language/skema-lib
const baseUrl = "https://gitlab.com/api/v4/projects";
const packages = ["diagram", "collab-protocol", "docs"];

let allGood = true;

for (const pkg of packages) {
  try {
    const response = execSync(
      `curl -s "${baseUrl}/${projectId}/packages?per_page=100&exclude_subgroups=true"`,
      { encoding: "utf8" },
    );
    const data = JSON.parse(response);
    const found = data.find((p) => p.name === `@skema/${pkg}` && p.version === expectedVersion);

    if (found) {
      console.log(`✓ @skema/${pkg}@${expectedVersion} published`);
    } else {
      console.error(`✗ @skema/${pkg}@${expectedVersion} not found in registry`);
      allGood = false;
    }
  } catch (e) {
    console.error(`Error checking @skema/${pkg}: ${e.message}`);
    allGood = false;
  }
}

if (!allGood) process.exit(1);
