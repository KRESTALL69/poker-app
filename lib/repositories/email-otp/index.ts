import type { EmailOtpRepository } from "./Interface";
import { PostgresEmailOtpRepository } from "./PostgresEmailOtpRepository";

export type { EmailOtpRepository, EmailOtpRow, EmailOtpInsert, EmailOtpPurpose } from "./Interface";

// No Supabase fallback exists for this domain -- OTP codes were never a
// Supabase table (Supabase Auth generated/stored them internally, invisibly
// to this codebase), so there's nothing to switch back to. Plain
// instantiation, same as avatar-storage/index.ts.
export const emailOtpRepository: EmailOtpRepository = new PostgresEmailOtpRepository();
