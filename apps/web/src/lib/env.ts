import { z } from 'zod';

const schema = z.object({
  // Server-side URL of the API (Docker: http://api:3001).
  API_INTERNAL_URL: z
    .url({ protocol: /^https?$/, message: 'must be an http(s) URL' })
    .default('http://localhost:3001'),
});

const result = schema.safeParse(process.env);

if (!result.success) {
  const problems = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  throw new Error(`Invalid web configuration:\n${problems.join('\n')}\nSee .env.example.`);
}

export const env = result.data;
