import type { FrameTimings, IonField } from "@atomes/three/ion-field";

/**
 * Diagnostics of the landing on a device, over the page with `?debug=field`
 * (live-scene.ts, loaded apart from the page's own scripts): the field's
 * backend and quality, the screen's refresh rate, the pace of the frames
 * (the last seconds, the whole session, and its worst seconds: where the
 * page was, whether it scrolled, how late the frames were), the field's time
 * per phase, the long animation frames and what ran in them, the memory. A
 * tap copies the whole report, to paste in a bug report. With
 * `&no=grain,backdrop,filters,anim,field,cap`, the named costs are turned off
 * (marketing.css, trial switches; the field and its frame rate cap in
 * ion-field-canvas.tsx), to compare how the page feels without them.
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

/** One second of the page: its frames, the late ones, how much it scrolled, where it was. */
interface Second {
  readonly at: number;
  readonly section: string;
  frames: number;
  /** Frames over 20 ms: a 60 Hz frame missed, two 120 Hz ones. */
  late: number;
  /** Frames over 34 ms: a stutter on any screen. */
  stutters: number;
  max: number;
  scrolled: number;
  /** The field's longest frame (the sum of its phases). */
  field: number;
  longFrames: number;
}

/** Frames kept for the latest statistics: four seconds at 60 Hz, two at 120. */
const KEPT = 240;
const LATE = 20;
const STUTTER = 34;
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
const percent = (part: number, whole: number) => `${whole > 0 ? Math.round((100 * part) / whole) : 0} %`;
const hz = (interval: number) => (interval > 0 ? `${Math.round(1000 / Math.max(4, interval))} Hz` : "? Hz");

