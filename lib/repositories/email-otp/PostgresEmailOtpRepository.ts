import { db } from "@/lib/db";
import { emailOtpCodes } from "@/lib/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { EmailOtpInsert, EmailOtpPurpose, EmailOtpRepository, EmailOtpRow } from "./Interface";

function toRow(record: typeof emailOtpCodes.$inferSelect): EmailOtpRow {
  return {
    id: record.id,
    email: record.email,
    purpose: record.purpose as EmailOtpPurpose,
    player_id: record.playerId,
    code_hash: record.codeHash,
    expires_at: record.expiresAt,
    resend_after_at: record.resendAfterAt,
    failed_attempts: record.failedAttempts,
    consumed_at: record.consumedAt,
  };
}

export class PostgresEmailOtpRepository implements EmailOtpRepository {
  async findLatestActive(email: string, purpose: EmailOtpPurpose): Promise<EmailOtpRow | null> {
    const [row] = await db
      .select()
      .from(emailOtpCodes)
      .where(
        and(
          eq(emailOtpCodes.email, email),
          eq(emailOtpCodes.purpose, purpose),
          isNull(emailOtpCodes.consumedAt)
        )
      )
      .orderBy(desc(emailOtpCodes.createdAt))
      .limit(1);

    return row ? toRow(row) : null;
  }

  async invalidateActive(email: string, purpose: EmailOtpPurpose): Promise<void> {
    await db
      .update(emailOtpCodes)
      .set({ consumedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(emailOtpCodes.email, email),
          eq(emailOtpCodes.purpose, purpose),
          isNull(emailOtpCodes.consumedAt)
        )
      );
  }

  async create(input: EmailOtpInsert): Promise<void> {
    await db.insert(emailOtpCodes).values({
      email: input.email,
      purpose: input.purpose,
      playerId: input.player_id,
      codeHash: input.code_hash,
      expiresAt: input.expires_at,
      resendAfterAt: input.resend_after_at,
      failedAttempts: input.failed_attempts,
    });
  }

  async incrementFailedAttempts(id: string, nextFailedAttempts: number): Promise<void> {
    await db
      .update(emailOtpCodes)
      .set({ failedAttempts: nextFailedAttempts, updatedAt: new Date().toISOString() })
      .where(eq(emailOtpCodes.id, id));
  }

  async markConsumed(id: string): Promise<void> {
    await db
      .update(emailOtpCodes)
      .set({ consumedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(eq(emailOtpCodes.id, id));
  }
}
