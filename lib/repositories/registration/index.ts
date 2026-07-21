import { databaseProvider } from "../provider";
import type { RegistrationRepository } from "./Interface";
import { PostgresRegistrationRepository } from "./PostgresRegistrationRepository";
import { SupabaseRegistrationRepository } from "./SupabaseRegistrationRepository";

export const registrationRepository: RegistrationRepository =
  databaseProvider === "postgres"
    ? new PostgresRegistrationRepository()
    : new SupabaseRegistrationRepository();
export type { RegistrationRepository, RegistrationStatusAndTournament } from "./Interface";
