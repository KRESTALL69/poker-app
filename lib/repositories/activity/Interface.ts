export interface ActivityEventRow {
  id: string;
  event_type: string;
  event_label: string | null;
  metadata: Record<string, unknown> | null;
  platform: string;
  session_id: string | null;
  created_at: string;
}

export interface ActivitySummaryRow {
  player_id: string;
  created_at: string;
  event_type: string;
}

export interface LogActivityEventInput {
  playerId: string;
  eventType: string;
  eventLabel?: string | null;
  metadata?: Record<string, unknown> | null;
  platform?: "telegram" | "web" | "unknown";
  sessionId?: string | null;
}

export interface ActivityRepository {
  log(input: LogActivityEventInput): Promise<void>;
  findByPlayerId(playerId: string, limit: number): Promise<ActivityEventRow[]>;
  findPlayerIdsSince(params: { playerIds: string[]; since: string }): Promise<string[]>;
  countSince(params: { playerIds: string[]; since: string; eventType?: string }): Promise<number>;
  findSummarySince(params: { since: string; playerIds?: string[] }): Promise<ActivitySummaryRow[]>;
}
