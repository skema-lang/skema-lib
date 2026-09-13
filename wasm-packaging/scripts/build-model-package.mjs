#!/usr/bin/env node
// Regenerates the @skema/model package from the wasm-bindgen output.
//
//   node scripts/fetch-artifact.mjs v0.3.2   # → ./pkg
//   node scripts/build-model-package.mjs 0.3.2
//
// Only the model types come across. The generated file also declares the wasm
// entry points, which are a browser's way in: leaving them in an ambient
// declaration would let a value import compile and then fail at runtime. Its
// loader types go the same way — `InitOutput` carries `__wbindgen_malloc` and
// the rest of the module's internals, which say nothing about the model and
// have no meaning to a consumer that never instantiates the wasm.
//
// The version is a required argument, not read from a `Cargo.toml` this repo
// does not have: it names the skema-lang release `./pkg` was fetched from
// (brain/tasks/10-move-npm-packaging-out-of-skema-lang.md), and the two must
// always agree.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "./lib/wasm-dts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = process.env.SKEMA_WASM_DTS ?? join(root, "pkg", "skema_wasm.d.ts");
const packageDir = join(root, "npm", "model");

const version = (process.argv[2] ?? "").replace(/^v/, "");
if (!version) {
  console.error("usage: build-model-package.mjs <version>  (e.g. 0.3.2 or v0.3.2)");
  process.exit(2);
}

if (!existsSync(source)) {
  console.error(`No generated bindings at ${source}`);
  console.error(`Fetch them first: node scripts/fetch-artifact.mjs v${version}`);
  process.exit(1);
}

const { modelTypes } = parse(readFileSync(source, "utf8"));

const header = `// Generated from skema-lang's crates/skema-wasm by
// wasm-packaging/scripts/build-model-package.mjs.
// Do not edit: these are skema-api's own structures, serialized by the same
// serde derives that produce the WASM and \`skema/model\` payloads.

`;

writeFileSync(
  join(packageDir, "index.d.ts"),
  header + modelTypes.map((type) => type.text).join("\n\n") + "\n",
);

// The checked-in manifest is a template without a version: it is stamped here
// so that the number can only ever come from the release being packaged.
// `...rest` first: a stray "version" surviving in the template must not win
// the object-spread override.
const { name, ...rest } = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
writeFileSync(
  join(packageDir, "package.json"),
  `${JSON.stringify({ ...rest, name, version }, null, 2)}\n`,
);

console.log(`Wrote npm/model at ${version} (${modelTypes.length} types)`);
