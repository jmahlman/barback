import Link from "next/link";
import { BottomNav, SideNav } from "@/components/bottom-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { SettingsIcon, UsersIcon } from "@/components/icons";
import { isOwner } from "@/lib/owner";
import { pendingUpdateTag } from "@/lib/releases";
import { hasPasswordSession } from "@/lib/session";

interface AppShellProps {
  user: { id: string; name?: string | null; email: string };
  children: React.ReactNode;
}

/**
 * Server component, so it can work out on its own whether this viewer owns
 * the instance rather than making every page thread the answer through.
 */
export async function AppShell({ user, children }: AppShellProps) {
  const [owner, canSignOut] = await Promise.all([
    isOwner(user.id),
    hasPasswordSession(),
  ]);
  // Only the owner can act on an update, so only the owner is told about one.
  const updateTag = owner ? await pendingUpdateTag() : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl md:gap-8 md:px-6">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col justify-between py-6 md:flex">
        <div>
          <Link href="/" className="mb-8 flex items-center gap-2 px-3">
            <span className="font-logo text-3xl text-brass-300">Barback</span>
          </Link>
          <SideNav />
        </div>
        <div className="space-y-1 border-t border-bar-800 pt-4">
          <p className="truncate px-3 pb-1 text-xs text-bar-400" title={user.email}>
            {user.name || user.email}
          </p>
          {owner ? (
            <Link
              href="/admin"
              className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm
                font-medium text-bar-300 transition-colors hover:bg-bar-850
                hover:text-bar-200"
            >
              <UsersIcon className="size-5" />
              People
            </Link>
          ) : null}
          <Link
            href="/settings"
            className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm
              font-medium text-bar-300 transition-colors hover:bg-bar-850
              hover:text-bar-200"
          >
            <span className="relative">
              <SettingsIcon className="size-5" />
              {updateTag ? (
                <span
                  aria-hidden
                  className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-brass-400
                    ring-2 ring-bar-950"
                />
              ) : null}
            </span>
            Settings
            {updateTag ? (
              <span className="ml-auto text-xs font-normal text-brass-300">
                {updateTag}
              </span>
            ) : null}
            {updateTag ? (
              <span className="sr-only">— update {updateTag} available</span>
            ) : null}
          </Link>
          {canSignOut ? <SignOutButton /> : null}
        </div>
      </aside>

      {/* Main column. Bottom padding clears the mobile tab bar. */}
      <main className="min-w-0 flex-1 pb-24 md:py-6 md:pb-6">{children}</main>

      <BottomNav />
    </div>
  );
}

/** Page header used inside the main column. */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header
      className="sticky top-0 z-30 -mx-0 mb-4 flex items-start justify-between gap-3
        border-b border-bar-800 bg-bar-950/90 px-4 py-4 backdrop-blur-sm md:static
        md:border-0 md:bg-transparent md:px-0 md:backdrop-blur-none"
    >
      <div className="min-w-0">
        <h1 className="font-display text-2xl text-bar-200 md:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-bar-400">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

/** Consistent horizontal padding for page content on mobile. */
export function PageBody({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6 px-4 md:px-0">{children}</div>;
}
