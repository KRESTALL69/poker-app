import type { AppSettingsRepository } from "./Interface";
import { PostgresAppSettingsRepository } from "./PostgresAppSettingsRepository";

export const appSettingsRepository: AppSettingsRepository = new PostgresAppSettingsRepository();
export type { AppSettingsRepository };
