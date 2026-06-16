import { z } from "zod";

/**
 * Validated environment variables.
 *
 * Add new vars to the schema below as features need them. Server-only secrets
 * go in `server`; anything the browser needs MUST be prefixed `NEXT_PUBLIC_`
 * and added to `client` (Next.js only inlines `NEXT_PUBLIC_*` into the bundle).
 *
 * Importing `env` anywhere fails fast at startup if a required var is missing,
 * instead of surfacing as a confusing runtime `undefined` later.
 */
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // --- MongoDB (Better Auth adapter + app data) ---
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DB_NAME: z.string().min(1, "MONGODB_DB_NAME is required"),

  // --- Better Auth ---
  BETTER_AUTH_SECRET: z.string().min(1, "BETTER_AUTH_SECRET is required"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),

  // --- Email (optional; OTP is logged to console when unset) ---
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().email().optional(),

  // --- Cron (saved-search alerts) ---
  // Shared secret required in the `x-cron-secret` header to run /api/cron/*.
  // When unset, the cron endpoints are disabled (503) rather than open.
  CRON_SECRET: z.string().optional(),

  // --- AWS S3 (listing images; optional — uploads disabled until all set) ---
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_NAME: z.string().optional(),
  // Optional public base (e.g. CloudFront). Defaults to the bucket's S3 URL.
  S3_PUBLIC_URL: z.string().url().optional(),

  // --- AI assistant (OpenRouter via the Vercel AI SDK; optional — the
  // assistant endpoint responds 503 until OPENROUTER_API_KEY is set) ---
  OPENROUTER_API_KEY: z.string().optional(),
  // OpenRouter model slug. Override to the latest Claude Sonnet as it ships
  // (e.g. "anthropic/claude-sonnet-4.6"); the default is a known-good Sonnet.
  OPENROUTER_MODEL: z.string().min(1).default("anthropic/claude-sonnet-4"),
  // Optional cheaper fallback OpenRouter routes to if the primary is down.
  OPENROUTER_FALLBACK_MODEL: z.string().optional(),

  // --- Voice (cascade speech-to-text / text-to-speech via OpenAI's audio API;
  // optional — the voice routes respond 503 until OPENAI_API_KEY is set). The
  // assistant "brain" still runs on OpenRouter; only the ears (STT) and mouth
  // (TTS) are OpenAI. Models below are OpenAI-native, swappable without code. ---
  OPENAI_API_KEY: z.string().optional(),
  // STT for dictation. "gpt-4o-transcribe" is most accurate; "gpt-4o-mini-transcribe"
  // is cheaper; "whisper-1" is the legacy fallback.
  VOICE_STT_MODEL: z.string().min(1).default("gpt-4o-transcribe"),
  // TTS for spoken replies. "gpt-4o-mini-tts" is the steerable, natural GPT-4o
  // voice (supports tone `instructions`); "tts-1"/"tts-1-hd" are the classic
  // models. OpenAI voices: alloy, ash, ballad, coral, echo, fable, nova, onyx,
  // sage, shimmer, verse — set VOICE_TTS_VOICE to one of these.
  VOICE_TTS_MODEL: z.string().min(1).default("gpt-4o-mini-tts"),
  VOICE_TTS_VOICE: z.string().min(1).default("coral"),

  // --- Browser-exposed ---
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Invalid environment variables:",
    parsed.error.flatten().fieldErrors,
  );
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
