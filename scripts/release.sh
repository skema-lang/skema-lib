#!/bin/bash

# Derives the next version from conventional commits via git-cliff, writes it
# to the three workspace packages, commits, tags, and pushes. See
# brain/release-chain.md, "Release job" — this is that job.
#
#     scripts/release.sh --dry-run     # print what it would do, touch nothing
#     scripts/release.sh
#
# Environment:
#   TRIGGER_DOWNSTREAM    whether to request the tag pipeline (true or false)
#   RELEASE_TRIGGER_TOKEN ask for the tag pipeline after pushing (CI only)
#   CI_JOB_TOKEN          job-token for git push (CI only)
#   CI_SERVER_HOST        GitLab host (CI only)
#   CI_PROJECT_PATH       project path for push URL (CI only)

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

say() { printf '%s\n' "$*" >&2; }
run() {
  if [ "$DRY_RUN" = 1 ]; then say "  would run: $*"; else "$@"; fi
}

# Install git-cliff if not present
if ! command -v git-cliff &> /dev/null; then
  say "Installing git-cliff..."
  CLIFF_VERSION="2.10.1"
  CLIFF_ARCH="x86_64-unknown-linux-musl"
  CLIFF_ASSET="git-cliff-${CLIFF_VERSION}-${CLIFF_ARCH}.tar.gz"
  CLIFF_URL="https://github.com/orhun/git-cliff/releases/download/v${CLIFF_VERSION}/${CLIFF_ASSET}"

  mkdir -p /tmp/git-cliff-install
  cd /tmp/git-cliff-install
  curl -fL "$CLIFF_URL" -o "$CLIFF_ASSET"
  curl -fL "${CLIFF_URL}.sha512" -o "${CLIFF_ASSET}.sha512"
  sha512sum -c "${CLIFF_ASSET}.sha512" > /dev/null
  tar -xzf "$CLIFF_ASSET" --strip-components=1
  mkdir -p ~/.local/bin
  mv git-cliff ~/.local/bin/
  export PATH="$HOME/.local/bin:$PATH"
  cd - > /dev/null
fi

# Compute the next version using git-cliff.
NEXT=$(git-cliff --bumped-version)
say "Releasing $NEXT"

if [ "$DRY_RUN" = 1 ]; then
  say "  would set version -> ${NEXT#v} in package.json and package-lock.json"
  say "  would run: git add diagram/package.json collab-protocol/package.json docs/package.json package-lock.json"
  say "  would run: git commit -m chore(release): $NEXT"
  say "  would run: git tag -a $NEXT -m chore(release): $NEXT"
  say "  would push HEAD and $NEXT"
  exit 0
fi

# Write version to the three workspace packages and the root lock file.
VERSION="${NEXT#v}"
run npm pkg set "version=$VERSION" --workspace diagram --workspace collab-protocol --workspace docs
run npm install --package-lock-only --no-audit --fund=false

# Configure git and commit.
git config user.email "${GITLAB_USER_EMAIL:-ci@skema-language}"
git config user.name "${GITLAB_USER_NAME:-skema release}"
run git add diagram/package.json collab-protocol/package.json docs/package.json package-lock.json
run git commit -m "chore(release): $NEXT"

# Tag the release.
run git tag -a "$NEXT" -m "chore(release): $NEXT"

# Guard against a newer pipeline already releasing this commit (task 28 decision).
if [ "$CI_PIPELINE_SOURCE" = "push" ] 2>/dev/null; then
  git fetch origin main --tags
  if [ "$(git rev-parse origin/main)" != "$CI_COMMIT_SHA" ] 2>/dev/null; then
    say "A newer pipeline has committed to main; this release is superseded."
    exit 0
  fi
fi

# Push via job-token if in CI.
if [ -n "${CI_JOB_TOKEN:-}" ]; then
  git remote set-url origin "https://gitlab-ci-token:${CI_JOB_TOKEN}@${CI_SERVER_HOST}/${CI_PROJECT_PATH}.git"
fi

run git push origin "HEAD:main"
run git push origin "$NEXT"

# Request the tag pipeline with RELEASE_TRIGGER_TOKEN (JSON form per release-chain.md).
if [ -n "${RELEASE_TRIGGER_TOKEN:-}" ]; then
  TRIGGER_DOWNSTREAM="${TRIGGER_DOWNSTREAM:-true}"
  curl --fail \
    --header "Content-Type: application/json" \
    --data "{\"token\":\"${RELEASE_TRIGGER_TOKEN}\",\"ref\":\"${NEXT}\",\"inputs\":{\"trigger_downstream\":${TRIGGER_DOWNSTREAM}}}" \
    "https://${CI_SERVER_HOST}/api/v4/projects/${CI_PROJECT_ID}/pipeline" || true
fi
