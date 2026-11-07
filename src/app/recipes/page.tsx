import Link from "next/link";
import type { Metadata } from "next";
import { AppShell, PageBody, PageHeader } from "@/components/app-shell";
import { RecipeBrowser } from "@/components/recipe-browser";
import { PlusIcon } from "@/components/icons";
import { loadRecipesWithMakeability } from "@/lib/recipe-queries";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Recipes" };

export default async function RecipesPage() {
  const user = await requireUser();
  const recipes = await loadRecipesWithMakeability(user.id);

  return (
    <AppShell user={user}>
      <PageHeader
        title="Recipe book"
        subtitle="Your drinks, checked against your shelf."
        action={
          <Link href="/recipes/new" className="btn-primary" aria-label="New recipe">
            <PlusIcon className="size-5" />
            <span className="hidden sm:inline">New</span>
          </Link>
        }
      />
      <PageBody>
        <RecipeBrowser recipes={recipes} />
      </PageBody>
    </AppShell>
  );
}
