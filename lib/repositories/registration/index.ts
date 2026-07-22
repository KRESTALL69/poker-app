import type { RegistrationRepository } from "./Interface";
import { PostgresRegistrationRepository } from "./PostgresRegistrationRepository";

export const registrationRepository: RegistrationRepository = new PostgresRegistrationRepository();
export type { RegistrationRepository, RegistrationStatusAndTournament } from "./Interface";
