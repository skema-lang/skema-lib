#!/usr/bin/env node
// Writes the child pipeline that hands released versions down to the apps: one
// `trigger:` job per app, carrying them as SKEMA_VERSIONS. Generated because the
// versions exist only once a publish job has run, and GitLab expands no
// job-computed value into a `trigger:` job.
//
//   node scripts/handoff.mjs @skema/model@0.2.1 @skema/wasm@0.2.1 skema-lsp@0.2.1 > handoff.yml
const CONSUMERS = ["skema-language/skema-editor", "skema-language/skema-vscode"];

const versions = process.argv.slice(2).join(" ").trim();

const handoffJobs = Object.fromEntries(
  CONSUMERS.map((project) => [
    project.split("/").pop(),
    {
      trigger: { project, branch: "main", strategy: "depend" },
      variables: { SKEMA_VERSIONS: versions },
    },
  ]),
);

// A child pipeline must have at least one job.
const idleJob = { "nothing-to-hand-down": { image: "busybox:latest", script: ["echo No new versions."] } };

// JSON is YAML, so no YAML library is needed.
process.stdout.write(`${JSON.stringify(versions ? handoffJobs : idleJob, null, 2)}\n`);
