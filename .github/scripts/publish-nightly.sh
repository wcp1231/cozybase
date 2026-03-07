#!/usr/bin/env bash

set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${GITHUB_SERVER_URL:?GITHUB_SERVER_URL is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
: "${NIGHTLY_TAG:?NIGHTLY_TAG is required}"
: "${NIGHTLY_TITLE:?NIGHTLY_TITLE is required}"
: "${NIGHTLY_ASSET:?NIGHTLY_ASSET is required}"
: "${DMG_PATH:?DMG_PATH is required}"

if [ ! -f "${DMG_PATH}" ]; then
  echo "Nightly asset not found: ${DMG_PATH}" >&2
  exit 1
fi

short_sha="${GITHUB_SHA:0:7}"
run_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
built_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
notes_file="$(mktemp)"
trap 'rm -f "${notes_file}"' EXIT

cat > "${notes_file}" <<EOF
Nightly build for \`main\`.

- Commit: \`${GITHUB_SHA}\`
- Short SHA: \`${short_sha}\`
- Built at (UTC): \`${built_at}\`
- Workflow run: ${run_url}
- Asset: \`${NIGHTLY_ASSET}\`
EOF

if gh release view "${NIGHTLY_TAG}" --repo "${GITHUB_REPOSITORY}" >/dev/null 2>&1; then
  gh release edit "${NIGHTLY_TAG}" \
    --repo "${GITHUB_REPOSITORY}" \
    --title "${NIGHTLY_TITLE}" \
    --notes-file "${notes_file}" \
    --target "${GITHUB_SHA}"

  gh release upload "${NIGHTLY_TAG}" "${DMG_PATH}#${NIGHTLY_ASSET}" \
    --repo "${GITHUB_REPOSITORY}" \
    --clobber
else
  gh release create "${NIGHTLY_TAG}" "${DMG_PATH}#${NIGHTLY_ASSET}" \
    --repo "${GITHUB_REPOSITORY}" \
    --title "${NIGHTLY_TITLE}" \
    --notes-file "${notes_file}" \
    --target "${GITHUB_SHA}" \
    --prerelease
fi
