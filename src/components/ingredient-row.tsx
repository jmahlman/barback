import Link from "next/link";
import { CheckIcon, XIcon } from "@/components/icons";
import { SUBSTITUTION_GROUPS } from "@/lib/ingredients";
import type { EvaluatedIngredient, InventoryIndex } from "@/lib/matching";

/** Where the rules live. Everyone can open it; only an administrator can change it. */
export const MATCHING_SETTINGS_HREF = "/settings#matching";

function RulesLink() {
  return (
    <Link
      href={MATCHING_SETTINGS_HREF}
      className="text-brass-300 underline-offset-4 hover:underline"
    >
      matching settings
    </Link>
  );
}

/**
 * One line of a recipe's ingredient list: whether you have it, and how
 * Barback decided.
 *
 * Says why in both directions. "Using Honey instead" when a rule helped, and,
 * when a rule that is switched off is the reason something is missing, which
 * rule it was, with a link to it.
 */
export function IngredientRow({
  ingredient,
  inventory,
}: {
  ingredient: EvaluatedIngredient;
  inventory: InventoryIndex;
}) {
  const have = Boolean(ingredient.match) || ingredient.assumed;
  const nameOf = (slug: string) => inventory.names.get(slug) ?? slug;
  // Something that cannot stop the drink is drawn quietly, not as a red X.
  const harmless =
    ingredient.optional || (ingredient.garnish && inventory.rules.garnishesOptional);

  let note: React.ReactNode;
  if (ingredient.assumed) note = "Assumed on hand";
  else if (ingredient.match) {
    const { kind, inventorySlug } = ingredient.match;
    note =
      kind === "exact"
        ? "In your inventory"
        : kind === "substitute"
          ? `Using ${nameOf(inventorySlug)} instead`
          : `Covered by ${nameOf(inventorySlug)}`;
  } else if (ingredient.blockedBy?.rule === "substitution") {
    const { group, inventorySlug } = ingredient.blockedBy;
    const label = SUBSTITUTION_GROUPS.find((g) => g.id === group)?.label ?? group;
    note = (
      <>
        You have {nameOf(inventorySlug)}, but &ldquo;{label}&rdquo; is switched off in{" "}
        <RulesLink />.
      </>
    );
  } else if (ingredient.blockedBy?.rule === "staples") {
    note = (
      <>
        Not in your inventory, and staples aren&rsquo;t assumed. See <RulesLink />.
      </>
    );
  } else if (ingredient.blockedBy?.rule === "garnish") {
    note = (
      <>
        Not in your inventory. Garnishes count right now; see <RulesLink />.
      </>
    );
  } else note = "Not in your inventory";

  return (
    <li className="flex items-center gap-3 p-3">
      <span
        aria-hidden
        className={`flex size-7 shrink-0 items-center justify-center rounded-md ${
          have
            ? ingredient.match?.kind === "substitute"
              ? "bg-brass-400/15 text-brass-300"
              : "bg-citrus-400/15 text-citrus-400"
            : harmless
              ? "bg-bar-800 text-bar-600"
              : "bg-cherry-400/15 text-cherry-400"
        }`}
      >
        {have ? <CheckIcon className="size-4" /> : <XIcon className="size-4" />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-bar-200">
          {ingredient.measure ? (
            <span className="font-medium text-brass-300">{ingredient.measure} </span>
          ) : null}
          {ingredient.name}
          {ingredient.optional ? <span className="text-xs text-bar-400"> (optional)</span> : null}
          {ingredient.garnish ? <span className="text-xs text-bar-400"> (garnish)</span> : null}
        </p>
        <p className="text-xs text-bar-400">{note}</p>
      </div>
    </li>
  );
}
