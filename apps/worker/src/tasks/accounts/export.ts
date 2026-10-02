import { identityOf } from "@epilove/db/repositories/admin";
import {
  collectPersonalData,
  findExport,
  markExportFailed,
  markExportReady,
} from "@epilove/db/repositories/exports";
import { createMailer, dataExportReadyEmail, mailerConfigFromEnv } from "@epilove/email";
import { strToU8, zipSync } from "fflate";
import type { Task } from "graphile-worker";
import { z } from "zod";
import type { AccountsDependencies } from "./purge";

const payloadSchema = z.object({ exportId: z.uuid() });

/** Exports stay downloadable this long. */
export const EXPORT_TTL_DAYS = 7;

export interface ExportDependencies extends AccountsDependencies {
  readonly sendEmail?: (to: string, email: ReturnType<typeof dataExportReadyEmail>) => Promise<void>;
  readonly appUrl?: string;
}

/**
 * Builds the SAF-14 export: `donnees.json` plus the member's photos, zipped
 * into object storage, then emails a link that only works when signed in.
 */
export function exportTask({
  database,
  storage,
  now = () => new Date(),
  sendEmail,
  appUrl = process.env.APP_URL ?? "http://localhost:3000",
}: ExportDependencies): Task {
  return async (rawPayload, helpers) => {
    const { exportId } = payloadSchema.parse(rawPayload);
    const db = database();
    const row = await findExport(db, exportId);
    if (row?.status !== "pending") {
      return;
    }
    try {
      const data = await collectPersonalData(db, row.userId);
      const files: Record<string, Uint8Array> = {};
      const photos = [];
      for (const [index, item] of data.photos.entries()) {
        const file = item.stage === "ready" ? `photos/${index + 1}.webp` : null;
        if (file) {
          files[file] = await storage().read(item.storageKey);
        }
        photos.push({ file, status: item.status, altText: item.altText, uploadedAt: item.createdAt });
      }
      const document = {
        exportedAt: now().toISOString(),
        notice:
          "Export de tes données Epilove (RGPD, art. 15 et 20). Les genres que tu recherches, donnée sensible, ne sont jamais exportés : tu les retrouves dans tes réglages.",
        ...data,
        photos,
      };
      files["donnees.json"] = strToU8(JSON.stringify(document, null, 2));
      const zip = zipSync(files, { level: 6 });
      const key = `exports/${row.userId}/${exportId}.zip`;
      await storage().write(key, zip, "application/zip");
      const at = now();
      await markExportReady(db, exportId, key, at, new Date(at.getTime() + EXPORT_TTL_DAYS * 86_400_000));

      const identity = await identityOf(db, row.userId);
      if (identity) {
        const email = dataExportReadyEmail(`${appUrl}/api/export/${exportId}`, EXPORT_TTL_DAYS);
        const send = sendEmail ?? ((to, message) => createMailer(mailerConfigFromEnv()).send(to, message));
        await send(identity.email, email).catch(() => helpers.logger.warn("export email could not be sent"));
      }
    } catch (error) {
      await markExportFailed(db, exportId);
      throw error;
    }
  };
}
