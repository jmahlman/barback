import "server-only";
import { db } from "@/lib/db";
import { getSetting, setSetting, SETTING_KEYS } from "@/lib/settings";
import appPackage from "../../package.json";

/**
 * Release history and update checking, read from the GitHub Releases API.
 *
 * Everything the UI renders comes from a cached copy in the database, so
 * opening Settings never reaches GitHub. The network is touched by an
 * explicit "check now", or by the once-a-day automatic check if the owner
 * has switched it on.
 */

const REPO_URL = (appPackage as { repository?: { url?: string } }).repository?.url ?? "";

/** "https://github.com/owner/repo.git" -> "owner/repo" */
function parseRepo(url: string): string | null {
  const match = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(url);
  return match ? `${match[1]}/${match[2]}` : null;
}

export const REPO = process.env.GITHUB_REPOSITORY?.trim() || parseRepo(REPO_URL);
export const REPO_WEB_URL = REPO ? `https://github.com/${REPO}` : null;
export const CURRENT_VERSION = (appPackage as { version: string }).version;

/** Cached releases are refreshed at most this often by the automatic check. */
const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface Release {
  tag: string;
  name: string;
  /** Markdown, exactly as published. */
  body: string;
  publishedAt: string | null;
  url: string;
  prerelease: boolean;
  draft: boolean;
}

export interface ReleaseState {
  releases: Release[];
  checkedAt: string | null;
  current: string;
  /** The newest non-prerelease tag, when it is newer than what is running. */
  updateAvailable: Release | null;
  repo: string | null;
  repoUrl: string | null;
  autoCheck: boolean;
  /** Set when the last attempt failed; the cache is still shown. */
  error: string | null;
}

/**
 * Compare two dotted version strings.
 * Returns > 0 when `a` is newer. Pre-release suffixes sort before the
 * release they lead to, so 1.2.0-rc.1 is older than 1.2.0.
 */
export function compareVersions(a: string, b: string): number {
  const split = (v: string) => {
    const [core, pre] = v.replace(/^v/, "").split("-", 2);
    return {
      parts: core.split(".").map((n) => Number.parseInt(n, 10) || 0),
      pre: pre ?? null,
    };
  };
  const left = split(a);
  const right = split(b);

  const length = Math.max(left.parts.length, right.parts.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left.parts[i] ?? 0) - (right.parts[i] ?? 0);
    if (diff !== 0) return diff;
  }

  if (left.pre && !right.pre) return -1;
  if (!left.pre && right.pre) return 1;
  if (left.pre && right.pre) return left.pre.localeCompare(right.pre);
  return 0;
}

interface RawRelease {
  tag_name?: string;
  name?: string | null;
  body?: string | null;
  published_at?: string | null;
  html_url?: string;
  prerelease?: boolean;
  draft?: boolean;
}

function toRelease(raw: RawRelease): Release | null {
  if (!raw.tag_name) return null;
  return {
    tag: raw.tag_name,
    name: raw.name?.trim() || raw.tag_name,
    body: raw.body?.trim() ?? "",
    publishedAt: raw.published_at ?? null,
    url: raw.html_url ?? `${REPO_WEB_URL}/releases/tag/${raw.tag_name}`,
    prerelease: Boolean(raw.prerelease),
    draft: Boolean(raw.draft),
  };
}

async function readCache(): Promise<Release[]> {
  const raw = await getSetting(SETTING_KEYS.releaseCache);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Release[]) : [];
  } catch {
    return [];
  }
}

