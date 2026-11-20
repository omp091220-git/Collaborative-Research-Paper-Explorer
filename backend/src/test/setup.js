// backend/src/test/setup.js
// Standard test environment initialization with safety guards.
// Ensures mandatory environment variables are populated and prevents destructive
// operations against non-test databases.

import dotenv from "dotenv";
import { assertSafeTestDatabase } from "./safetyCheck.js";

dotenv.config();

// Validate the dedicated test target before overriding NODE_ENV or DATABASE_URL.
assertSafeTestDatabase(
  process.env.TEST_DATABASE_URL,
  process.env.DATABASE_URL,
  process.env.NODE_ENV
);

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = "super_secure_test_jwt_secret_with_32_characters_12345";
}

process.env.EXPOSE_DEV_RESET_TOKEN = "true";
