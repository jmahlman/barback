#!/usr/bin/env bash
#
# Print the CHANGELOG.md section for one version.
#
#   ./scripts/changelog-section.sh 0.2.0
#
# Exits non-zero when that version has no section, or the section is empty,
# so it works both as the release workflow's gate and as the thing that
# produces the release notes.
#
# Why this exists: Barback reads its own release notes back and shows them
# under Settings -> Releases. Whatever the workflow writes is what a
# self-hoster reads when deciding whether to update, so it has to say what
# actually changed for them — not just list commit subjects.

set -euo pipefail

VERSION="${1:-}"
CHANGELOG="${2:-CHANGELOG.md}"

if [ -z "$VERSION" ]; then
  echo "usage: $0 <version> [changelog path]" >&2
  exit 2
fi

# Accept a tag as readily as a version: "v0.2.0" and "0.2.0" are the same ask.
VERSION="${VERSION#v}"

if [ ! -f "$CHANGELOG" ]; then
  echo "$CHANGELOG not found" >&2
  exit 1
fi

# Matches "## 0.2.0", "## v0.2.0" and "## 0.2.0 — Some title", but not
# "## 0.2.0-rc.1" — a prerelease is its own entry.
SECTION=$(
  awk -v version="$VERSION" '
    BEGIN {
      escaped = version
      gsub(/\./, "\\.", escaped)
      heading = "^##[[:space:]]+v?" escaped "([[:space:]]|$)"
    }
    $0 ~ heading { found = 1; next }
    found && /^##[[:space:]]/ { exit }
    found { print }
  ' "$CHANGELOG"
)

# Trim blank lines from both ends.
SECTION=$(printf '%s\n' "$SECTION" | sed -e '/./,$!d' | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}')

if [ -z "$SECTION" ]; then
  exit 1
fi

printf '%s\n' "$SECTION"
