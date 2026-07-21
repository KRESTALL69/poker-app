import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { AppSettingsRepository } from "./Interface";

export class PostgresAppSettingsRepository implements AppSettingsRepository {
  async getBool(key: string): Promise<boolean> {
    const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key));

    return row?.value === true;
  }

  async setBool(key: string, value: boolean): Promise<void> {
    const updatedAt = new Date().toISOString();

    await db
      .insert(appSettings)
      .values({ key, value, updatedAt })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedAt },
      });
  }
}
