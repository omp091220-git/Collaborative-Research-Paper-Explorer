
import pg from "pg";
import { env } from "./env.js";
import { observePgClient } from "../utils/pgClientErrors.js";

const { Pool } = pg;

const isSslNeeded =
  env.nodeEnv === "production" ||
  (env.databaseUrl && (env.databaseUrl.includes("sslmode=require") || env.databaseUrl.includes("neon.tech")));

const pool = new Pool({
  connectionString: env.databaseUrl,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  connectionTimeoutMillis: 10000,
  ...(isSslNeeded ? { ssl: { rejectUnauthorized: false } } : {}),
});

pool.on("connect", observePgClient);

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error.message);
});

export const connectDatabase = async () => {
  const client = await pool.connect();

  try {
    await client.query("SELECT 1");
    console.log("PostgreSQL connected successfully.");
  } finally {
    client.release();
  }
};

export default pool;
