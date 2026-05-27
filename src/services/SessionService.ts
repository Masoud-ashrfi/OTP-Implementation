import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AuthRepository, UserRecord } from "../db/AuthRepository.js";

export interface CreatedSession {
  token: string;
  expiresAt: number;
}

export class SessionService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly expiryHours: number,
    private readonly now: () => number = Date.now,
  ) {}

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  create(userId: string): CreatedSession {
    const token = randomBytes(32).toString("base64url");
    const createdAt = this.now();
    const expiresAt = createdAt + this.expiryHours * 60 * 60 * 1000;
    this.repository.createSession(
      randomUUID(),
      userId,
      this.hashToken(token),
      expiresAt,
      createdAt,
    );
    return { token, expiresAt };
  }

  authenticate(token: string | undefined): UserRecord | undefined {
    if (!token) {
      return undefined;
    }
    return this.repository.findUserBySessionHash(this.hashToken(token), this.now());
  }

  destroy(token: string | undefined): void {
    if (token) {
      this.repository.deleteSession(this.hashToken(token));
    }
  }
}
