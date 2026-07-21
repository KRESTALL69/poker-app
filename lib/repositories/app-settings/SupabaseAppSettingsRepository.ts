import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AppSettingsRepository } from "./Interface";

export class SupabaseAppSettingsRepository implements AppSettingsRepository {
  async getBool(key: string): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    return data?.value === true;
  }

  async setBool(key: string, value: boolean): Promise<void> {
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() });

    if (error) throw error;
  }
}
