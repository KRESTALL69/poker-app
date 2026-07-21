import { appSettingsRepository } from "@/lib/repositories/app-settings";

export async function getAppSettingBool(key: string): Promise<boolean> {
  return appSettingsRepository.getBool(key);
}

export async function setAppSettingBool(key: string, value: boolean): Promise<void> {
  return appSettingsRepository.setBool(key, value);
}
