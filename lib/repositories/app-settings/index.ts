import { databaseProvider } from "../provider";
import type { AppSettingsRepository } from "./Interface";
import { PostgresAppSettingsRepository } from "./PostgresAppSettingsRepository";
import { SupabaseAppSettingsRepository } from "./SupabaseAppSettingsRepository";

export const appSettingsRepository: AppSettingsRepository =
  databaseProvider === "postgres" ? new PostgresAppSettingsRepository() : new SupabaseAppSettingsRepository();
export type { AppSettingsRepository };
