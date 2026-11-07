"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookIcon, BottleIcon, GlassIcon, SparkIcon } from "@/components/icons";

const TABS = [
  { href: "/", label: "Bar", Icon: GlassIcon, exact: true },
  { href: "/inventory", label: "Inventory", Icon: BottleIcon },
  { href: "/recipes", label: "Recipes", Icon: BookIcon },
  { href: "/discover", label: "Discover", Icon: SparkIcon },
];

export function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-bar-800
        bg-bar-900/95 backdrop-blur-sm md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {TABS.map(({ href, label, Icon }) => {
          const active = isActive(href, TABS.find((t) => t.href === href)?.exact);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px]
                  font-medium transition-colors ${
                    active ? "text-brass-400" : "text-bar-400 hover:text-bar-200"
                  }`}
              >
                <Icon className="size-6" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SideNav() {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label="Main" className="hidden md:block">
      <ul className="space-y-1">
        {TABS.map(({ href, label, Icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium
                  transition-colors ${
                    active
                      ? "bg-brass-400/10 text-brass-300"
                      : "text-bar-300 hover:bg-bar-850 hover:text-bar-200"
                  }`}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
