export interface AppSettingsRepository {
  getBool(key: string): Promise<boolean>;
  setBool(key: string, value: boolean): Promise<void>;
}
