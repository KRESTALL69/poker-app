export interface AvatarStorageRepository {
  /** Uploads a player's avatar and returns its public URL. */
  uploadAvatar(playerId: string, file: File): Promise<string>;
}
