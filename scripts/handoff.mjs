#!/usr/bin/env node
// Writes the child pipeline that hands released versions down to the apps: one
// `trigger:` job per app, carrying the version as an input. Generated because
// the tag exists only after the release job has run, and GitLab expands no
// job-computed value into a `trigger:` job.
//
//   node scripts/handoff.mjs skema_lib_version v0.1.2 > handoff.yml
//   node scripts/handoff.mjs skema_lang_version v0.2.3 > handoff.yml

const CONSUMERS = ["skema-language/skema-editor", "skema-language/skema-vscode"];

const inputName = process.argv[2];
const tag = process.argv[3];

if (!inputName || !tag) {
  console.error("Usage: node scripts/handoff.mjs <skema_lib_version|skema_lang_version> <tag>");
  process.exit(1);
}

if (!/^(skema_lib_version|skema_lang_version)$/.test(inputName)) {
  console.error(`Unknown input name: ${inputName}`);
  console.error("Must be 'skema_lib_version' or 'skema_lang_version'");
  process.exit(1);
}

if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error(`Invalid tag format: ${tag}. Must be vX.Y.Z`);
  process.exit(1);
}

const handoffJobs = Object.fromEntries(
  CONSUMERS.map((project) => [
    project.split("/").pop(),
    {
      trigger: { project, branch: "main", strategy: "mirror" },
      inputs: { [inputName]: tag },
    },
  ]),
);

// JSON is YAML, so no YAML library is needed.
process.stdout.write(`${JSON.stringify(handoffJobs, null, 2)}\n`);
