/**
 * Prisma config used only inside the container, by the migration step.
 *
 * It lives next to the isolated CLI install (/opt/prisma) so that
 * `prisma/config` resolves against the CLI's own node_modules rather than the
 * app's standalone bundle. Development uses .config/prisma.ts instead.
 */
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "/app/prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "file:/data/barback.db",
  },
});
