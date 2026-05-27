import Database from "better-sqlite3";

export type OtpPurpose = "signup" | "login";

export interface UserRecord {
  id: string;
  fullName: string;
  phone: string;
  verifiedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface OtpChallengeRecord {
  id: string;
  userId: string;
  phone: string;
  purpose: OtpPurpose;
  otpHash: string;
  attempts: number;
  expiresAt: number;
  resendAvailableAt: number;
  consumedAt: number | null;
  createdAt: number;
}

interface SessionUserRow {
  id: string;
  full_name: string;
  phone: string;
  verified_at: number | null;
  created_at: number;
  updated_at: number;
}

function mapUser(row: SessionUserRow): UserRecord {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChallenge(row: Record<string, unknown>): OtpChallengeRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    phone: row.phone as string,
    purpose: row.purpose as OtpPurpose,
    otpHash: row.otp_hash as string,
    attempts: row.attempts as number,
    expiresAt: row.expires_at as number,
    resendAvailableAt: row.resend_available_at as number,
    consumedAt: row.consumed_at as number | null,
    createdAt: row.created_at as number,
  };
}

export class AuthRepository {
  constructor(private readonly database: Database.Database) {}

  findUserByPhone(phone: string): UserRecord | undefined {
    const row = this.database
      .prepare("SELECT * FROM users WHERE phone = ?")
      .get(phone) as SessionUserRow | undefined;
    return row ? mapUser(row) : undefined;
  }

  findUserById(id: string): UserRecord | undefined {
    const row = this.database
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(id) as SessionUserRow | undefined;
    return row ? mapUser(row) : undefined;
  }

  createUser(user: UserRecord): void {
    this.database
      .prepare(
        `INSERT INTO users (id, full_name, phone, verified_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(user.id, user.fullName, user.phone, user.verifiedAt, user.createdAt, user.updatedAt);
  }

  updatePendingUserName(id: string, fullName: string, updatedAt: number): void {
    this.database
      .prepare("UPDATE users SET full_name = ?, updated_at = ? WHERE id = ? AND verified_at IS NULL")
      .run(fullName, updatedAt, id);
  }

  markUserVerified(id: string, verifiedAt: number): void {
    this.database
      .prepare("UPDATE users SET verified_at = ?, updated_at = ? WHERE id = ?")
      .run(verifiedAt, verifiedAt, id);
  }

  createChallenge(challenge: OtpChallengeRecord): void {
    this.database
      .prepare(
        `INSERT INTO otp_challenges (
          id, user_id, phone, purpose, otp_hash, attempts, expires_at,
          resend_available_at, consumed_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        challenge.id,
        challenge.userId,
        challenge.phone,
        challenge.purpose,
        challenge.otpHash,
        challenge.attempts,
        challenge.expiresAt,
        challenge.resendAvailableAt,
        challenge.consumedAt,
        challenge.createdAt,
      );
  }

  findChallenge(id: string): OtpChallengeRecord | undefined {
    const row = this.database
      .prepare("SELECT * FROM otp_challenges WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    return row ? mapChallenge(row) : undefined;
  }

  findLatestChallenge(userId: string, purpose: OtpPurpose): OtpChallengeRecord | undefined {
    const row = this.database
      .prepare(
        "SELECT * FROM otp_challenges WHERE user_id = ? AND purpose = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
      )
      .get(userId, purpose) as Record<string, unknown> | undefined;
    return row ? mapChallenge(row) : undefined;
  }

  countChallengesSince(phone: string, since: number): number {
    const result = this.database
      .prepare("SELECT COUNT(*) AS count FROM otp_challenges WHERE phone = ? AND created_at >= ?")
      .get(phone, since) as { count: number };
    return result.count;
  }

  invalidateOpenChallenges(userId: string, purpose: OtpPurpose, at: number): void {
    this.database
      .prepare(
        "UPDATE otp_challenges SET consumed_at = ? WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL",
      )
      .run(at, userId, purpose);
  }

  recordFailedAttempt(id: string, attempts: number, lockAt: number | null): void {
    this.database
      .prepare("UPDATE otp_challenges SET attempts = ?, consumed_at = COALESCE(?, consumed_at) WHERE id = ?")
      .run(attempts, lockAt, id);
  }

  consumeChallenge(id: string, at: number): void {
    this.database
      .prepare("UPDATE otp_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL")
      .run(at, id);
  }

  createSession(id: string, userId: string, tokenHash: string, expiresAt: number, createdAt: number): void {
    this.database
      .prepare(
        "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, userId, tokenHash, expiresAt, createdAt);
  }

  findUserBySessionHash(tokenHash: string, now: number): UserRecord | undefined {
    const row = this.database
      .prepare(
        `SELECT users.*
         FROM sessions JOIN users ON users.id = sessions.user_id
         WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
      )
      .get(tokenHash, now) as SessionUserRow | undefined;
    return row ? mapUser(row) : undefined;
  }

  deleteSession(tokenHash: string): void {
    this.database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }
}
