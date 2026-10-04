import { VOICE_MAX_BYTES } from "@atomes/core";
import { advanceVoice, findPromptAnswerById } from "@atomes/db/repositories/profiles";
import { sniffAudio, voiceKey } from "@atomes/media/audio";
import type { Task } from "graphile-worker";
import { z } from "zod";
import type { MediaDependencies } from "./process-photo";

const payloadSchema = z.object({ answerId: z.uuid() });

/**
 * Checks an uploaded voice answer (PRO-06): the bytes must really be the
 * declared audio container and stay under the size ceiling. The recording
 * is then published under `voices/`. Idempotent like the photo job.
 */
export function processVoiceTask({ database, storage }: MediaDependencies): Task {
  return async (rawPayload, helpers) => {
    const { answerId } = payloadSchema.parse(rawPayload);
    const db = database();
    const answer = await findPromptAnswerById(db, answerId);
    if (answer?.voiceStage !== "processing" || !answer.voiceKey || !answer.voiceContentType) {
      return;
    }
    const source = answer.voiceKey;
    const store = storage();
    if (!(await store.head(source))) {
      await advanceVoice(db, answer.id, "processing", "failed");
      return;
    }
    const bytes = await store.read(source);
    if (bytes.length > VOICE_MAX_BYTES || sniffAudio(bytes) !== answer.voiceContentType) {
      await advanceVoice(db, answer.id, "processing", "failed", null);
      await store.remove(source);
      helpers.logger.info("voice answer rejected: not the declared audio format");
      return;
    }
    const voiceId = source.split("/").at(-1) ?? "";
    const target = voiceKey(answer.userId, voiceId, answer.voiceContentType);
    await store.write(target, bytes, answer.voiceContentType);
    await advanceVoice(db, answer.id, "processing", "ready", target);
    await store.remove(source);
  };
}