/** Fetch from GitHub and cache. Only called from an explicit action. */
export async function fetchReleases(): Promise<{ releases: Release[]; error: string | null }> {
  if (!REPO) {
    return {
      releases: [],
      error:
        "No GitHub repository is configured. Set the repository field in package.json, or GITHUB_REPOSITORY.",
    };
  }

  const url = `https://api.github.com/repos/${REPO}/releases?per_page=30`;
  console.info(`[updates] GET ${url}`);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        // GitHub asks automated clients to identify themselves.
        "User-Agent": `Barback/${CURRENT_VERSION}`,
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { releases: await readCache(), error: "GitHub did not respond." };
  }

  if (response.status === 404) {
    return {
      releases: await readCache(),
      error: `GitHub has no repository at ${REPO}, or it is private.`,
    };
  }
  if (response.status === 403 || response.status === 429) {
    return {
      releases: await readCache(),
      error:
        "GitHub is rate limiting this instance. Unauthenticated checks are capped at 60 an hour; set GITHUB_TOKEN to raise it.",
    };
  }
  if (!response.ok) {
    return { releases: await readCache(), error: `GitHub returned ${response.status}.` };
  }

  let raw: RawRelease[];
  try {
    raw = (await response.json()) as RawRelease[];
  } catch {
    return { releases: await readCache(), error: "GitHub returned a malformed response." };
  }

  const releases = raw
    .map(toRelease)
    .filter((r): r is Release => r !== null && !r.draft)
    .sort((a, b) => compareVersions(b.tag, a.tag));

  await setSetting(SETTING_KEYS.releaseCache, JSON.stringify(releases));
  await setSetting(SETTING_KEYS.releaseCheckedAt, new Date().toISOString());

  return { releases, error: null };
}

/**
 * Everything the Settings pages need. Reads the cache only; pass
 * `allowNetwork` when the caller is an explicit user action or the daily
 * automatic check.
 */
export async function getReleaseState(
  options: { allowNetwork?: boolean } = {},
): Promise<ReleaseState> {
  const [autoCheckRaw, checkedAt] = await Promise.all([
    getSetting(SETTING_KEYS.updateCheck),
    getSetting(SETTING_KEYS.releaseCheckedAt),
  ]);
  const autoCheck = autoCheckRaw === "true";

  let releases = await readCache();
  let error: string | null = null;
  let lastChecked = checkedAt || null;

  const stale =
    !lastChecked || Date.now() - new Date(lastChecked).getTime() > AUTO_CHECK_INTERVAL_MS;

  if (options.allowNetwork && (stale || releases.length === 0)) {
    const result = await fetchReleases();
    releases = result.releases;
    error = result.error;
    if (!result.error) lastChecked = new Date().toISOString();
  }

  const newest = releases.find((r) => !r.prerelease) ?? null;
  const updateAvailable =
    newest && compareVersions(newest.tag, CURRENT_VERSION) > 0 ? newest : null;

  return {
    releases,
    checkedAt: lastChecked,
    current: CURRENT_VERSION,
    updateAvailable,
    repo: REPO,
    repoUrl: REPO_WEB_URL,
    autoCheck,
    error,
  };
}

/**
 * Run the daily check if it is switched on and due. Safe to call while
 * rendering: it does nothing at all unless the owner opted in.
 */
export async function maybeAutoCheck(): Promise<void> {
  if ((await getSetting(SETTING_KEYS.updateCheck)) !== "true") return;

  const checkedAt = await getSetting(SETTING_KEYS.releaseCheckedAt);
  if (checkedAt && Date.now() - new Date(checkedAt).getTime() < AUTO_CHECK_INTERVAL_MS) {
    return;
  }

  // Record the attempt first, so a failing network does not turn into a
  // request on every page load.
  await setSetting(SETTING_KEYS.releaseCheckedAt, new Date().toISOString());
  await fetchReleases().catch(() => undefined);
}

export async function dismissUpdate(tag: string): Promise<void> {
  await setSetting(SETTING_KEYS.dismissedVersion, tag);
}

export async function dismissedVersion(): Promise<string> {
  return getSetting(SETTING_KEYS.dismissedVersion);
}

/**
 * The tag to badge in the navigation, or null.
 *
 * Reads the cache only — this runs on every page, and a page render must
 * never reach the network. A version the owner has dismissed stays hidden
 * until something newer than it appears, so the badge cannot nag.
 */
export async function pendingUpdateTag(): Promise<string | null> {
  const [raw, dismissed] = await Promise.all([
    getSetting(SETTING_KEYS.releaseCache),
    getSetting(SETTING_KEYS.dismissedVersion),
  ]);
  if (!raw) return null;

  let releases: Release[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    releases = parsed as Release[];
  } catch {
    return null;
  }

  const newest = releases.find((r) => !r.prerelease);
  if (!newest) return null;
  if (compareVersions(newest.tag, CURRENT_VERSION) <= 0) return null;
  if (dismissed && compareVersions(newest.tag, dismissed) <= 0) return null;

  return newest.tag;
}

export { db };
