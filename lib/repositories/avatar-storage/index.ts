import type { AvatarStorageRepository } from "./Interface";
import { LocalAvatarStorageRepository } from "./LocalAvatarStorageRepository";

export type { AvatarStorageRepository } from "./Interface";

// Local filesystem + nginx (VPS) is the active, and now only, implementation
// -- Supabase Storage support was removed as part of the full Supabase
// decommission (see docs/AUTH_MIGRATION.md).
export const avatarStorageRepository: AvatarStorageRepository =
  new LocalAvatarStorageRepository();
