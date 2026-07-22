import type { EmailOtpPurpose } from "@/lib/db/schema";

export type { EmailOtpPurpose } from "@/lib/db/schema";

export interface EmailOtpRow {
  id: string;
  email: string;
  purpose: EmailOtpPurpose;
  player_id: string | null;
  code_hash: string;
  expires_at: string;
  resend_after_at: string;
  failed_attempts: number;
  consumed_at: string | null;
}

export interface EmailOtpInsert {
  email: string;
  purpose: EmailOtpPurpose;
  player_id: string | null;
  code_hash: string;
  expires_at: string;
  resend_after_at: string;
  failed_attempts: number;
}

// Deliberately a thin CRUD surface, not a business-logic layer: code
// generation/hashing, expiry math, retry-after math, and attempt-limit
// decisions all stay in lib/email-otp.ts (same split as ReRaise's
// EmailOtpRepository).
export interface EmailOtpRepository {
  findLatestActive(email: string, purpose: EmailOtpPurpose): Promise<EmailOtpRow | null>;
  invalidateActive(email: string, purpose: EmailOtpPurpose): Promise<void>;
  create(input: EmailOtpInsert): Promise<void>;
  incrementFailedAttempts(id: string, nextFailedAttempts: number): Promise<void>;
  markConsumed(id: string): Promise<void>;
}
