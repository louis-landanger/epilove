import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";

const HEADER_OFFSET = 72;
const INTERACTIVE = "a, button, summary, input, label, [data-cursor]";

/** One-way scrubbing: once revealed, text stays revealed when scrolling back up. */
function revealOnce(timeline: gsap.core.Timeline, trigger: Element, start: string, end: string) {
  let reached = 0;
  return ScrollTrigger.create({
    trigger,
    start,
    end,
    onUpdate: (self) => {
      if (self.progress > reached) {
        reached = self.progress;
        gsap.to(timeline, { progress: reached, duration: 0.35, ease: "power2.out", overwrite: true });
      }
    },
  });
}

function setUpSmoothScroll(cleanups: Array<() => void>): Lenis {
  const lenis = new Lenis({ lerp: 0.11, stopInertiaOnNavigate: true });
  lenis.on("scroll", ScrollTrigger.update);
  const tick = (time: number) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  // In-page links glide, then move focus to their target like a native jump would.
  const onClick = (event: MouseEvent) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href*="#"]');
    if (
      !link ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }
    const url = new URL(link.href);
    if (url.pathname !== window.location.pathname || !url.hash || link.classList.contains("skip-link")) {
      return;
    }
    const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (!target) {
      return;
    }
    event.preventDefault();
    history.pushState(null, "", url.hash);
    lenis.scrollTo(target, {
      offset: url.hash === "#top" ? 0 : -HEADER_OFFSET,
      duration: 1.4,
      onComplete: () => {
        if (!target.hasAttribute("tabindex")) {
          target.setAttribute("tabindex", "-1");
        }
        target.focus({ preventScroll: true });
      },
    });
  };
  document.addEventListener("click", onClick);

  cleanups.push(() => {
    document.removeEventListener("click", onClick);
    gsap.ticker.remove(tick);
    lenis.destroy();
  });
  return lenis;
}

function setUpPointerEffects(root: HTMLElement, cleanups: Array<() => void>) {
  if (!window.matchMedia("(pointer: fine)").matches) {
    return;
  }

  // A charged particle following the pointer; it swells over anything clickable.
  const cursor = document.createElement("div");
  cursor.className = "ion-cursor";
  cursor.setAttribute("aria-hidden", "true");
  document.body.append(cursor);
  const moveX = gsap.quickTo(cursor, "x", { duration: 0.35, ease: "power3.out" });
  const moveY = gsap.quickTo(cursor, "y", { duration: 0.35, ease: "power3.out" });
  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") {
      return;
    }
    root.classList.add("cursor-visible");
    moveX(event.clientX);
    moveY(event.clientY);
    const over = (event.target as Element | null)?.closest(INTERACTIVE);
    cursor.classList.toggle("is-active", Boolean(over));
  };
  const onLeave = () => root.classList.remove("cursor-visible");
  window.addEventListener("pointermove", onMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);
  cleanups.push(() => {
    window.removeEventListener("pointermove", onMove);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    root.classList.remove("cursor-visible");
    cursor.remove();
  });

  // Magnetic buttons: they lean towards the pointer, then spring back.
  for (const element of gsap.utils.toArray<HTMLElement>("[data-magnetic]")) {
    const x = gsap.quickTo(element, "x", { duration: 0.5, ease: "elastic.out(1, 0.4)" });
    const y = gsap.quickTo(element, "y", { duration: 0.5, ease: "elastic.out(1, 0.4)" });
    const onEnterMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      x((event.clientX - (rect.left + rect.width / 2)) * 0.28);
      y((event.clientY - (rect.top + rect.height / 2)) * 0.36);
    };
    const onExit = () => {
      x(0);
      y(0);
    };
    element.addEventListener("pointermove", onEnterMove);
    element.addEventListener("pointerleave", onExit);
    cleanups.push(() => {
      element.removeEventListener("pointermove", onEnterMove);
      element.removeEventListener("pointerleave", onExit);
      gsap.set(element, { clearProps: "transform" });
    });
  }

  // Kinetic headline: letters near the pointer condense and gain weight.
  // Each letter keeps its resting width, so nothing around it moves (no layout shift).
  const kinetic = gsap.utils.toArray<HTMLElement>("[data-headline] .headline-kinetic");
  if (kinetic.length > 0) {
    const split = SplitText.create(kinetic, { type: "chars", aria: "none", charsClass: "kinetic-char" });
    const chars = split.chars as HTMLElement[];
    for (const char of chars) {
      char.style.width = `${char.getBoundingClientRect().width}px`;
    }
    const onPointer = (event: PointerEvent) => {
      for (const char of chars) {
        const rect = char.getBoundingClientRect();
        const distance = Math.hypot(
          event.clientX - (rect.left + rect.width / 2),
          event.clientY - (rect.top + rect.height / 2),
        );
        const pull = Math.max(0, 1 - distance / 260);
        char.style.setProperty("--pull", pull.toFixed(3));
      }
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    cleanups.push(() => {
      window.removeEventListener("pointermove", onPointer);
      split.revert();
    });
  }
}

