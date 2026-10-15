import type { FrameTimings, IonField } from "@atomes/three/ion-field";

/**
 * Diagnostics of the landing on a device, over the page with `?debug=field`
 * (live-scene.ts, loaded apart from the page's own scripts): the field's
 * backend and quality, the screen's refresh rate, the pace of the frames, the
 * field's time per phase, the long animation frames and what ran in them, the
 * memory. A tap copies the whole report, to paste in a bug report. With
 * `&no=grain,backdrop,filters,anim,field`, the named costs are turned off
 * (marketing.css, trial switches; the field in ion-field-canvas.tsx), to
 * compare how the page feels without them.
 */

export interface FieldHud {
  /** The field, once it runs: its quality and backend are read from it. */
  attach(field: IonField): void;
  /** One frame of the field, with its time per phase. */
  frame(timings: FrameTimings): void;
  dispose(): void;
}

/** Long animation frames (Chrome 123+): the part of the entry the report keeps. */
interface LongAnimationFrame extends PerformanceEntry {
  readonly blockingDuration: number;
  readonly scripts: ReadonlyArray<{
    readonly invoker: string;
    readonly sourceFunctionName: string;
    readonly sourceURL: string;
    readonly duration: number;
  }>;
}

/** Frames kept for the statistics: two seconds at 120 Hz. */
const KEPT = 240;
const PHASES = ["page", "formations", "step", "render"] as const;

class Ring {
  private readonly values: number[] = [];

  push(value: number) {
    this.values.push(value);
    if (this.values.length > KEPT) {
      this.values.shift();
    }
  }

  get size() {
    return this.values.length;
  }

