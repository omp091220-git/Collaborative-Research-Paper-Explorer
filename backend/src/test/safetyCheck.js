/**
 * Safety and Isolation Guard for Test Database Operations.
 * Prevents accidental execution of destructive setup, cleanup, or tests
 * against production or unverified databases.
 */

export class TestDatabaseSafetyError extends Error {
  constructor(message) {
    super(`[TEST DATABASE SAFETY GUARD] ${message}`);
    this.name = 'TestDatabaseSafetyError';
  }
}

/**
 * Validates that the active database connection is authorized for test execution.
 * Throws TestDatabaseSafetyError if the environment is unsafe.
 *
 * @param {string} [connectionString=process.env.DATABASE_URL]
 */
export const assertSafeTestDatabase = (connectionString = process.env.DATABASE_URL) => {
  if (process.env.NODE_ENV === 'production') {
    throw new TestDatabaseSafetyError(
      'Execution aborted: NODE_ENV is set to "production". Tests must never run in production.'
    );
  }

  if (!connectionString) {
    throw new TestDatabaseSafetyError(
      'Execution aborted: No DATABASE_URL or TEST_DATABASE_URL is configured.'
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(connectionString);
  } catch {
    throw new TestDatabaseSafetyError(
      'Execution aborted: Database connection string is malformed.'
    );
  }

  const isExplicitTestDb =
    Boolean(process.env.TEST_DATABASE_URL) ||
    parsedUrl.pathname.includes('test') ||
    parsedUrl.hostname === 'localhost' ||
    parsedUrl.hostname === '127.0.0.1';

  const isExplicitlyAuthorized = process.env.ALLOW_TEST_DB_OPERATIONS === 'true';

  if (!isExplicitTestDb && !isExplicitlyAuthorized) {
    throw new TestDatabaseSafetyError(
      `Execution aborted: Refusing to run tests against database host "${parsedUrl.hostname}" ` +
      `without explicit test isolation authorization (set TEST_DATABASE_URL or ALLOW_TEST_DB_OPERATIONS=true).`
    );
  }
};

/**
 * Validates that an array of IDs consists strictly of valid test fixture UUIDs
 * before allowing DELETE operations.
 *
 * @param {string[]} ids
 * @param {string} [context='cleanup']
 */
export const assertTestOwnedIds = (ids, context = 'cleanup') => {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new TestDatabaseSafetyError(
      `Refusing ${context}: Empty or non-array ID list provided.`
    );
  }

  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  for (const id of ids) {
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      throw new TestDatabaseSafetyError(
        `Refusing ${context}: Invalid UUID "${id}" in test cleanup list.`
      );
    }
  }
};
