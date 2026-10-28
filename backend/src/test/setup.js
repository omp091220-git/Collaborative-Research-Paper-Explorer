// backend/src/test/setup.js
// Standard test environment initialization with safety guards.
// Ensures mandatory environment variables are populated and prevents destructive
// operations against non-test databases.

import dotenv from "dotenv";
import { assertSafeTestDatabase } from "./safetyCheck.js";

dotenv.config();

// Ensure test environment is explicitly set
process.env.NODE_ENV = "test";

// If dedicated TEST_DATABASE_URL is provided, prioritize it
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = "super_secure_test_jwt_secret_with_32_characters_12345";
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/collaborative_research_test";
}

// In authorized test harness, explicitly permit test database operations
process.env.ALLOW_TEST_DB_OPERATIONS = "true";
process.env.EXPOSE_DEV_RESET_TOKEN = "true";

// Fail-fast validation: abort immediately if active database is unsafe
assertSafeTestDatabase(process.env.DATABASE_URL);
