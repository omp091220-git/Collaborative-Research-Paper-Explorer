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
 * @param {string} [testConnectionString=process.env.TEST_DATABASE_URL]
 * @param {string} [mainConnectionString=process.env.DATABASE_URL]
 * @param {string} [nodeEnv=process.env.NODE_ENV]
 * @param {string} [allowedTargetsJson=process.env.TEST_DATABASE_ALLOWED_TARGETS]
 *
 * TEST_DATABASE_ALLOWED_TARGETS is an operational safeguard. Because it is
 * environment-provided alongside the connection URL, it is not independent
 * proof that the target is isolated from production or shared data.
 */
export const assertSafeTestDatabase = (
  testConnectionString = process.env.TEST_DATABASE_URL,
  mainConnectionString = process.env.DATABASE_URL,
  nodeEnv = process.env.NODE_ENV,
  allowedTargetsJson = process.env.TEST_DATABASE_ALLOWED_TARGETS
) => {
  if (typeof nodeEnv === 'string' && nodeEnv.toLowerCase() === 'production') {
    throw new TestDatabaseSafetyError(
      'Execution aborted: NODE_ENV is set to "production". Tests must never run in production.'
    );
  }

  if (!testConnectionString) {
    throw new TestDatabaseSafetyError(
      'Execution aborted: TEST_DATABASE_URL is required. Tests will not use DATABASE_URL.'
    );
  }

  const parsePostgresUrl = (connectionString, label) => {
    let parsed;
    try {
      parsed = new URL(connectionString);
    } catch {
      throw new TestDatabaseSafetyError(
        `Execution aborted: ${label} is malformed.`
      );
    }

    if (
      !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
      !parsed.hostname ||
      !parsed.pathname ||
      parsed.pathname === '/'
    ) {
      throw new TestDatabaseSafetyError(
        `Execution aborted: ${label} must be a PostgreSQL URL with a host and database name.`
      );
    }

    return parsed;
  };

  const testUrl = parsePostgresUrl(testConnectionString, 'TEST_DATABASE_URL');
  const portOf = (url) => url.port || '5432';
  const databaseOf = (url) => decodeURIComponent(url.pathname.slice(1));

  if (mainConnectionString) {
    const mainUrl = parsePostgresUrl(mainConnectionString, 'DATABASE_URL');
    if (
      testUrl.hostname.toLowerCase() === mainUrl.hostname.toLowerCase() &&
      portOf(testUrl) === portOf(mainUrl) &&
      databaseOf(testUrl) === databaseOf(mainUrl)
    ) {
      throw new TestDatabaseSafetyError(
        'Execution aborted: TEST_DATABASE_URL points to the same host, port, and database as DATABASE_URL.'
      );
    }
  }

  if (!allowedTargetsJson) {
    throw new TestDatabaseSafetyError(
      'Execution aborted: TEST_DATABASE_ALLOWED_TARGETS is required.'
    );
  }

  let configuredTargets;
  try {
    configuredTargets = JSON.parse(allowedTargetsJson);
  } catch {
    throw new TestDatabaseSafetyError(
      'Execution aborted: TEST_DATABASE_ALLOWED_TARGETS must be valid JSON.'
    );
  }

  if (!Array.isArray(configuredTargets)) {
    throw new TestDatabaseSafetyError(
      'Execution aborted: TEST_DATABASE_ALLOWED_TARGETS must be a JSON array.'
    );
  }

  const validTargets = configuredTargets.filter((target) =>
    target &&
    typeof target.host === 'string' && target.host.trim() &&
    Number.isInteger(target.port) && target.port >= 1 && target.port <= 65535 &&
    typeof target.database === 'string' && target.database.trim()
  ).map((target) => ({
    host: target.host.trim().toLowerCase(),
    port: String(target.port),
    database: target.database.trim(),
  }));

  if (validTargets.length === 0) {
    throw new TestDatabaseSafetyError(
      'Execution aborted: TEST_DATABASE_ALLOWED_TARGETS contains no valid targets.'
    );
  }

  const isAllowlisted = validTargets.some((target) =>
    target.host === testUrl.hostname.toLowerCase() &&
    target.port === portOf(testUrl) &&
    target.database === databaseOf(testUrl)
  );

  if (!isAllowlisted) {
    throw new TestDatabaseSafetyError(
      'Execution aborted: TEST_DATABASE_URL does not match an approved test database target.'
    );
  }

  return true;
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