/**
 * The landing choreography. Every effect is an enhancement over a complete,
 * static page, and everything is undone by the returned function (reduced
 * motion switched on, navigation away).
 */
export function startChoreography(root: HTMLElement): () => void {
  gsap.registerPlugin(ScrollTrigger, SplitText);
  const cleanups: Array<() => void> = [];
  root.classList.add("motion-ready");

  setUpSmoothScroll(cleanups);
  const splits: SplitText[] = [];

  const context = gsap.context(() => {
    // Hero copy drifts up and dims while the field condenses into the mark.
    gsap.to("[data-hero-content]", {
      yPercent: -14,
      opacity: 0,
      ease: "none",
      scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom 15%", scrub: true },
    });

    // Manifesto: words light up one after the other.
    const manifesto = document.getElementById("manifeste");
    const manifestoTexts = gsap.utils.toArray<HTMLElement>("[data-reveal-words]");
    if (manifesto && manifestoTexts.length > 0) {
      const timeline = gsap.timeline({ paused: true });
      for (const [index, element] of manifestoTexts.entries()) {
        const split = SplitText.create(element, { type: "words", aria: "none" });
        splits.push(split);
        // Out of focus rather than faded out: even before the reveal, the text
        // keeps an AA contrast (large title 3:1, body 4.5:1); the plasma accents
        // start brighter since their contrast is lower to begin with.
        const isTitle = index === 0;
        timeline.fromTo(
          split.words,
          {
            opacity: (_: number, word: Element) =>
              word.closest("em") ? (isTitle ? 0.8 : 0.92) : isTitle ? 0.45 : 0.62,
            filter: "blur(5px)",
          },
          { opacity: 1, filter: "blur(0px)", stagger: 0.06, duration: 0.4, ease: "none" },
        );
      }
      revealOnce(timeline, manifesto, "top 70%", "bottom bottom");
    }

    // Section titles rise in once.
    for (const element of gsap.utils.toArray<HTMLElement>("[data-reveal]")) {
      gsap.from(element, {
        y: 48,
        opacity: 0,
        duration: 1.2,
        ease: "expo.out",
        scrollTrigger: { trigger: element, start: "top 88%", once: true },
      });
    }

    // Steps: each pinned card recedes as the next one slides over it, and the
    // illustrations straighten up as they arrive.
    const steps = gsap.utils.toArray<HTMLElement>("[data-step]");
    steps.forEach((step, index) => {
      const card = step.querySelector("article");
      const next = steps[index + 1];
      if (card && next) {
        // Explicit start values: GSAP would read "none" as brightness(0).
        gsap.fromTo(
          card,
          { scale: 1, filter: "brightness(1)" },
          {
            scale: 0.94,
            filter: "brightness(0.55)",
            ease: "none",
            scrollTrigger: { trigger: next, start: "top bottom", end: "top 25%", scrub: true },
          },
        );
      }
      const illustration = step.querySelector(".step-card-3d");
      if (illustration) {
        gsap.fromTo(
          illustration,
          { rotateX: 18, rotateY: -22, y: 60 },
          {
            rotateX: 0,
            rotateY: 0,
            y: 0,
            ease: "none",
            scrollTrigger: { trigger: step, start: "top bottom", end: "top 30%", scrub: true },
          },
        );
      }
    });

    // The giant footer logotype rises letter by letter.
    const giant = document.querySelector<HTMLElement>("[data-footer-giant]");
    if (giant) {
      const split = SplitText.create(giant, { type: "chars", aria: "none", mask: "chars" });
      splits.push(split);
      gsap.from(split.chars, {
        yPercent: 100,
        duration: 1.3,
        ease: "expo.out",
        stagger: 0.05,
        scrollTrigger: { trigger: giant, start: "top 95%", once: true },
      });
    }
  });

  setUpPointerEffects(root, cleanups);
  ScrollTrigger.refresh();

  return () => {
    context.revert();
    for (const split of splits) {
      split.revert();
    }
    for (const cleanup of cleanups.splice(0).reverse()) {
      cleanup();
    }
    root.classList.remove("motion-ready");
  };
}
