/**
 * The comet behind a thrown card: fine sparks shed from the card's centre as
 * it flies, which drift back and fade. Drawn on a 2D canvas over the hero;
 * nothing runs once the last spark has faded.
 */
export function createComet(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  const style = getComputedStyle(canvas);
  const accents = ["--color-plasma", "--color-volt", "--color-paper"].map(
    (token) => style.getPropertyValue(token).trim() || "#fff",
  );
  let sparks: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    life: number;
    colour: string;
  }> = [];
  let frame = 0;

  const draw = () => {
    if (!context) {
      return;
    }
    const { width, height } = canvas.getBoundingClientRect();
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = "lighter";
    sparks = sparks.filter((spark) => spark.life > 0);
    for (const spark of sparks) {
      spark.x += spark.vx;
      spark.y += spark.vy;
      spark.vx *= 0.94;
      spark.vy = spark.vy * 0.94 + 0.02;
      spark.life -= 0.022;
      context.globalAlpha = Math.max(0, spark.life);
      context.fillStyle = spark.colour;
      context.beginPath();
      context.arc(spark.x, spark.y, spark.size * (0.4 + 0.6 * spark.life), 0, Math.PI * 2);
      context.fill();
    }
    frame = sparks.length > 0 ? requestAnimationFrame(draw) : 0;
  };

  return {
    /**
     * Sheds sparks at (x, y), in CSS pixels from the canvas's top left, from
     * a card moving at (vx, vy) pixels per millisecond, in its school's colour.
     */
    shed(x: number, y: number, vx: number, vy: number, colour: string, count = 7) {
      for (let index = 0; index < count; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const drift = Math.random() * 1.2;
        sparks.push({
          x: x + (Math.random() - 0.5) * 18,
          y: y + (Math.random() - 0.5) * 18,
          vx: -vx * (2 + Math.random() * 4) + Math.cos(angle) * drift,
          vy: -vy * (2 + Math.random() * 4) + Math.sin(angle) * drift,
          size: 0.8 + Math.random() * 1.8,
          life: 0.6 + Math.random() * 0.4,
          colour: index % 3 === 0 ? colour : (accents[index % accents.length] ?? "#fff"),
        });
      }
      if (!frame) {
        frame = requestAnimationFrame(draw);
      }
    },
    dispose() {
      cancelAnimationFrame(frame);
      sparks = [];
    },
  };
}
