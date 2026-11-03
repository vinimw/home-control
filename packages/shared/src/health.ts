/** Response contract of the API health endpoint, shared by api and web. */
export interface HealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

export const API_HEALTH_PATH = '/health';
