#!/usr/bin/env node
/**
 * Downloads and extracts skema-lang's raw `wasm-pack` build output for one
 * release into `./pkg`, so `build-model-package.mjs`/`build-wasm-package.mjs`
 * have something to read without a Rust toolchain in this repo.
 *
 * Mirrors `skema-vscode/scripts/fetch-server.mjs`'s shape: the artifact is
 * `skema-lang`'s tag pipeline publishing `dist/skema-wasm.tar.gz` to its
 * GitLab generic package registry (`.gitlab-ci.yml`'s `build-wasm-package`
 * job there), never committed here.
 *
 *   node scripts/fetch-artifact.mjs v0.3.2
 *   SKEMA_REGISTRY=... SKEMA_PROJECT=... node scripts/fetch-artifact.mjs v0.3.2
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
if (!version) {
  console.error("usage: fetch-artifact.mjs <tag>  (e.g. v0.3.2)");
  process.exit(2);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(root, "pkg");

const host = process.env.SKEMA_REGISTRY ?? "https://gitlab.com";
const project = process.env.SKEMA_PROJECT ?? "skema-language/skema";
const url = `${host}/api/v4/projects/${encodeURIComponent(project)}/packages/generic/skema/${version}/skema-wasm.tar.gz`;

console.log(`Fetching skema-wasm.tar.gz (${version})`);
console.log(`  ${url}`);

// A private project needs a token; a public one needs none - same fallback
// order as fetch-server.mjs.
const headers = {};
if (process.env.CI_JOB_TOKEN) headers["JOB-TOKEN"] = process.env.CI_JOB_TOKEN;
else if (process.env.GITLAB_TOKEN) headers["PRIVATE-TOKEN"] = process.env.GITLAB_TOKEN;

const response = await fetch(url, { headers });
if (!response.ok) {
  console.error(`${response.status} ${response.statusText} - is ${version} tagged and published?`);
  process.exit(1);
}

rmSync(pkgDir, { recursive: true, force: true });
mkdirSync(pkgDir, { recursive: true });

const tarball = join(root, "skema-wasm.tar.gz");
writeFileSync(tarball, Buffer.from(await response.arrayBuffer()));
try {
  // No JS tar/gzip reader in Node's standard library for a directory of
  // files - shelling out to `tar` (present on every CI image and dev
  // machine this runs on) avoids a dependency for four files extracted once
  // per release.
  execFileSync("tar", ["xzf", tarball, "-C", pkgDir]);
} finally {
  rmSync(tarball);
}

console.log(`Extracted into ${pkgDir}`);
