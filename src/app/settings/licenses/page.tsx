import Link from "next/link";
import type { Metadata } from "next";
import { AppShell, PageBody, PageHeader } from "@/components/app-shell";
import { requireUser } from "@/lib/session";
import data from "@/data/licenses.json";

export const metadata: Metadata = { title: "Open source licenses" };

interface PackageEntry {
  name: string;
  version: string;
  license: string;
  author: string | null;
  url: string | null;
  direct: boolean;
  textHash: string | null;
}

const packages = data.packages as PackageEntry[];
const texts = data.texts as Record<string, string>;

/** Group by SPDX identifier so the summary is readable. */
function byLicense() {
  const groups = new Map<string, PackageEntry[]>();
  for (const pkg of packages) {
    const list = groups.get(pkg.license) ?? [];
    list.push(pkg);
    groups.set(pkg.license, list);
  }
  return [...groups.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );
}

export default async function LicensesPage({
  searchParams,
}: {
  searchParams: Promise<{ text?: string; all?: string }>;
}) {
  const user = await requireUser();
  const { text: wantedText, all } = await searchParams;

  const groups = byLicense();
  const showAll = all === "1";
  const listed = showAll ? packages : packages.filter((p) => p.direct);
  const openText = wantedText && texts[wantedText] ? texts[wantedText] : null;

  return (
    <AppShell user={user}>
      <PageHeader
        title="Open source"
        subtitle={`${data.counts.total} packages behind this instance.`}
      />
      <PageBody>
        <section className="card space-y-2 p-4">
          <h2 className="font-display text-lg text-bar-200">Barback</h2>
          <p className="text-sm text-bar-300">
            Version {data.app.version}, released under the{" "}
            <a
              href="https://www.gnu.org/licenses/agpl-3.0.html"
              target="_blank"
              rel="noreferrer noopener"
              className="text-brass-300 underline-offset-4 hover:underline"
            >
              GNU AGPL-3.0-or-later
            </a>
            .
          </p>
          <p className="text-xs text-bar-400">
            You may use, modify and redistribute it, including commercially,
            so long as the notices stay intact and your changes are published
            under the same licence. Running a modified version as a service
            counts as distributing it.
          </p>
        </section>

        <section className="card space-y-2 p-4 text-sm text-bar-400">
          <p>
            Barback {data.app.version} on {data.runtime}. This list is
            regenerated from the installed dependency tree every time the app
            is built, so it describes this exact build.
          </p>
          <p className="text-xs">
            Generated{" "}
            {new Date(data.generatedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            .
          </p>
        </section>

        {/* Photography and data sources are credited too; they are not npm
            packages but they are other people's work. */}
        <section className="space-y-3">
          <h2 className="font-display text-xl text-bar-200">Content</h2>
          <ul className="card divide-y divide-bar-800 overflow-hidden">
            <li className="space-y-1 p-3">
              <p className="text-sm text-bar-200">Sign-in photograph</p>
              <p className="text-xs text-bar-400">
                &ldquo;Brown wooden shelf with bottles&rdquo; by{" "}
                <a
                  href="https://unsplash.com/@echaparro"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-brass-300 underline-offset-4 hover:underline"
                >
                  Edgar Chaparro
                </a>{" "}
                on{" "}
                <a
                  href="https://unsplash.com/photos/brown-wooden-shelf-with-bottles-Lwx-q6OdGAc"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-brass-300 underline-offset-4 hover:underline"
                >
                  Unsplash
                </a>
                , used under the{" "}
                <a
                  href="https://unsplash.com/license"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-brass-300 underline-offset-4 hover:underline"
                >
                  Unsplash License
                </a>
                .
              </p>
            </li>
            <li className="space-y-1 p-3">
              <p className="text-sm text-bar-200">Wordmark typeface</p>
              <p className="text-xs text-bar-400">
                Retro Gastroll by{" "}
                <a
                  href="https://arterfakproject.com/product/retro-gastroll-free/"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-brass-300 underline-offset-4 hover:underline"
                >
                  Arterfak Project
                </a>
                , free for unlimited use; reselling the font itself is not
                permitted. Full terms in{" "}
                <a
                  href="/fonts/retro-gastroll-license.txt"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-brass-300 underline-offset-4 hover:underline"
                >
                  the bundled licence
                </a>
                .
              </p>
            </li>
            <li className="space-y-1 p-3">
              <p className="text-sm text-bar-200">Barcode decoder</p>
              <p className="text-xs text-bar-400">
                Barcodes are read on your own device by{" "}
                <a
                  href="https://github.com/Sec-ant/barcode-detector"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-brass-300 underline-offset-4 hover:underline"
                >
                  barcode-detector
                </a>{" "}
                and{" "}
                <a
                  href="https://github.com/zxing-cpp/zxing-cpp"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-brass-300 underline-offset-4 hover:underline"
                >
                  zxing-cpp
                </a>{" "}
                compiled to WebAssembly, served by this instance rather than a
                CDN. No image ever leaves your browser. Their licences are
                listed below with every other package.
              </p>
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl text-bar-200">Licenses in use</h2>
          <ul className="flex flex-wrap gap-2">
            {groups.map(([license, list]) => (
              <li key={license} className="chip">
                {license}
                <span className="text-bar-500"> · {list.length}</span>
              </li>
            ))}
          </ul>
        </section>

        {openText ? (
          <section className="card space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-lg text-bar-200">License text</h2>
              <Link href="/settings/licenses" className="btn-ghost text-sm">
                Close
              </Link>
            </div>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-bar-800 bg-bar-950 p-3 font-mono text-xs leading-relaxed text-bar-300">
              {openText}
            </pre>
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl text-bar-200">
              {showAll ? "All packages" : "Direct dependencies"}
            </h2>
            <Link
              href={showAll ? "/settings/licenses" : "/settings/licenses?all=1"}
              className="btn-secondary text-sm"
            >
              {showAll
                ? `Show the ${data.counts.direct} direct only`
                : `Show all ${data.counts.total}`}
            </Link>
          </div>

          <ul className="card divide-y divide-bar-800 overflow-hidden">
            {listed.map((pkg) => (
              <li
                key={`${pkg.name}@${pkg.version}`}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 p-3"
              >
                <span className="min-w-0">
                  <span className="font-mono text-sm text-bar-200">{pkg.name}</span>{" "}
                  <span className="font-mono text-xs text-bar-400">{pkg.version}</span>
                  {pkg.author ? (
                    <span className="block text-xs text-bar-400">© {pkg.author}</span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {pkg.textHash ? (
                    <Link
                      href={`/settings/licenses?${showAll ? "all=1&" : ""}text=${pkg.textHash}`}
                      className="chip hover:border-brass-400/50 hover:text-brass-300"
                    >
                      {pkg.license}
                    </Link>
                  ) : (
                    <span className="chip">{pkg.license}</span>
                  )}
                  {pkg.url ? (
                    <a
                      href={pkg.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs text-bar-400 underline-offset-4 hover:text-bar-200 hover:underline"
                    >
                      source
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-xs text-bar-400">
          Click a license to read its full text. Regenerate this list yourself
          with <code className="text-bar-300">npm run licenses</code>.
        </p>
      </PageBody>
    </AppShell>
  );
}
