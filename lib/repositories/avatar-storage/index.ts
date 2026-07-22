import type { AvatarStorageRepository } from "./Interface";
import { LocalAvatarStorageRepository } from "./LocalAvatarStorageRepository";

export type { AvatarStorageRepository } from "./Interface";
export { SupabaseAvatarStorageRepository } from "./SupabaseAvatarStorageRepository";

// Local filesystem + nginx (VPS) is the active implementation -- see
// docs/POSTGRES_MIGRATION_AUDIT.md's Storage follow-up. Storage was never
// tied to DATABASE_PROVIDER (it's a separate axis, same precedent as
// ReRaise's own avatar-storage/index.ts), so this is a plain instantiation,
// not an env-var switch: SupabaseAvatarStorageRepository stays exported
// above for older environments/rollback, wired back in here with a
// one-line change if ever needed.
export const avatarStorageRepository: AvatarStorageRepository =
  new LocalAvatarStorageRepository();
