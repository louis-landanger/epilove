/**
 * The spark of a bond: a short burst of fine sparks where the two profile
 * cards meet, drawn on a small 2D canvas over the cards (the ion field draws
 * behind the page, the cards would hide it). Nothing runs between bursts.
 */
export function createSparks(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  const style = getComputedStyle(canvas);
  const colours = ["--color-plasma", "--color-volt", "--color-paper", "--color-paper"].map(
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
      spark.vx *= 0.96;
      spark.vy *= 0.96;
      spark.life -= 0.014;
      context.globalAlpha = Math.max(0, spark.life);
      context.fillStyle = spark.colour;
      context.beginPath();
      context.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
      context.fill();
    }
    frame = sparks.length > 0 ? requestAnimationFrame(draw) : 0;
  };

  return {
    /** A burst from the middle of the canvas. */
    burst(count = 80) {
      const { width, height } = canvas.getBoundingClientRect();
      for (let index = 0; index < count; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 4.5;
        sparks.push({
          x: width / 2,
          y: height / 2,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed * 0.8,
          size: 0.6 + Math.random() * 1.3,
          life: 0.7 + Math.random() * 0.5,
          colour: colours[index % colours.length] ?? "#fff",
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
