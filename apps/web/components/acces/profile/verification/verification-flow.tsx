"use client";

import type { VerificationState } from "@epilove/contracts";
import type { VerificationGesture } from "@epilove/core";
import { Button, buttonVariants, cn } from "@epilove/ui";
import { Camera, CircleCheck, Clock, RotateCcw, ScanFace, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { api, errorCode } from "../../api-client";
import { decodeImage, postPresignedForm, renderCrop } from "../../media/prepare-image";

const GESTURE_GLYPHS: Record<VerificationGesture, string> = {
  peace: "✌️",
  thumbs_up: "👍",
  hand_on_head: "🙆",
  three_fingers: "3️⃣",
  point_up: "☝️",
  ok_sign: "👌",
  open_palm: "✋",
  hand_on_chin: "🤔",
};

type Attempt = NonNullable<VerificationState["latest"]>;

function freshAttempt(state: VerificationState): Attempt | null {
  const latest = state.latest;
  return latest?.status === "uploading" && new Date(latest.expiresAt).getTime() > Date.now() ? latest : null;
}

function Card({
  tone,
  icon,
  title,
  children,
}: {
  tone: "info" | "success" | "warning";
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex gap-4 rounded-[2rem] border p-5",
        tone === "success" && "border-success/40 bg-success/10",
        tone === "warning" && "border-danger/40 bg-danger/10",
        tone === "info" && "border-paper/15 bg-paper/[0.04]",
      )}
    >
      <span className="mt-0.5 shrink-0 [&_svg]:size-6">{icon}</span>
      <div className="flex flex-col gap-1">
        <p className="font-semibold">{title}</p>
        <div className="text-paper/75 text-sm">{children}</div>
      </div>
    </div>
  );
}

