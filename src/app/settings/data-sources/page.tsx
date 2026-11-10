import type { Metadata } from "next";
import { AppShell, PageBody, PageHeader } from "@/components/app-shell";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Outside services" };

/**
 * Every service Barback can talk to, what it sends, and under whose terms.
 *
 * Deliberately not on the open-source licenses page: none of these is open
 * source, and filing a commercial data service under "licenses in use" would
 * misrepresent both. This page answers a different question — not "what is
 * this built from" but "what leaves my instance, and when".
 *
 * Reachable by anyone with an account, not just the owner: whose data is
 * going where is everyone's business, and nothing here is configuration.
 */

interface Service {
  name: string;
  href: string;
  /** What Barback uses it for. */
  purpose: string;
  /** What is sent, and when. */
  sends: string;
  /** Free-tier limits worth knowing. */
  limits: string;
  termsHref: string;
  termsLabel: string;
}

const SERVICES: Service[] = [
  {
    name: "UPCitemdb",
    href: "https://www.upcitemdb.com/",
    purpose:
      "Turning a scanned barcode into a product: the name, brand and size that fill in the add-to-inventory form.",
    sends:
      "The barcode, and nothing else — no key, no account, nothing about your bar. Only when someone presses Scan, and only when the barcode is not already in your inventory or your local cache.",
    limits:
      "The free tier needs no key and allows 100 lookups a day, counted per IP address, so it is shared with everything else on your connection. Results are cached locally, including barcodes it has never heard of.",
    termsHref: "https://devs.upcitemdb.com/termsofservice",
    termsLabel: "UPCitemdb terms of service",
  },
  {
    name: "cocktail.glass",
    href: "https://cocktail.glass/",
    purpose:
      "The default source of cocktail recipes and photographs: the catalog Discover matches your shelf against, and the drinks you can save to your book.",
    sends:
      "A single request for the whole catalog, and nothing about you — no key, no account, never your inventory. Searches and lookups are answered from that copy. Only on an explicit button press.",
    limits:
      "No key and no rate limits. Barback keeps a local copy of the catalog with the site's permission, so matching works offline once it has been fetched.",
    termsHref: "https://cocktail.glass/terms-of-service/",
    termsLabel: "cocktail.glass terms",
  },
  {
    name: "TheCocktailDB",
    href: "https://www.thecocktaildb.com/",
    purpose:
      "An alternative source of cocktail recipes and photographs, if you choose it in Settings.",
    sends:
      "A drink name, an ingredient, or a request for the catalog. Never your inventory. Only on an explicit button press.",
    limits:
      "The free development key is for non-commercial use. Get a production key before putting an instance on the public internet.",
    termsHref: "https://www.thecocktaildb.com/api.php",
    termsLabel: "TheCocktailDB API terms",
  },
  {
    name: "API Ninjas",
    href: "https://api-ninjas.com/api/cocktail",
    purpose: "An alternative source of cocktail recipes. Text only, no images.",
    sends:
      "A drink name or an ingredient, with your API key. Never your inventory. Only on an explicit button press.",
    limits: "Free tier is for non-commercial use and caps results per search.",
    termsHref: "https://api-ninjas.com/terms",
    termsLabel: "API Ninjas terms",
  },
  {
    name: "GitHub",
    href: "https://github.com/jmahlman/barback",
    purpose: "Checking whether a newer version of Barback has been released.",
    sends:
      "Nothing about your instance — it is a read of a public releases feed. Off unless you switch automatic checking on, and then at most once a day.",
    limits: "Public API, no key needed.",
    termsHref: "https://docs.github.com/site-policy/github-terms/github-terms-of-service",
    termsLabel: "GitHub terms of service",
  },
];

export default async function DataSourcesPage() {
  const user = await requireUser();

  return (
    <AppShell user={user}>
      <PageHeader
        title="Outside services"
        subtitle="Everything Barback can talk to, and what it tells them."
      />
      <PageBody>
        <div className="card space-y-2 p-4">
          <p className="text-sm text-bar-200">
            Your bar never leaves this machine.
          </p>
          <p className="text-xs text-bar-400">
            Your inventory, recipes, photos and tasting notes live in a SQLite
            file on your own disk. None of the services below is ever told what
            you have on your shelf. Each one is contacted only when someone
            presses a button, and every call is written to the server log, so
            you can check this rather than take it on trust.
          </p>
          <p className="text-xs text-bar-400">
            Reading a barcode is not one of these calls: the camera image and
            the decoder stay in your browser, and the decoder itself is served
            by this instance rather than a CDN.
          </p>
        </div>

        <ul className="space-y-3">
          {SERVICES.map((service) => (
            <li key={service.name} className="card space-y-3 p-4">
              <div>
                <a
                  href={service.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-display text-lg text-brass-300 underline-offset-4 hover:underline"
                >
                  {service.name}
                </a>
                <p className="mt-1 text-sm text-bar-300">{service.purpose}</p>
              </div>

              <dl className="space-y-2 border-t border-bar-800 pt-3 text-xs">
                <div>
                  <dt className="font-medium text-bar-300">What is sent</dt>
                  <dd className="mt-0.5 text-bar-400">{service.sends}</dd>
                </div>
                <div>
                  <dt className="font-medium text-bar-300">Limits</dt>
                  <dd className="mt-0.5 text-bar-400">{service.limits}</dd>
                </div>
              </dl>

              <a
                href={service.termsHref}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-block text-xs text-brass-300 underline-offset-4 hover:underline"
              >
                {service.termsLabel} →
              </a>
            </li>
          ))}
        </ul>

        <p className="text-xs text-bar-500">
          Data from these services is cached in your own database and credited
          wherever it is shown. Barback itself is not affiliated with any of
          them. For the packages Barback is built from, see{" "}
          <a
            href="/settings/licenses"
            className="text-brass-300 underline-offset-4 hover:underline"
          >
            Open source licenses
          </a>
          .
        </p>
      </PageBody>
    </AppShell>
  );
}
