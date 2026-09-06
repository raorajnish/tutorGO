import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Bounded pool rather than pg's unlimited default — a burst of concurrent
// requests should queue for a connection, not each open a fresh one against
// Postgres's own (much lower) max_connections. Numbers are conservative
// defaults for a single small instance; override via env for a bigger one.
const adapter = new PrismaPg({
  connectionString,
  max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  idleTimeoutMillis: Number(process.env.DATABASE_POOL_IDLE_TIMEOUT_MS ?? 30_000),
  connectionTimeoutMillis: Number(process.env.DATABASE_POOL_CONNECT_TIMEOUT_MS ?? 10_000),
});

export const prisma = new PrismaClient({ adapter });