  percentile(q: number) {
    if (this.values.length === 0) {
      return 0;
    }
    const sorted = [...this.values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  }

  get min() {
    return this.values.length === 0 ? 0 : Math.min(...this.values);
  }

  get max() {
    return this.values.length === 0 ? 0 : Math.max(...this.values);
  }

  share(above: number) {
    return this.values.length === 0
      ? 0
      : this.values.filter((value) => value > above).length / this.values.length;
  }
}

const ms = (value: number) => (value >= 100 ? value.toFixed(0) : value.toFixed(1));

export function mountFieldHud(container: HTMLElement, off: readonly string[]): FieldHud {
  if (off.length > 0) {
    document.documentElement.dataset.no = off.join(" ");
  }
  const started = performance.now();
  const since = () => ((performance.now() - started) / 1000).toFixed(0);

  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;left:0.5rem;right:0.5rem;bottom:0.5rem;z-index:9999;padding:0.4rem 0.55rem;" +
    "border-radius:0.4rem;background:rgba(0,0,0,0.78);color:#fff;font:11px/1.4 ui-monospace,monospace;" +
    "white-space:pre-wrap;overflow-wrap:anywhere;pointer-events:auto;user-select:none";
  document.body.append(box);

  // The page's frames, whatever drives them: their pace is the screen's, until something is late.
  const frames = new Ring();
  let lastFrame = -1;
  let frameHandle = 0;
  const tick = (now: number) => {
    if (lastFrame >= 0) {
      frames.push(now - lastFrame);
    }
    lastFrame = now;
    frameHandle = requestAnimationFrame(tick);
  };
  frameHandle = requestAnimationFrame(tick);

  // The field's frames, phase by phase.
  const phases = { page: new Ring(), formations: new Ring(), step: new Ring(), render: new Ring() };
  const fieldFrames = new Ring();
  const total = new Ring();

  // Long animation frames: how many, how long, and the scripts that ran in them.
  let longFrames = 0;
  let longBlocking = 0;
  const scripts = new Map<string, number>();
  let observer: PerformanceObserver | null = null;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as LongAnimationFrame[]) {
        longFrames += 1;
        longBlocking += entry.blockingDuration;
        for (const script of entry.scripts) {
          const key = `${script.invoker} ${script.sourceFunctionName || "?"} ${script.sourceURL.split("/").pop() ?? ""}`;
          scripts.set(key, (scripts.get(key) ?? 0) + script.duration);
        }
      }
    });
    observer.observe({ type: "long-animation-frame", buffered: true });
  } catch {
    observer = null;
  }

  // The field's state, as it changes.
  let field: IonField | null = null;
  const log: string[] = [];
  const mutations = new MutationObserver(() => {
    const { quality, resting, live } = container.dataset;
    const line = `${since()}s ${quality ?? "-"} live=${live ?? "-"} resting=${resting ?? "-"}`;
    if (log[log.length - 1]?.slice(log[log.length - 1]?.indexOf(" ")) !== line.slice(line.indexOf(" "))) {
      log.push(line);
      if (log.length > 8) {
        log.shift();
      }
    }
  });
  mutations.observe(container, { attributes: true });

  const sections = [...document.querySelectorAll<HTMLElement>("main section[id]")];
  const sectionOnScreen = () => {
    let current = "-";
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= window.innerHeight / 2) {
        current = section.id;
      }
    }
    return current;
  };

  const report = () => {
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const quality = field?.quality();
    const topScripts = [...scripts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, duration]) => `  ${ms(duration)} ms  ${key}`);
    const seconds = (performance.now() - started) / 1000;
    return [
      `atomes · champ · ${since()} s · toucher pour copier`,
      `${navigator.userAgent.split(") ").pop() ?? navigator.userAgent}`,
      `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio} · ${
        frames.size > 0 ? `${Math.round(1000 / Math.max(4, frames.min))} Hz` : "? Hz"
      } · section ${sectionOnScreen()} · scroll ${Math.round(window.scrollY)}`,
      `field ${container.dataset.backend ?? "-"} · ${
        quality ? `${quality.visibleParticles}@${quality.pixelRatio}` : (container.dataset.quality ?? "-")
      } · live=${container.dataset.live ?? "-"} resting=${container.dataset.resting ?? "-"}${
        off.length > 0 ? ` · no: ${off.join(" ")}` : ""
      }`,
      `frames (${frames.size}) med ${ms(frames.percentile(0.5))} p90 ${ms(frames.percentile(0.9))} max ${ms(
        frames.max,
      )} · >20 ms ${Math.round(frames.share(20) * 100)} % · >34 ms ${Math.round(frames.share(34) * 100)} %`,
      `field ms ${PHASES.map((phase) => `${phase} ${ms(phases[phase].percentile(0.5))}`).join(" ")} · sum med ${ms(
        total.percentile(0.5),
      )} p90 ${ms(total.percentile(0.9))} · frame med ${ms(fieldFrames.percentile(0.5))}`,
      `long frames ${observer ? `${longFrames} · blocking ${ms(longBlocking)} ms / ${seconds.toFixed(0)} s` : "n/a"}`,
      ...topScripts,
      ...(log.length > 0 ? [`log ${log.join(" | ")}`] : []),
      `heap ${memory ? `${Math.round(memory.usedJSHeapSize / 1048576)} MB` : "-"}`,
    ].join("\n");
  };

  let copied = 0;
  const render = () => {
    if (copied === 0) {
      box.textContent = report();
    }
  };
  const timer = window.setInterval(render, 500);
  render();

  // A tap copies the report (the text as shown, and the raw figures).
  const onTap = () => {
    const text = report();
    const raw = {
      userAgent: navigator.userAgent,
      frames: PHASES.map((phase) => [phase, phases[phase].percentile(0.5), phases[phase].percentile(0.9)]),
      scripts: [...scripts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
      log,
    };
    void navigator.clipboard
      ?.writeText(`${text}\n\n${JSON.stringify(raw)}`)
      .then(() => {
        box.textContent = `${text}\n\n✓ copié`;
      })
      .catch(() => {
        box.style.userSelect = "text";
        box.textContent = `${text}\n\n(copie impossible : sélectionne le texte)`;
      });
    copied = window.setTimeout(() => {
      copied = 0;
      render();
    }, 2000);
  };
  box.addEventListener("click", onTap);

  return {
    attach(next) {
      field = next;
      render();
    },
    frame(timings) {
      for (const phase of PHASES) {
        phases[phase].push(timings[phase]);
      }
      total.push(timings.page + timings.formations + timings.step + timings.render);
      fieldFrames.push(timings.frame);
    },
    dispose() {
      cancelAnimationFrame(frameHandle);
      window.clearInterval(timer);
      window.clearTimeout(copied);
      observer?.disconnect();
      mutations.disconnect();
      box.remove();
      delete document.documentElement.dataset.no;
    },
  };
}
