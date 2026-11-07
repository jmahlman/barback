/**
 * Collect licence information for everything installed in node_modules and
 * write it to src/data/licenses.json, which the Settings page renders.
 *
 * Run as part of `npm run build`, so the shipped list always matches the
 * dependency tree the image was actually built from rather than whatever was
 * true when someone last remembered to regenerate it.
 */
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const MODULES = path.join(ROOT, "node_modules");
const OUT = path.join(ROOT, "src", "data", "licenses.json");

/** Filenames that typically hold the full licence text. */
const LICENCE_FILES = [
  "LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "LICENCE.md",
  "LICENCE.txt", "license", "license.md", "LICENSE-MIT", "COPYING",
];

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

/** Packages, including scoped ones, directly under a node_modules folder. */
async function listPackages(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name === ".bin" || entry.name === ".cache") continue;

    if (entry.name.startsWith("@")) {
      const scoped = await readdir(path.join(dir, entry.name), {
        withFileTypes: true,
      }).catch(() => []);
      for (const inner of scoped) {
        found.push(path.join(dir, entry.name, inner.name));
      }
    } else if (!entry.name.startsWith(".")) {
      found.push(path.join(dir, entry.name));
    }
  }
  return found;
}

function normaliseLicence(pkg) {
  if (typeof pkg.license === "string") return pkg.license;
  if (pkg.license && typeof pkg.license === "object" && pkg.license.type) {
    return pkg.license.type;
  }
  if (Array.isArray(pkg.licenses) && pkg.licenses.length > 0) {
    return pkg.licenses.map((l) => l.type ?? l).join(" OR ");
  }
  return "UNKNOWN";
}

function repoUrl(pkg) {
  const repo = pkg.repository;
  const raw =
    typeof repo === "string" ? repo : typeof repo?.url === "string" ? repo.url : null;
  if (!raw) return pkg.homepage ?? null;
  return raw
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^ssh:\/\/git@/, "https://");
}

function authorOf(pkg) {
  if (typeof pkg.author === "string") return pkg.author.replace(/\s*<[^>]*>/, "").trim();
  if (pkg.author?.name) return pkg.author.name;
  return null;
}

async function findLicenceText(dir) {
  for (const name of LICENCE_FILES) {
    const file = path.join(dir, name);
    try {
      const info = await stat(file);
      if (!info.isFile() || info.size > 64_000) continue;
      return (await readFile(file, "utf8")).trim();
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

async function main() {
  const own = await readJson(path.join(ROOT, "package.json"));
  const direct = new Set([
    ...Object.keys(own?.dependencies ?? {}),
    ...Object.keys(own?.devDependencies ?? {}),
  ]);

  const dirs = await listPackages(MODULES);
  const packages = [];
  const texts = new Map(); // hash -> text
  const seen = new Set();

  for (const dir of dirs) {
    const pkg = await readJson(path.join(dir, "package.json"));
    if (!pkg?.name || !pkg.version) continue;
    const key = `${pkg.name}@${pkg.version}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const text = await findLicenceText(dir);
    let textHash = null;
    if (text) {
      textHash = createHash("sha1").update(text).digest("hex").slice(0, 12);
      if (!texts.has(textHash)) texts.set(textHash, text);
    }

    packages.push({
      name: pkg.name,
      version: pkg.version,
      license: normaliseLicence(pkg),
      author: authorOf(pkg),
      url: repoUrl(pkg),
      direct: direct.has(pkg.name),
      textHash,
    });
  }

  packages.sort((a, b) => a.name.localeCompare(b.name));

  const payload = {
    generatedAt: new Date().toISOString(),
    runtime: `Node.js ${process.version}`,
    app: {
      name: own?.name ?? "barback",
      version: own?.version ?? "0.0.0",
      license: own?.license ?? null,
    },
    counts: {
      total: packages.length,
      direct: packages.filter((p) => p.direct).length,
    },
    packages,
    texts: Object.fromEntries(texts),
  };

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload), "utf8");

  const bytes = Buffer.byteLength(JSON.stringify(payload));
  console.log(
    `licenses.json: ${packages.length} packages, ${texts.size} distinct licence texts, ${(bytes / 1024).toFixed(0)} KB`,
  );
}

main().catch((error) => {
  console.error("Could not collect licences:", error);
  process.exit(1);
});
