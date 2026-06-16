import { env } from "@/lib/env";
import { OPENAI_AUDIO_BASE_URL } from "@/lib/ai";
import { ServiceUnavailableError, TooManyRequestsError } from "@/lib/errors";

/** Force English transcription so spoken input isn't auto-detected as another
 *  language (e.g. "hello" coming back as Devanagari). */
const STT_LANGUAGE = "en";

/** Tone steer for the steerable GPT-4o TTS family (ignored by tts-1 models, so
 *  only sent when the configured model supports it). Keeps Ava's spoken voice
 *  on-brand: a warm New Zealand property guide. */
const TTS_INSTRUCTIONS =
  "Speak as Ava, a warm, friendly New Zealand real-estate guide. Natural, clear, and conversational — never robotic or rushed.";

/** Pull a concise reason out of an OpenAI error body, for surfacing/logging. */
function upstreamMessage(body: string): string | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed?.error?.message) return parsed.error.message;
  } catch {
    /* not JSON */
  }
  return body.slice(0, 160);
}

/**
 * Voice business logic: turns recorded audio into text and text into speech via
 * OpenAI's audio API. No HTTP boundary here — the controller owns request/
 * response; this takes a `Blob` / `string` in and returns a string / audio stream.
 *
 * Keeping the brain (the OpenRouter chat model) untouched: STT only produces
 * transcript text, which the client then sends through the EXISTING /api/assistant
 * pipeline — so dictation inherits all tools + guardrails for free.
 */

/**
 * Transcribe a recorded audio clip. Returns the (trimmed) transcript, possibly
 * empty if the model heard nothing.
 *
 * @param audio  the recorded clip (the Blob from our multipart upload route)
 * @param format the audio container, e.g. "webm" / "mp4" / "wav" (see
 *               `audioFormatForType`) — used as the upload's file extension so
 *               OpenAI detects the container correctly.
 */
export async function transcribeAudio(
  audio: Blob,
  format: string,
): Promise<string> {
  if (!env.OPENAI_API_KEY) {
    // Mirrors the assistant: the feature is optional and 503s until configured.
    throw new ServiceUnavailableError("Voice input isn't available right now.");
  }

  // OpenAI's transcription endpoint is a multipart/form-data file upload (unlike
  // OpenRouter's JSON+base64 shape). The container is inferred from the file
  // name's extension, so we name the part `audio.<format>`. Don't set
  // Content-Type by hand — fetch adds the multipart boundary.
  const form = new FormData();
  form.append("file", audio, `audio.${format}`);
  form.append("model", env.VOICE_STT_MODEL);
  form.append("language", STT_LANGUAGE);
  form.append("response_format", "json");

  let res: Response;
  try {
    res = await fetch(`${OPENAI_AUDIO_BASE_URL}/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: form,
    });
  } catch (cause) {
    console.error("[voice] transcription request failed:", cause);
    throw new ServiceUnavailableError(
      "Couldn't reach the voice service. Please try again.",
    );
  }

  const raw = await res.text();

  if (!res.ok) {
    console.error("[voice] transcription error:", res.status, raw.slice(0, 500));
    if (res.status === 429) {
      throw new TooManyRequestsError(
        "The voice service is busy. Please try again shortly.",
      );
    }
    const hint = upstreamMessage(raw);
    throw new ServiceUnavailableError(
      hint
        ? `Couldn't transcribe that audio: ${hint}`
        : "Couldn't transcribe that audio. Please try again.",
    );
  }

  // The response is JSON ({ text, ... }); fall back to a plain-text body just in
  // case `response_format` were ever changed to "text".
  try {
    const data = JSON.parse(raw) as { text?: unknown };
    if (typeof data?.text === "string") return data.text.trim();
    return "";
  } catch {
    return raw.trim();
  }
}

/**
 * Synthesize speech for a short piece of text. Returns the upstream audio stream
 * + its content-type so the controller can pipe it straight to the client over
 * chunked HTTP (no WebSocket needed — fits Vercel).
 */
export async function synthesizeSpeech(
  text: string,
): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string }> {
  if (!env.OPENAI_API_KEY) {
    throw new ServiceUnavailableError("Spoken replies aren't available right now.");
  }

  // `instructions` only applies to the steerable GPT-4o TTS family; sending it
  // to tts-1/tts-1-hd would be rejected, so gate it on the model name.
  const supportsInstructions = env.VOICE_TTS_MODEL.includes("gpt-4o");

  let res: Response;
  try {
    res = await fetch(`${OPENAI_AUDIO_BASE_URL}/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.VOICE_TTS_MODEL,
        voice: env.VOICE_TTS_VOICE,
        input: text,
        response_format: "mp3",
        ...(supportsInstructions ? { instructions: TTS_INSTRUCTIONS } : {}),
      }),
    });
  } catch (cause) {
    console.error("[voice] speech request failed:", cause);
    throw new ServiceUnavailableError(
      "Couldn't reach the voice service. Please try again.",
    );
  }

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    console.error("[voice] speech error:", res.status, detail.slice(0, 500));
    if (res.status === 429) {
      throw new TooManyRequestsError(
        "The voice service is busy. Please try again shortly.",
      );
    }
    const hint = upstreamMessage(detail);
    throw new ServiceUnavailableError(
      hint
        ? `Couldn't generate the spoken reply: ${hint}`
        : "Couldn't generate the spoken reply. Please try again.",
    );
  }

  return {
    stream: res.body,
    contentType: res.headers.get("content-type") ?? "audio/mpeg",
  };
}