export function mountFieldHud(container: HTMLElement, off: readonly string[]): FieldHud {
  if (off.length > 0) {
    document.documentElement.dataset.no = off.join(" ");
  }
  const started = performance.now();
  const elapsed = () => (performance.now() - started) / 1000;

  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;left:0.5rem;right:0.5rem;bottom:0.5rem;z-index:9999;padding:0.4rem 0.55rem;" +
    "border-radius:0.4rem;background:rgba(0,0,0,0.78);color:#fff;font:11px/1.4 ui-monospace,monospace;" +
    "white-space:pre-wrap;overflow-wrap:anywhere;pointer-events:auto;user-select:none";
  document.body.append(box);

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

  // Every second of the session, from the page's frames.
  const seconds: Second[] = [];
  const secondAt = (time: number): Second | null => {
    const at = Math.floor((time - started) / 1000);
    if (at < 0) {
      return null;
    }
    let second = seconds[seconds.length - 1];
    if (!second || second.at < at) {
      second = {
        at,
        section: sectionOnScreen(),
        frames: 0,
        late: 0,
        stutters: 0,
        max: 0,
        scrolled: 0,
        field: 0,
        longFrames: 0,
      };
      seconds.push(second);
    }
    return second;
  };

  // The page's frames, whatever drives them: their pace is the screen's, until something is late.
  const latest = new Ring();
  let minInterval = Number.POSITIVE_INFINITY;
  const counts = { frames: 0, late: 0, stutters: 0, scrolling: 0, lateScrolling: 0 };
  let lastFrame = -1;
  let lastScroll = window.scrollY;
  let frameHandle = 0;
  const tick = (now: number) => {
    const scroll = window.scrollY;
    if (lastFrame >= 0) {
      const interval = now - lastFrame;
      const scrolling = scroll !== lastScroll;
      latest.push(interval);
      minInterval = Math.min(minInterval, interval);
      counts.frames += 1;
      if (scrolling) {
        counts.scrolling += 1;
      }
      if (interval > LATE) {
        counts.late += 1;
        if (scrolling) {
          counts.lateScrolling += 1;
        }
      }
      if (interval > STUTTER) {
        counts.stutters += 1;
      }
      const second = secondAt(now);
      if (second) {
        second.frames += 1;
        second.late += interval > LATE ? 1 : 0;
        second.stutters += interval > STUTTER ? 1 : 0;
        second.max = Math.max(second.max, interval);
        second.scrolled += Math.abs(scroll - lastScroll);
      }
    }
    lastScroll = scroll;
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
        const second = seconds.find(
          (candidate) => candidate.at === Math.floor((entry.startTime - started) / 1000),
        );
        if (second) {
          second.longFrames += 1;
        }
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
    const state = `${quality ?? "-"} live=${live ?? "-"} resting=${resting ?? "-"}`;
    const last = log[log.length - 1];
    if (last === undefined || last.slice(last.indexOf(" ") + 1) !== state) {
      log.push(`${elapsed().toFixed(0)}s ${state}`);
      if (log.length > 8) {
        log.shift();
      }
    }
  });
  mutations.observe(container, { attributes: true });

  const report = () => {
    const nav = navigator as Navigator & { deviceMemory?: number };
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const quality = field?.quality();
    const worst = [...seconds]
      .filter((second) => second.late > 0)
      .sort((a, b) => b.late - a.late || b.max - a.max)
      .slice(0, 3)
      .map(
        (second) =>
          `  ${second.at} s ${second.section} ${second.scrolled > 0 ? `↕${Math.round(second.scrolled)} px` : "idle"}: ${
            second.frames
          } frames, ${second.late} late, ${second.stutters} stutters, max ${ms(second.max)} ms, field ${ms(second.field)} ms${
            second.longFrames > 0 ? `, ${second.longFrames} long` : ""
          }`,
      );
    const topScripts = [...scripts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, duration]) => `  ${ms(duration)} ms  ${key}`);
    return [
      `atomes · champ · ${elapsed().toFixed(0)} s · toucher pour copier`,
      `${navigator.userAgent.split(") ").pop() ?? navigator.userAgent}`,
      `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio} · cores ${navigator.hardwareConcurrency} · mem ${
        nav.deviceMemory ?? "?"
      } · screen up to ${hz(minInterval)} · now ${hz(latest.min)} · section ${sectionOnScreen()} · scroll ${Math.round(
        window.scrollY,
      )}`,
      `field ${container.dataset.backend ?? "-"} · ${
        quality
          ? `${quality.visibleParticles}@${quality.pixelRatio} · cap ${quality.maxFps ?? "none"}`
          : (container.dataset.quality ?? "-")
      } · live=${container.dataset.live ?? "-"} resting=${container.dataset.resting ?? "-"}${
        off.length > 0 ? ` · no: ${off.join(" ")}` : ""
      }`,
      `last ${latest.size} frames: med ${ms(latest.percentile(0.5))} p90 ${ms(latest.percentile(0.9))} max ${ms(
        latest.max,
      )} · late ${Math.round(latest.share(LATE) * 100)} % · stutters ${Math.round(latest.share(STUTTER) * 100)} %`,
      `session: ${counts.frames} frames · late ${percent(counts.late, counts.frames)} (scrolling ${percent(
        counts.lateScrolling,
        counts.scrolling,
      )} of ${counts.scrolling}, idle ${percent(counts.late - counts.lateScrolling, counts.frames - counts.scrolling)}) · stutters ${percent(
        counts.stutters,
        counts.frames,
      )}`,
      ...(worst.length > 0 ? ["worst seconds:", ...worst] : ["worst seconds: none late"]),
      `field ms ${PHASES.map((phase) => `${phase} ${ms(phases[phase].percentile(0.5))}`).join(" ")} · sum med ${ms(
        total.percentile(0.5),
      )} p90 ${ms(total.percentile(0.9))} max ${ms(total.max)} · frame med ${ms(fieldFrames.percentile(0.5))}`,
      `long frames ${observer ? `${longFrames} · blocking ${ms(longBlocking)} ms / ${elapsed().toFixed(0)} s` : "n/a"}`,
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
      phases: PHASES.map((phase) => [phase, phases[phase].percentile(0.5), phases[phase].percentile(0.9)]),
      seconds: seconds.map((second) => [
        second.at,
        second.section,
        second.frames,
        second.late,
        second.stutters,
        Math.round(second.max),
        Math.round(second.scrolled),
        Math.round(second.field * 10) / 10,
        second.longFrames,
      ]),
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
      const sum = timings.page + timings.formations + timings.step + timings.render;
      total.push(sum);
      fieldFrames.push(timings.frame);
      const second = secondAt(performance.now());
      if (second) {
        second.field = Math.max(second.field, sum);
      }
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
