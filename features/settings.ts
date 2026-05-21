import { supabase } from "@/lib/supabase";

export async function getAppSettingBool(key: string): Promise<boolean> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .single();
  return data?.value === true;
}
