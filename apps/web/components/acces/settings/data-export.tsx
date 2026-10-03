"use client";

import { Button, useToast } from "@epilove/ui";
import { Download } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { api, errorCode } from "@/lib/api-client";

type Export = Awaited<ReturnType<(typeof api)["account"]["exports"]>>["exports"][number];

/** Self-service export (SAF-14): built in the background, downloadable for 7 days. */
export function DataExport() {
  const t = useTranslations("settings.data");
  const format = useFormatter();
  const toast = useToast();
  const [exports, setExports] = useState<Export[]>([]);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    setExports((await api.account.exports()).exports);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // While an export is being prepared, check again now and then.
  useEffect(() => {
    if (!exports.some((item) => item.status === "pending")) {
      return;
    }
    const timer = setTimeout(() => void load(), 4000);
    return () => clearTimeout(timer);
  }, [exports, load]);

  async function request() {
    setPending(true);
    try {
      await api.account.requestExport();
      toast.success(t("exportRequested"));
      await load();
    } catch (error) {
      toast.error(errorCode(error) === "RATE_LIMITED" ? t("exportRateLimited") : t("exportFailed"));
    } finally {
      setPending(false);
    }
  }

  const latest = exports[0];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-paper/70 text-sm">{t("exportHelp")}</p>
      {latest ? (
        <p className="flex items-center gap-3 text-sm">
          {latest.status === "pending" ? <span className="text-paper/70">{t("exportPending")}</span> : null}
          {latest.status === "failed" ? <span className="text-danger">{t("exportFailed")}</span> : null}
          {latest.downloadPath && latest.expiresAt ? (
            <>
              <span className="text-paper/70">
                {t("exportReady", {
                  date: format.dateTime(new Date(latest.expiresAt), { dateStyle: "medium" }),
                })}
              </span>
              <a
                href={latest.downloadPath}
                className="inline-flex items-center gap-1.5 font-semibold text-plasma underline-offset-4 hover:underline"
              >
                <Download className="size-4" aria-hidden="true" />
                {t("exportDownload")}
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      <Button variant="secondary" className="self-start" loading={pending} onClick={() => void request()}>
        {t("export")}
      </Button>
    </div>
  );
}
