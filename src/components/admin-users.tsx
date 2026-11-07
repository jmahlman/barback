"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createUserAccount,
  deleteUserAccount,
  setUserBanned,
  setUserPassword,
  signOutUserEverywhere,
  updateUserAccount,
} from "@/actions/admin";
import { Sheet } from "@/components/sheet";
import { ConfirmButton } from "@/components/confirm-button";
import {
  BanIcon,
  CheckIcon,
  KeyIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import type { ActionResult } from "@/actions/inventory";

export interface AdminUserView {
  id: string;
  name: string;
  email: string;
  username: string | null;
  /** True when Barback invented the address rather than a person giving one. */
  emailIsGenerated: boolean;
  role: string;
  banned: boolean;
  banReason: string | null;
  createdAt: string;
  isOwner: boolean;
  isSelf: boolean;
  /** Provider ids on this account: "credential", "github", "google", "apple". */
  providers: string[];
  activeSessions: number;
  inventoryCount: number;
  recipeCount: number;
}

const PROVIDER_LABELS: Record<string, string> = {
  credential: "Password",
  github: "GitHub",
  google: "Google",
  apple: "Apple",
};

function providerLabel(id: string): string {
  return PROVIDER_LABELS[id] ?? id.replace(/^\w/, (c) => c.toUpperCase());
}

export function AdminUsers({
  users,
  canManagePasswords,
}: {
  users: AdminUserView[];
  /** False behind a proxy, where Barback holds no passwords. */
  canManagePasswords: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AdminUserView | null>(null);
  const [notice, setNotice] = useState<ActionResult | null>(null);

  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const res = await fn();
      setNotice(res);
      if (res.ok) router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-bar-400">
          {users.length} account{users.length === 1 ? "" : "s"}
        </p>
        {canManagePasswords ? (
          <button type="button" onClick={() => setAdding(true)} className="btn-primary">
            <PlusIcon className="size-5" />
            Add person
          </button>
        ) : null}
      </div>

      {notice ? (
        <p
          role="status"
          className={`text-sm ${notice.ok ? "text-citrus-400" : "text-cherry-400"}`}
        >
          {notice.error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {users.map((user) => (
          <li key={user.id} className="card space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-bar-200">{user.name}</span>
                  {user.isOwner ? (
                    <span className="chip border-brass-400/40 text-brass-300">owner</span>
                  ) : null}
                  {user.isSelf ? <span className="chip">you</span> : null}
                  {user.banned ? (
                    <span className="chip border-cherry-400/40 text-cherry-400">
                      suspended
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-sm text-bar-400">
                  {user.username ? (
                    <span className="font-mono text-bar-300">{user.username}</span>
                  ) : null}
                  {user.username && !user.emailIsGenerated ? " · " : null}
                  {!user.emailIsGenerated ? user.email : null}
                  {!user.username && user.emailIsGenerated ? user.email : null}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Edit ${user.name}`}
                onClick={() => setEditing(user)}
                className="btn-ghost size-10 shrink-0 p-0"
              >
                <PencilIcon className="size-5" />
              </button>
            </div>

            {/* How this person actually signs in. */}
            <div className="flex flex-wrap gap-1.5">
              {!canManagePasswords ? (
                <span className="chip">
                  <CheckIcon className="size-3 text-citrus-400" />
                  Proxy
                </span>
              ) : user.providers.length === 0 ? (
                <span className="chip border-brass-400/40 text-brass-300">
                  no password set
                </span>
              ) : (
                user.providers.map((id) => (
                  <span key={id} className="chip">
                    <CheckIcon className="size-3 text-citrus-400" />
                    {providerLabel(id)}
                  </span>
                ))
              )}
            </div>

            <p className="text-xs text-bar-400">
              {user.inventoryCount} ingredient{user.inventoryCount === 1 ? "" : "s"} ·{" "}
              {user.recipeCount} recipe{user.recipeCount === 1 ? "" : "s"} ·{" "}
              {user.activeSessions} active session{user.activeSessions === 1 ? "" : "s"} ·
              joined{" "}
              {new Date(user.createdAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
          </li>
        ))}
      </ul>

      {/* Create */}
      <Sheet open={adding} onClose={() => setAdding(false)} title="Add a person">
        <form
          action={(formData) => {
            startTransition(async () => {
              const res = await createUserAccount(formData);
              setNotice(res);
              if (res.ok) {
                setAdding(false);
                router.refresh();
              }
            });
          }}
          className="space-y-4"
        >
          <div>
            <label className="label" htmlFor="new-name">
              Name
            </label>
            <input id="new-name" name="name" required className="field" placeholder="Sam" />
          </div>
          <div>
            <label className="label" htmlFor="new-username">
              Username
            </label>
            <input
              id="new-username"
              name="username"
              required
              autoCapitalize="none"
              spellCheck={false}
              className="field"
              placeholder="sam"
            />
            <p className="mt-1 text-xs text-bar-400">
              What they sign in with. Match the handle your proxy reports if
              you use one.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="new-email">
              Email <span className="font-normal text-bar-400">(optional)</span>
            </label>
            <input
              id="new-email"
              name="email"
              type="email"
              autoCapitalize="none"
              className="field"
              placeholder="sam@example.com"
            />
          </div>
          <div>
            <label className="label" htmlFor="new-password">
              Password <span className="font-normal text-bar-400">(optional)</span>
            </label>
            <input
              id="new-password"
              name="password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              className="field"
              placeholder="Leave blank for social login only"
            />
            <p className="mt-1 text-xs text-bar-400">
              Leave this blank and they sign in with GitHub, Google or Apple
              instead — as long as the provider reports this same email
              address. You can set a password for them later.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="btn-primary flex-1">
              {pending ? "Creating…" : "Create account"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </Sheet>

      {/* Edit */}
      <Sheet
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `Manage ${editing.name}` : "Manage"}
      >
        {editing ? (
          <EditPanel
            user={editing}
            pending={pending}
            canManagePasswords={canManagePasswords}
            onClose={() => setEditing(null)}
            run={run}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function EditPanel({
  user,
  pending,
  canManagePasswords,
  onClose,
  run,
}: {
  user: AdminUserView;
  pending: boolean;
  canManagePasswords: boolean;
  onClose: () => void;
  run: (fn: () => Promise<ActionResult>) => void;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <form
        action={(formData) => {
          formData.set("userId", user.id);
          startTransition(async () => {
            await updateUserAccount(formData);
            onClose();
            router.refresh();
          });
        }}
        className="space-y-3"
      >
        <div>
          <label className="label" htmlFor="edit-name">
            Name
          </label>
          <input
            id="edit-name"
            name="name"
            required
            defaultValue={user.name}
            className="field"
          />
        </div>
        <p className="text-xs text-bar-400">
          Signs in as{" "}
          <span className="font-mono text-bar-300">
            {user.username ?? user.email}
          </span>
          . Usernames and email addresses cannot be changed here, because a
          reverse proxy matches people on them.
        </p>
        <button type="submit" disabled={pending} className="btn-primary w-full">
          Save name
        </button>
      </form>

      {canManagePasswords ? (
        <div className="space-y-2 border-t border-bar-800 pt-4">
          <label className="label" htmlFor="set-password">
            <span className="inline-flex items-center gap-1.5">
              <KeyIcon className="size-4" />
              Set a password
            </span>
          </label>
          <input
            id="set-password"
            type="password"
            value={password}
            minLength={8}
            onChange={(e) => setPassword(e.target.value)}
            className="field"
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
          <p className="text-xs text-bar-400">
            {user.providers.includes("credential")
              ? "Replaces their current password. They are not signed out."
              : "They have no password yet. This gives them one."}
          </p>
          <button
            type="button"
            disabled={pending || password.length < 8}
            onClick={() => {
              const value = password;
              setPassword("");
              run(() => setUserPassword(user.id, value));
            }}
            className="btn-secondary w-full"
          >
            Set password
          </button>
        </div>
      ) : (
        <p className="border-t border-bar-800 pt-4 text-xs text-bar-400">
          Passwords are handled by your reverse proxy, not by Barback.
        </p>
      )}

      {/* Sessions */}
      <div className="space-y-2 border-t border-bar-800 pt-4">
        <button
          type="button"
          disabled={pending || user.activeSessions === 0}
          onClick={() => run(() => signOutUserEverywhere(user.id))}
          className="btn-secondary w-full"
        >
          Sign out of all {user.activeSessions} device
          {user.activeSessions === 1 ? "" : "s"}
        </button>
      </div>

      {/* Suspend / delete */}
      {user.isOwner || user.isSelf ? (
        <p className="border-t border-bar-800 pt-4 text-xs text-bar-400">
          The instance owner cannot be suspended or deleted.
        </p>
      ) : (
        <div className="space-y-2 border-t border-bar-800 pt-4">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setUserBanned(user.id, !user.banned))}
            className={user.banned ? "btn-secondary w-full" : "btn-danger w-full"}
          >
            <BanIcon className="size-5" />
            {user.banned ? "Reinstate account" : "Suspend account"}
          </button>

          <ConfirmButton
            label="Delete account and all their data"
            confirmLabel="Delete the account"
            question={`Delete ${user.email}?`}
            detail={`Their ${user.inventoryCount} ingredients and ${user.recipeCount} recipes go too. This cannot be undone.`}
            icon={<TrashIcon className="size-5" />}
            className="btn-danger w-full"
            busyLabel="Deleting…"
            onConfirm={async () => {
              onClose();
              await run(() => deleteUserAccount(user.id));
            }}
          />
        </div>
      )}
    </div>
  );
}
