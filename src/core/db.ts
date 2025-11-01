// src/core/db.ts
import type { PoolConfig } from "pg";
import { Pool } from "pg";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

const poolConfig: PoolConfig = {
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL_REJECT_UNAUTHORIZED
    ? { rejectUnauthorized: true }
    : { rejectUnauthorized: false },
};

export const dbPool = new Pool(poolConfig);

dbPool.on("error", (error) => {
  logger.error(`Database pool error: ${error.message}`);
});

export async function checkDatabaseConnection() {
  const client = await dbPool.connect();
  try {
    await client.query("SELECT 1;");
    logger.info("✅ Database connection established.");
  } finally {
    client.release();
  }
}

export async function closeDatabasePool() {
  await dbPool.end();
}
