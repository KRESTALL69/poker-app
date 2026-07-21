import { supabase } from "@/lib/supabase";
import type { SeasonRepository, SeasonRow } from "./Interface";

export class SupabaseSeasonRepository implements SeasonRepository {
  async findActiveId(): Promise<string | null> {
    const { data, error } = await supabase
      .from("seasons")
      .select("id")
      .eq("is_active", true)
      .limit(1)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }

    return data.id;
  }

  async findActive(): Promise<SeasonRow | null> {
    const { data, error } = await supabase
      .from("seasons")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }

    return data as SeasonRow;
  }

  async findById(seasonId: string): Promise<SeasonRow> {
    const { data, error } = await supabase
      .from("seasons")
      .select("*")
      .eq("id", seasonId)
      .single();

    if (error) throw error;

    return data as SeasonRow;
  }

  async list(): Promise<SeasonRow[]> {
    const { data, error } = await supabase
      .from("seasons")
      .select("id, title, start_date, end_date, is_active")
      .order("start_date", { ascending: false });

    if (error) throw error;

    return (data ?? []) as SeasonRow[];
  }

  async create(input: {
    title: string;
    startDate: string;
    isActive: boolean;
  }): Promise<SeasonRow> {
    const { data, error } = await supabase
      .from("seasons")
      .insert({ title: input.title, start_date: input.startDate, is_active: input.isActive })
      .select("*")
      .single();

    if (error) throw error;

    return data as SeasonRow;
  }

  async closeById(seasonId: string, endDate: string): Promise<void> {
    const { error } = await supabase
      .from("seasons")
      .update({ is_active: false, end_date: endDate })
      .eq("id", seasonId);

    if (error) throw error;
  }

  async deactivateOthers(exceptSeasonId: string): Promise<void> {
    const { error } = await supabase
      .from("seasons")
      .update({ is_active: false })
      .eq("is_active", true)
      .neq("id", exceptSeasonId);

    if (error) throw error;
  }

  async activateById(seasonId: string): Promise<void> {
    const { error } = await supabase
      .from("seasons")
      .update({ is_active: true, end_date: null })
      .eq("id", seasonId);

    if (error) throw error;
  }

  async closeActiveSeason(endDate: string): Promise<void> {
    const { error } = await supabase
      .from("seasons")
      .update({ is_active: false, end_date: endDate })
      .eq("is_active", true);

    if (error) throw error;
  }
}
