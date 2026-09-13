#!/usr/bin/env node
// Publishes every given package directory whose name@version the registry does
// not have yet, tagging the commit `<name>@<version>` first - a rerun after a
// failed upload then skips the tag and retries only the upload. Prints each
// newly published `name@version` on stdout; everything else goes to stderr.
//
//   node scripts/publish.mjs diagram docs collab-protocol
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const packageDirs = process.argv.slice(2);
if (packageDirs.length === 0) {
  console.error("usage: publish.mjs <package-dir>...");
  process.exit(2);
}

const { CI_API_V4_URL, CI_PROJECT_ID } = process.env;
if (!CI_API_V4_URL || !CI_PROJECT_ID) {
  console.error("publish.mjs uploads to the CI project's registry: CI_API_V4_URL and CI_PROJECT_ID must be set.");
  process.exit(2);
}

const uploadRegistry = `${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/npm/`;
// Checked against the group endpoint, because that is what consumers install from.
const installRegistry = run("npm", "config", "get", "@skema:registry").trim();

for (const dir of packageDirs) {
  const { name, version } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const spec = `${name}@${version}`;
  if (await isPublished(name, version)) {
    console.error(`${spec} is already published`);
    continue;
  }
  tag(spec);
  // The repo's .npmrc points the scope at the read-only group endpoint, and only
  // the command line outranks it.
  process.stderr.write(run("npm", "publish", resolve(dir), `--@skema:registry=${uploadRegistry}`));
  console.log(spec);
}

async function isPublished(name, version) {
  const response = await fetch(`${installRegistry}${name.replace("/", "%2f")}`, { redirect: "manual" });
  // GitLab redirects a name it has never seen to registry.npmjs.org instead of answering 404.
  if (response.status === 404 || response.status === 302) return false;
  if (!response.ok) throw new Error(`${name}: ${installRegistry} answered ${response.status}`);
  const { versions = {} } = await response.json();
  return Object.hasOwn(versions, version);
}

function tag(spec) {
  const ref = `refs/tags/${spec}`;
  if (run("git", "ls-remote", "origin", ref).trim()) return;
  run("git", "tag", "--annotate", spec, "--message", `chore(release): ${spec}`);
  run("git", "push", "origin", ref);
}

function run(command, ...args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}
