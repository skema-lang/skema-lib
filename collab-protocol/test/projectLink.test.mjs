import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateSync, strToU8 } from "fflate";
import {
  MAX_PROJECT_BYTES,
  MAX_PROJECT_TOKEN_LENGTH,
  PROJECT_FRAGMENT_KEY,
  decodeProjectLink,
  encodeProjectLink,
} from "../dist/index.js";
import { toBase64Url } from "../dist/base64url.js";

const tokenOf = (value) => toBase64Url(deflateSync(strToU8(JSON.stringify(value))));
const project = { rootPath: "/project.skema", files: { "/project.skema": "import ./a.skema" } };

test("fragment key", () => assert.equal(PROJECT_FRAGMENT_KEY, "project"));

test("round trips a multi-file project", () => {
  const link = {
    rootPath: "/project.skema",
    files: {
      "/project.skema": "Project demo {}\nöäü €",
      "/models/user.skema": "Model User {}",
      "/models/deep/order.skema": "Model Order {}",
    },
  };
  assert.deepEqual(decodeProjectLink(encodeProjectLink(link)), link);
});

test("accepts a valid hand-built token", () => {
  assert.deepEqual(decodeProjectLink(tokenOf(project)), project);
});

test("rejects structural problems", () => {
  const bad = [
    null,
    [],
    "text",
    {},
    { files: project.files },
    { rootPath: "/project.skema" },
    { rootPath: "/project.skema", files: [] },
    { rootPath: 1, files: project.files },
    { rootPath: "/other.skema", files: project.files },
    { rootPath: "/project.skema", files: { "/project.skema": 1 } },
    { rootPath: "/project.skema", files: { "/project.skema": null } },
  ];
  for (const value of bad) assert.equal(decodeProjectLink(tokenOf(value)), undefined, JSON.stringify(value));
});

test("rejects unsafe paths", () => {
  const paths = [
    "project.skema",
    "/../evil.skema",
    "/a/../evil.skema",
    "/a//b.skema",
    "/a\\..\\b.skema",
    "/a\\b.skema",
    "//a.skema",
    "/a/",
    "/a.txt",
    "/a.skema/",
    "/skema",
    "",
  ];
  for (const path of paths) {
    const files = { "/project.skema": "", [path]: "" };
    assert.equal(decodeProjectLink(tokenOf({ rootPath: "/project.skema", files })), undefined, path);
    assert.equal(decodeProjectLink(tokenOf({ rootPath: path, files })), undefined, path);
  }
});

test("rejects a token longer than the limit", () => {
  assert.equal(decodeProjectLink("A".repeat(MAX_PROJECT_TOKEN_LENGTH + 1)), undefined);
});

test("rejects an inflated size above the limit but accepts one at it", () => {
  const withSource = (length) => ({ rootPath: "/p.skema", files: { "/p.skema": "x".repeat(length) } });
  const overhead = JSON.stringify(withSource(0)).length;

  const atLimit = encodeProjectLink(withSource(MAX_PROJECT_BYTES - overhead));
  assert.ok(atLimit.length < MAX_PROJECT_TOKEN_LENGTH);
  assert.notEqual(decodeProjectLink(atLimit), undefined);

  const overLimit = encodeProjectLink(withSource(MAX_PROJECT_BYTES - overhead + 1));
  assert.equal(decodeProjectLink(overLimit), undefined);
});

test("survives an inflate bomb", () => {
  const bomb = toBase64Url(deflateSync(new Uint8Array(32 * 1024 * 1024), { level: 9 }));
  assert.ok(bomb.length < MAX_PROJECT_TOKEN_LENGTH);
  assert.equal(decodeProjectLink(bomb), undefined);
});

test("garbage returns undefined without throwing", () => {
  const garbage = ["", "!!!", "not a token", "A", "AAAA", "////", "eyJ", "A".repeat(100), "\u0000￿", toBase64Url(strToU8("plain"))];
  for (const token of garbage) assert.equal(decodeProjectLink(token), undefined, token);
});
