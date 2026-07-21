import type { AvatarStorageRepository } from "./Interface";
import { SupabaseAvatarStorageRepository } from "./SupabaseAvatarStorageRepository";

export const avatarStorageRepository: AvatarStorageRepository = new SupabaseAvatarStorageRepository();
export type { AvatarStorageRepository } from "./Interface";
