import type { Metadata } from "next";
import { AppShell, PageBody, PageHeader } from "@/components/app-shell";
import { RecipeForm } from "@/components/recipe-form";
import { createRecipe } from "@/actions/recipes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "New recipe" };

export default async function NewRecipePage() {
  const user = await requireUser();

  return (
    <AppShell user={user}>
      <PageHeader title="New recipe" subtitle="Write it down before you forget it." />
      <PageBody>
        <RecipeForm action={createRecipe} submitLabel="Save recipe" cancelHref="/recipes" />
      </PageBody>
    </AppShell>
  );
}
