import Image from "next/image";
import Link from "next/link";
import { MakeableBadge } from "@/components/recipe-card";
import { GlassIcon } from "@/components/icons";
import { drinkImage } from "@/lib/providers/images";
import type { DiscoverEntry } from "@/lib/discover";

export function DiscoverCard({ entry }: { entry: DiscoverEntry }) {
  const { drink, evaluation, imported } = entry;
  const image = drinkImage(drink.thumbUrl, 80);
  const metadata = [drink.category, drink.alcoholic, drink.glass]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/discover/${drink.key}`}
      className="card flex gap-3 p-3 transition-colors hover:border-bar-700 hover:bg-bar-850"
    >
      <div className="relative size-20 shrink-0 overflow-hidden rounded-lg border border-bar-800 bg-bar-850">
        {image ? (
          <Image src={image} alt="" fill sizes="80px" className="object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-bar-700">
            <GlassIcon className="size-8" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-display text-lg text-bar-200">{drink.name}</h3>
        {metadata ? (
          <p className="mt-0.5 truncate text-xs text-bar-400">{metadata}</p>
        ) : null}
        <MakeableBadge evaluation={evaluation} />
        {imported ? (
          <p className="mt-1 text-xs text-bar-400">Already in your book</p>
        ) : null}
      </div>
    </Link>
  );
}