/** Live camera when available, the system camera app otherwise. */
function SelfieCapture({
  attempt,
  onSent,
}: {
  attempt: Attempt;
  onSent: (state: VerificationState) => void;
}) {
  const t = useTranslations("profile.verification");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mode, setMode] = useState<"idle" | "live" | "preview">("idle");
  const [denied, setDenied] = useState(false);
  const [selfie, setSelfie] = useState<{ blob: Blob; url: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function stopCamera() {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
  }

  useEffect(
    () => () => {
      // Never leave the camera on when leaving the page.
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    },
    [],
  );
  useEffect(() => () => (selfie ? URL.revokeObjectURL(selfie.url) : undefined), [selfie]);

  // The video element exists once the live mode is rendered.
  useEffect(() => {
    const video = videoRef.current;
    if (mode === "live" && video && streamRef.current) {
      video.srcObject = streamRef.current;
      void video.play().catch(() => {});
    }
  }, [mode]);

  async function openCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      setMode("live");
    } catch {
      setDenied(true);
    }
  }

  async function keep(source: ImageBitmap) {
    const blob = await renderCrop(source, { x: 0, y: 0, width: source.width, height: source.height });
    source.close();
    setSelfie({ blob, url: URL.createObjectURL(blob) });
    setMode("preview");
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const frame = await createImageBitmap(video);
    stopCamera();
    await keep(frame);
  }

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      await keep(await decodeImage(file));
    } catch {
      setError(t("error"));
    }
  }

  async function send() {
    if (!selfie) return;
    setSending(true);
    setError(null);
    try {
      const upload = await api().verification.requestUpload({
        id: attempt.id,
        contentType: "image/jpeg",
        size: selfie.blob.size,
      });
      await postPresignedForm(upload.url, upload.fields, selfie.blob, () => {});
      onSent(await api().verification.submit({ id: attempt.id }));
    } catch (failure) {
      if (errorCode(failure) === "EXPIRED") {
        onSent(await api().verification.state());
        setError(t("expired"));
      } else {
        setError(t("error"));
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-[2rem] border border-paper/10 bg-paper/[0.04]">
        {mode === "live" ? (
          <video
            ref={videoRef}
            playsInline
            muted
            aria-label={t("camera.live")}
            className="size-full -scale-x-100 object-cover"
          />
        ) : null}
        {mode === "preview" && selfie ? (
          // biome-ignore lint/performance/noImgElement: local blob preview, never optimised
          <img src={selfie.url} alt={t("camera.preview")} className="size-full object-cover" />
        ) : null}
        {mode === "idle" ? (
          <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center text-paper/60">
            <ScanFace className="size-12" aria-hidden="true" />
          </div>
        ) : null}
      </div>

      {denied ? <p className="text-paper/75 text-sm">{t("camera.denied")}</p> : null}
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {mode === "idle" && !denied ? (
          <Button leadingIcon={<Camera className="size-4" aria-hidden="true" />} onClick={openCamera}>
            {t("camera.open")}
          </Button>
        ) : null}
        {mode === "live" ? (
          <Button leadingIcon={<Camera className="size-4" aria-hidden="true" />} onClick={capture}>
            {t("camera.capture")}
          </Button>
        ) : null}
        {mode === "preview" ? (
          <>
            <Button loading={sending} onClick={send}>
              {sending ? t("sending") : t("camera.send")}
            </Button>
            <Button
              variant="secondary"
              disabled={sending}
              leadingIcon={<RotateCcw className="size-4" aria-hidden="true" />}
              onClick={() => {
                setSelfie(null);
                setMode("idle");
              }}
            >
              {t("camera.retake")}
            </Button>
          </>
        ) : null}
        {mode !== "preview" ? (
          <label className={buttonVariants({ variant: mode === "idle" && !denied ? "ghost" : "secondary" })}>
            {t("camera.fallback")}
            <input type="file" accept="image/*" capture="user" className="sr-only" onChange={pick} />
          </label>
        ) : null}
      </div>
    </div>
  );
}

/** ONB-08: draw a gesture, take the selfie, follow the review. */
export function VerificationFlow({ initial }: { initial: VerificationState }) {
  const t = useTranslations("profile.verification");
  const format = useFormatter();
  const [state, setState] = useState(initial);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = freshAttempt(state);
  const latest = state.latest;

  async function start() {
    setStarting(true);
    setError(null);
    try {
      await api().verification.start();
      setState(await api().verification.state());
    } catch {
      setState(
        await api()
          .verification.state()
          .catch(() => state),
      );
      setError(t("error"));
    } finally {
      setStarting(false);
    }
  }

  if (state.verifiedAt) {
    return (
      <Card
        tone="success"
        icon={<CircleCheck className="text-success" aria-hidden="true" />}
        title={t("status.approved.title")}
      >
        {t("status.approved.body")}
      </Card>
    );
  }
  if (latest?.status === "processing" || latest?.status === "pending") {
    return (
      <Card
        tone="info"
        icon={<Clock className="text-volt" aria-hidden="true" />}
        title={t(`status.${latest.status}.title`)}
      >
        {t(`status.${latest.status}.body`)}
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {latest?.status === "rejected" && latest.rejection ? (
        <Card
          tone="warning"
          icon={<TriangleAlert className="text-danger" aria-hidden="true" />}
          title={t("status.rejected.title")}
        >
          {t("status.rejected.body", { reason: t(`reasons.${latest.rejection}`) })}
        </Card>
      ) : null}
      {latest?.status === "uploading" && !attempt ? <p className="text-paper/75">{t("expired")}</p> : null}
      {latest?.status === "failed" ? (
        <Card
          tone="warning"
          icon={<TriangleAlert className="text-danger" aria-hidden="true" />}
          title={t("status.failed.title")}
        >
          {t("status.failed.body")}
        </Card>
      ) : null}

      {attempt ? (
        <section aria-labelledby="gesture-title" className="flex flex-col gap-5">
          <div className="flex items-center gap-5 rounded-[2rem] border border-plasma/40 bg-plasma/10 p-5">
            <span aria-hidden="true" className="text-6xl leading-none">
              {GESTURE_GLYPHS[attempt.gesture]}
            </span>
            <div className="flex flex-col gap-1">
              <h2 id="gesture-title" className="font-mono text-plasma text-xs uppercase tracking-[0.18em]">
                {t("gestureTitle")}
              </h2>
              <p className="font-display font-semibold text-2xl tracking-tight">
                {t(`gestures.${attempt.gesture}`)}
              </p>
              <p className="text-paper/70 text-sm">
                {t("deadline", {
                  time: format.dateTime(new Date(attempt.expiresAt), { timeStyle: "short" }),
                })}
              </p>
            </div>
          </div>
          <SelfieCapture key={attempt.id} attempt={attempt} onSent={setState} />
        </section>
      ) : (
        <div className="flex flex-col gap-5">
          <section
            aria-labelledby="privacy-title"
            className="flex flex-col gap-3 rounded-[2rem] border border-paper/10 bg-paper/[0.03] p-5"
          >
            <h2 id="privacy-title" className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-5 text-volt" aria-hidden="true" />
              {t("privacy.title")}
            </h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-paper/75 text-sm">
              {(t.raw("privacy.items") as string[]).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          {state.blocker === "no_photo" || state.blocker === "quota" ? (
            <p className="text-paper/75">{t(`blockers.${state.blocker}`)}</p>
          ) : null}
          {error ? (
            <p role="alert" className="text-danger text-sm">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button loading={starting} disabled={state.blocker !== null} onClick={start}>
              {latest && latest.status !== "uploading" ? t("retry") : t("start")}
            </Button>
            {state.blocker === "no_photo" ? (
              <Link href={"/profil" as Route} className={buttonVariants({ variant: "secondary" })}>
                {t("back")}
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
