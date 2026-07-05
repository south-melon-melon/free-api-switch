import { z } from 'zod';
import { INTERFACE_TYPES, LOG_LEVELS, THINKING_LEVELS } from '../core/types.js';

export const appSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  log_level: z.enum(LOG_LEVELS),
  request_timeout_ms: z.number().int().positive(),
  local_key: z.string().min(1),
  default_openai_model: z.string().min(1),
  default_anthropic_model: z.string().min(1),
}).strict();

export const profileSchema = z.object({
  model_name: z.string().min(1),
  model_id: z.string().min(1),
  enabled: z.boolean().default(true),
  type: z.enum(INTERFACE_TYPES),
  base_url: z.string().url(),
  api_key: z.string().min(1),
  max_output_tokens: z.number().int().positive().optional(),
  max_context_tokens: z.number().int().positive().optional(),
  thinking_level: z.enum(THINKING_LEVELS).optional(),
  defaults: z.record(z.unknown()).default({}),
}).strict();

export const profilesSchema = z.object({
  profiles: z.array(profileSchema),
}).strict();
