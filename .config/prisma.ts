/**
 * Prisma config for development: the npm scripts and `prisma generate`.
 *
 * Prisma finds it here, in .config/, without a flag. Paths in it resolve
 * from this directory, hence the "../". The container uses a different one,
 * docker/prisma.config.ts, because its migration step runs from an isolated
 * CLI install with the schema at an absolute path.
 */
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "../prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./data/barback.db",
  },
});
