"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveMatchingSettings } from "@/actions/settings";
import type { ActionResult } from "@/actions/inventory";
import { CheckIcon } from "@/components/icons";

/**
 * How loosely Barback reads a shelf.
 *
 * One set for the whole instance. Everyone sees it, since it decides what
 * every recipe page says, but only the owner can change it; for anyone else
 * the switches show the current state and do nothing.
 */

export interface MatchingSettingsView {
  groups: { id: string; label: string; on: boolean }[];
  garnishesOptional: boolean;
  assumeStaples: boolean;
}

export function MatchingSettings({
  initial,
  canEdit,
}: {
  initial: MatchingSettingsView;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [on, setOn] = useState(
    () => new Set(initial.groups.filter((g) => g.on).map((g) => g.id)),
  );
  const [garnishesOptional, setGarnishesOptional] = useState(initial.garnishesOptional);
  const [assumeStaples, setAssumeStaples] = useState(initial.assumeStaples);
  const [result, setResult] = useState<ActionResult | null>(null);

  const toggleGroup = (id: string, checked: boolean) =>
    setOn((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <section id="matching" className="scroll-mt-6 space-y-4">
      <div>
        <h2 className="font-display text-xl text-bar-200">Matching</h2>
        <p className="mt-1 text-sm text-bar-400">
          How loosely Barback reads your shelf when it decides what you can make.
          These apply to everyone on this Barback.
        </p>
        {!canEdit ? (
          <p className="mt-1 text-xs text-bar-400">
            Only the instance owner can change these.
          </p>
        ) : null}
      </div>

      <form
        action={() => {
          startTransition(async () => {
            const res = await saveMatchingSettings({
              substitutions: [...on],
              garnishesOptional,
              assumeStaples,
            });
            setResult(res);
            if (res.ok) router.refresh();
          });
        }}
        className="card space-y-4 p-5"
      >
        <fieldset disabled={!canEdit} className="space-y-4">
          <div id="matching-stand-ins" className="scroll-mt-6">
            <p className="text-sm text-brass-300">Stand-ins</p>
            <p className="text-xs text-bar-400">
              When a recipe calls for one, count the other. A drink made this
              way says &ldquo;Using … instead&rdquo;.
            </p>
            <div className="mt-2 space-y-2">
              {initial.groups.map((group) => (
                <label key={group.id} className="flex items-center gap-3 text-sm text-bar-200">
                  <input
                    type="checkbox"
                    checked={on.has(group.id)}
                    onChange={(event) => toggleGroup(group.id, event.target.checked)}
                    className="size-4 shrink-0 accent-brass-400"
                  />
                  {group.label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3 border-t border-bar-800 pt-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={garnishesOptional}
                onChange={(event) => setGarnishesOptional(event.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-brass-400"
              />
              <span>
                <span className="block text-sm text-bar-200">
                  Garnishes never stop a drink
                </span>
                <span className="block text-xs text-bar-400">
                  No lime wheel? It still shows as one you can make.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={assumeStaples}
                onChange={(event) => setAssumeStaples(event.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-brass-400"
              />
              <span>
                <span className="block text-sm text-bar-200">
                  Assume ice, water, salt and pepper
                </span>
                <span className="block text-xs text-bar-400">
                  So nobody has to add them to their inventory.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <div className="space-y-1 border-t border-bar-800 pt-4">
          <p className="text-xs text-bar-400">Always on</p>
          <p className="text-xs text-bar-400">
            <span className="chip mr-1.5">brand names</span>
            Beefeater London Dry Gin counts as gin.
          </p>
          <p className="text-xs text-bar-400">
            <span className="chip mr-1.5">families</span>
            Rum covers white rum.
          </p>
        </div>

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending} className="btn-primary">
              <CheckIcon className="size-4" />
              {pending ? "Saving…" : "Save matching rules"}
            </button>
            {result ? (
              <p
                role="status"
                className={`text-sm ${result.ok ? "text-citrus-400" : "text-cherry-400"}`}
              >
                {result.error}
              </p>
            ) : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}
