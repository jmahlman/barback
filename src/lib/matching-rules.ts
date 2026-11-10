import "server-only";
import {
  isSubstitutionGroupId,
  SUBSTITUTION_GROUPS,
  type SubstitutionGroupId,
} from "@/lib/ingredients";
import type { MatchingRules } from "@/lib/matching";
import { getSetting, SETTING_KEYS, setSetting } from "@/lib/settings";

/**
 * The instance's matching rules, from Settings.
 *
 * One set for the whole instance: an administrator changes them, everyone
 * else can see them. Read through the per-request settings cache, so loading
 * them on every page that checks a recipe costs one query at most.
 */
export async function loadMatchingRules(): Promise<MatchingRules> {
  const [disabled, garnishesOptional, assumeStaples] = await Promise.all([
    getSetting(SETTING_KEYS.matchingDisabledSubstitutions),
    getSetting(SETTING_KEYS.matchingGarnishesOptional),
    getSetting(SETTING_KEYS.matchingAssumeStaples),
  ]);
  const off = new Set(disabled.split(",").map((id) => id.trim()));
  return {
    substitutions: new Set(
      SUBSTITUTION_GROUPS.map((group) => group.id).filter((id) => !off.has(id)),
    ),
    garnishesOptional: garnishesOptional !== "false",
    assumeStaples: assumeStaples !== "false",
  };
}

export async function saveMatchingRules(rules: {
  substitutions: readonly string[];
  garnishesOptional: boolean;
  assumeStaples: boolean;
}): Promise<void> {
  const on = new Set(rules.substitutions.filter(isSubstitutionGroupId));
  const off: SubstitutionGroupId[] = SUBSTITUTION_GROUPS.map((group) => group.id).filter(
    (id) => !on.has(id),
  );
  await Promise.all([
    // Blank removes the row, which reads back as "none off".
    setSetting(SETTING_KEYS.matchingDisabledSubstitutions, off.join(",")),
    setSetting(SETTING_KEYS.matchingGarnishesOptional, String(rules.garnishesOptional)),
    setSetting(SETTING_KEYS.matchingAssumeStaples, String(rules.assumeStaples)),
  ]);
}
