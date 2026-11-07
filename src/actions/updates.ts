"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { isOwner } from "@/lib/owner";
import { setSetting, SETTING_KEYS } from "@/lib/settings";
import { dismissUpdate, fetchReleases } from "@/lib/releases";
import type { ActionResult } from "@/actions/inventory";

/** Checking GitHub reaches the network, so it needs an explicit press. */
export async function checkForUpdates(): Promise<ActionResult & { found?: number }> {
  const user = await requireUser();
  if (!(await isOwner(user.id))) {
    return { ok: false, error: "Only the instance owner can check for updates." };
  }

  const { releases, error } = await fetchReleases();
  revalidatePath("/settings/releases");
  revalidatePath("/settings");

  if (error) return { ok: false, error };
  return {
    ok: true,
    found: releases.length,
    error: `Found ${releases.length} release${releases.length === 1 ? "" : "s"}.`,
  };
}

export async function setAutoUpdateCheck(enabled: boolean): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await isOwner(user.id))) {
    return { ok: false, error: "Only the instance owner can change this." };
  }

  await setSetting(SETTING_KEYS.updateCheck, enabled ? "true" : "false");
  revalidatePath("/settings/releases");
  revalidatePath("/settings");

  return {
    ok: true,
    error: enabled
      ? "Barback will ask GitHub for new releases once a day."
      : "Automatic checking is off. Nothing reaches GitHub unless you press the button.",
  };
}

export async function dismissUpdateNotice(tag: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await isOwner(user.id))) return { ok: false, error: "Not permitted." };

  await dismissUpdate(tag);
  revalidatePath("/settings/releases");
  revalidatePath("/settings");
  return { ok: true };
}
