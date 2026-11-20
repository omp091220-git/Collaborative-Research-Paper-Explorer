import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertSafeTestDatabase,
  TestDatabaseSafetyError,
} from "./safetyCheck.js";

describe("test database safety guard", () => {
  const allowed = JSON.stringify([
    { host: "test.example", port: 5432, database: "app_test" },
  ]);

  it("requires TEST_DATABASE_URL instead of falling back to DATABASE_URL", () => {
    assert.throws(
      () => assertSafeTestDatabase(null, "postgresql://db/app", "development"),
      (error) => error instanceof TestDatabaseSafetyError && /TEST_DATABASE_URL is required/.test(error.message)
    );
  });

  it("rejects production mode before tests can override NODE_ENV", () => {
    assert.throws(
      () => assertSafeTestDatabase("postgresql://db/app_test", "postgresql://db/app", "production"),
      (error) => error instanceof TestDatabaseSafetyError && /NODE_ENV is set to/.test(error.message)
    );
  });

  it("rejects malformed and non-PostgreSQL test URLs", () => {
    for (const value of ["not-a-url", "https://db/app_test", "postgresql://db/"]) {
      assert.throws(
        () => assertSafeTestDatabase(value, "postgresql://db/app", "development", allowed),
        TestDatabaseSafetyError
      );
    }
  });

  it("fails closed when the allowlist is missing, malformed, or has no valid targets", () => {
    const testUrl = "postgresql://test.example/app_test";
    for (const targets of [null, "not-json", "{}", "[{}]"]) {
      assert.throws(
        () => assertSafeTestDatabase(testUrl, null, "development", targets),
        TestDatabaseSafetyError
      );
    }
  });

  it("rejects the same host, port, and database as DATABASE_URL", () => {
    assert.throws(
      () => assertSafeTestDatabase(
        "postgres://test_user:test_password@example.test:5432/app?sslmode=require",
        "postgresql://main_user:main_password@example.test/app",
        "development",
        JSON.stringify([{ host: "example.test", port: 5432, database: "app" }])
      ),
      (error) => error instanceof TestDatabaseSafetyError && /same host, port, and database/.test(error.message)
    );
  });

  it("accepts an explicitly allowlisted target", () => {
    assert.equal(
      assertSafeTestDatabase(
        "postgresql://test_user:test_password@test.example:5432/app_test?sslmode=require",
        "postgresql://main_user:main_password@main.example:5432/app",
        "development",
        allowed
      ),
      true
    );
  });

  it("rejects an unknown target", () => {
    assert.throws(
      () => assertSafeTestDatabase(
        "postgresql://other.example/app_test",
        "postgresql://main.example/app",
        "development",
        allowed
      ),
      (error) => error instanceof TestDatabaseSafetyError && /does not match an approved/.test(error.message)
    );
  });

  it("rejects a different database on the same host unless that exact target is allowlisted", () => {
    const sameEndpointAllowlist = JSON.stringify([
      { host: "test.example", port: 5432, database: "app_test" },
    ]);
    assert.throws(
      () => assertSafeTestDatabase(
        "postgresql://test.example/production_db",
        "postgresql://main.example/app",
        "development",
        sameEndpointAllowlist
      ),
      (error) => error instanceof TestDatabaseSafetyError && /does not match an approved/.test(error.message)
    );

    assert.equal(
      assertSafeTestDatabase(
        "postgresql://test.example/production_db",
        "postgresql://main.example/app",
        "development",
        JSON.stringify([{ host: "test.example", port: 5432, database: "production_db" }])
      ),
      true
    );
  });

  it("normalizes an omitted PostgreSQL URL port to 5432", () => {
    assert.equal(
      assertSafeTestDatabase(
        "postgresql://test.example/app_test",
        "postgresql://main.example/app",
        "development",
        JSON.stringify([{ host: "test.example", port: 5432, database: "app_test" }])
      ),
      true
    );
  });
});
