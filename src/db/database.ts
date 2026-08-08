import Database from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

interface TableColumn {
  name: string;
}

function ensureUserOtpSecurityColumns(database: Database.Database): void {
  const columns = database.pragma("table_info(users)") as TableColumn[];
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("otp_failed_attempts")) {
    database.exec(
      "ALTER TABLE users ADD COLUMN otp_failed_attempts INTEGER NOT NULL DEFAULT 0",
    );
  }

  if (!names.has("otp_locked_until")) {
    database.exec("ALTER TABLE users ADD COLUMN otp_locked_until INTEGER");
  }
}

export function createDatabase(databasePath: string): Database.Database {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  if (databasePath !== ":memory:") {
    database.pragma("journal_mode = WAL");
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      verified_at INTEGER,
      otp_failed_attempts INTEGER NOT NULL DEFAULT 0,
      otp_locked_until INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS otp_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK (purpose IN ('signup', 'login')),
      otp_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER NOT NULL,
      resend_available_at INTEGER NOT NULL,
      consumed_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_otp_phone_created
      ON otp_challenges(phone, created_at);

    CREATE INDEX IF NOT EXISTS idx_otp_user_purpose_created
      ON otp_challenges(user_id, purpose, created_at);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  ensureUserOtpSecurityColumns(database);

  return database;
}
