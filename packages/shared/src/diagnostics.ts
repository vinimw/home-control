export interface DiagnosticEvent {
  id: string;
  operationId: string;
  at: string;
  completedAt: string | null;
  kind: 'operation' | 'rest' | 'ws-out' | 'ws-in' | 'connection';
  source: string;
  action: string;
  target: string | null;
  status: number | null;
  outcome: string;
  durationMs: number | null;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
}
export interface DiagnosticsPage {
  events: DiagnosticEvent[];
  total: number;
  counts: Record<string, number>;
  buckets: Array<{ at: string; requests: number; errors: number }>;
  collector: {
    startedAt: string;
    failures: number;
    retentionDays: number;
    maxEvents: number;
    oldestAt: string | null;
  };
}
