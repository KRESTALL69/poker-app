import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AvatarStorageRepository } from "./Interface";

export class SupabaseAvatarStorageRepository implements AvatarStorageRepository {
  async uploadAvatar(playerId: string, file: File): Promise<string> {
    const filePath = `${playerId}/avatar`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("avatars")
      .upload(filePath, file, {
        upsert: true,
        contentType: file.type,
      });

    if (uploadError) throw uploadError;

    const { data } = supabaseAdmin.storage.from("avatars").getPublicUrl(filePath);
    return data.publicUrl;
  }
}
