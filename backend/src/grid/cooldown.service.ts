import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Tracks the last *accepted* update per user and enforces the configurable
 * cooldown window from the spec ("one accepted update per authorised user
 * during a configurable cooldown period").
 *
 * This is deliberately NOT a generic request-rate limiter (that's a
 * different guarantee — see docs/ARCHITECTURE.md): it only records a
 * timestamp when an update is actually accepted, and only that timestamp
 * gates the next one.
 *
 * In-memory Map today; in a multi-instance deployment this becomes a Redis
 * key per user with a TTL (SET user:<id>:cooldown 1 PX <ms> NX), which also
 * makes the check atomic across instances.
 */
@Injectable()
export class CooldownService {
  private readonly lastAcceptedAt = new Map<string, number>();
  private readonly cooldownMs: number;

  constructor(private readonly config: ConfigService) {
    this.cooldownMs = Number(this.config.get("COOLDOWN_MS", "10000"));
  }

  /** Milliseconds remaining before this user may update again; 0 if allowed now. */
  getRemainingCooldownMs(userId: string): number {
    const last = this.lastAcceptedAt.get(userId);
    if (last === undefined) return 0;
    const elapsed = Date.now() - last;
    return Math.max(0, this.cooldownMs - elapsed);
  }

  recordAccepted(userId: string): void {
    this.lastAcceptedAt.set(userId, Date.now());
  }
}
