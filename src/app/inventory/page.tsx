import type { Metadata } from "next";
import { AppShell, PageBody, PageHeader } from "@/components/app-shell";
import { InventoryList } from "@/components/inventory-list";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const user = await requireUser();

  const items = await db.inventoryItem.findMany({
    where: { userId: user.id },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      brand: true,
      quantity: true,
      abv: true,
      upc: true,
      notes: true,
      inStock: true,
    },
  });

  return (
    <AppShell user={user}>
      <PageHeader title="Inventory" subtitle="Everything behind your bar." />
      <PageBody>
        <InventoryList items={items} />
      </PageBody>
    </AppShell>
  );
}
