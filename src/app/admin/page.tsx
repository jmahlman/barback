import Link from "next/link";
import type { Metadata } from "next";
import { AppShell, PageBody, PageHeader } from "@/components/app-shell";
import { AdminUsers, type AdminUserView } from "@/components/admin-users";
import { EmptyState } from "@/components/empty-state";
import { UsersIcon } from "@/components/icons";
import { db } from "@/lib/db";
import { getOwnerId, isAdmin } from "@/lib/owner";
import { signupsAllowed } from "@/lib/auth";
import { isPlaceholderEmail } from "@/lib/identity";
import {
  BREAK_GLASS_ENABLED,
  PROXY_EMAIL_DOMAIN,
  getAuthMode,
  PROXY_ADMIN_GROUP,
  PROXY_HEADERS,
  PROXY_SHARED_SECRET,
} from "@/lib/auth-mode";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "People" };

export default async function AdminPage() {
  const user = await requireUser();

  // A non-admin is sent none of this, not even a hidden copy.
  if (!(await isAdmin(user.id))) {
    return (
      <AppShell user={user}>
        <PageHeader title="People" />
        <PageBody>
          <EmptyState
            icon={<UsersIcon className="size-12" />}
            title="Not your department"
            body="Only the instance owner can manage accounts."
            action={
              <Link href="/" className="btn-secondary">
                Back to the bar
              </Link>
            }
          />
        </PageBody>
      </AppShell>
    );
  }

  const [mode, signupsOpen] = await Promise.all([getAuthMode(), signupsAllowed()]);
  const localAuth = mode === "local";

  // With authentication off there is one account and nothing to administer.
  if (mode === "none") {
    return (
      <AppShell user={user}>
        <PageHeader title="People" />
        <PageBody>
          <EmptyState
            icon={<UsersIcon className="size-12" />}
            title="Authentication is off"
            body="Everyone who can reach this instance is the same single user, so there are no accounts to manage. Set AUTH_MODE to local or proxy if you want separate people."
            action={
              <Link href="/settings" className="btn-secondary">
                Open settings
              </Link>
            }
          />
        </PageBody>
      </AppShell>
    );
  }

  const ownerId = await getOwnerId();
  const now = new Date();

  const rows = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      role: true,
      banned: true,
      banReason: true,
      createdAt: true,
      accounts: { select: { providerId: true } },
      sessions: { select: { expiresAt: true } },
      _count: { select: { items: true, recipes: true } },
    },
  });

  // Break-glass is only real once an admin actually has a password.
  const armedAdmins = rows.filter(
    (row) => row.role === "admin" && row.accounts.some((a) => a.providerId === "credential"),
  );

  const users: AdminUserView[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    username: row.username,
    emailIsGenerated: isPlaceholderEmail(row.email, PROXY_EMAIL_DOMAIN),
    role: row.role ?? "user",
    banned: Boolean(row.banned),
    banReason: row.banReason,
    createdAt: row.createdAt.toISOString(),
    isOwner: row.id === ownerId,
    isSelf: row.id === user.id,
    providers: [...new Set(row.accounts.map((a) => a.providerId))].sort(),
    activeSessions: row.sessions.filter((s) => s.expiresAt > now).length,
    inventoryCount: row._count.items,
    recipeCount: row._count.recipes,
  }));

  return (
    <AppShell user={user}>
      <PageHeader title="People" subtitle="Who can use this Barback instance." />
      <PageBody>
        <AdminUsers users={users} canManagePasswords={localAuth} />

        <section className="card space-y-2 p-4 text-sm text-bar-400">
          <h2 className="font-medium text-bar-300">How sign-in works here</h2>

          {localAuth ? (
            <>
              <p>
                This instance uses Barback&apos;s own email and password
                sign-in. Signups are currently{" "}
                <strong
                  className={signupsOpen ? "text-citrus-400" : "text-brass-300"}
                >
                  {signupsOpen ? "open" : "closed"}
                </strong>
                {signupsOpen
                  ? " — anyone who can reach it can register. Set ALLOW_SIGNUPS=false to close them."
                  : " — only accounts you create here can sign in."}
              </p>
              <p className="text-xs">
                Barback sends no email, so there is no self-service password
                reset. Set passwords for people from this page.
              </p>
            </>
          ) : null}

          {mode === "proxy" ? (
            <>
              <p>
                Identity comes from your reverse proxy. Barback reads{" "}
                <code className="text-bar-300">{PROXY_HEADERS.user}</code> and{" "}
                <code className="text-bar-300">{PROXY_HEADERS.email}</code> and
                creates an account the first time it sees someone. Password
                sign-in is switched off.
              </p>
              <p>
                Shared secret:{" "}
                {PROXY_SHARED_SECRET ? (
                  <strong className="text-citrus-400">configured</strong>
                ) : (
                  <strong className="text-cherry-400">not set</strong>
                )}
                {PROXY_SHARED_SECRET
                  ? " — requests must carry it, so reaching Barback directly is not enough to impersonate anyone."
                  : " — anything that can reach Barback directly can claim to be any user. Set AUTH_PROXY_SHARED_SECRET unless you are certain only the proxy can connect."}
              </p>
              <p>
                Direct administrator access:{" "}
                {!BREAK_GLASS_ENABLED ? (
                  <>
                    <strong className="text-bar-300">off</strong> — if your
                    proxy breaks, nobody can get in and the way back is to set{" "}
                    <code className="text-bar-300">AUTH_MODE=local</code> in
                    the environment and restart.
                  </>
                ) : armedAdmins.length > 0 ? (
                  <>
                    <strong className="text-citrus-400">ready</strong> —{" "}
                    {armedAdmins.length === 1
                      ? `${armedAdmins[0].name} can`
                      : `${armedAdmins.length} administrators can`}{" "}
                    sign in with a password at this instance&apos;s address
                    even when the proxy is unavailable. Ordinary accounts
                    cannot.
                  </>
                ) : (
                  <>
                    <strong className="text-brass-300">not set up</strong> — no
                    administrator has a password, so if your proxy breaks there
                    is no way in. Give yourself one below.
                  </>
                )}
              </p>
              <p className="text-xs">
                {PROXY_ADMIN_GROUP
                  ? `Members of the "${PROXY_ADMIN_GROUP}" group are made admins automatically.`
                  : "No admin group is mapped, so roles are managed here rather than by your directory."}{" "}
                Suspending someone here blocks them even if the proxy still
                lets them through.
              </p>
            </>
          ) : null}
        </section>
      </PageBody>
    </AppShell>
  );
}
