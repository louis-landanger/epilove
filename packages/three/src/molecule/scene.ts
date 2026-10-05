import { colors as colorTokens } from "@atomes/tokens";
import {
  clamp,
  exp,
  float,
  length,
  max,
  mix,
  modelViewMatrix,
  normalView,
  positionView,
  pow,
  smoothstep,
  uniform,
  uv,
  vec3,
  vec4,
} from "three/tsl";
import {
  AddEquation,
  Color,
  Curve,
  CustomBlending,
  CylinderGeometry,
  Group,
  type Material,
  Mesh,
  MeshBasicNodeMaterial,
  type Node,
  OneFactor,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteNodeMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  WebGPURenderer,
} from "three/webgpu";
import { type LinearRgb, tokenToLinearSrgb } from "../colors";
import { fieldOfViewFor, MOLECULE, MOLECULE_CAMERA, type MoleculeTone, moleculePose } from "./pose";

/**
 * The hero's molecule, live (docs/02-design.md, moment 1): the pose of
 * pose.ts drawn as light. Glowing nuclei in a haze, orbits as fine luminous
 * rings dimmer on their far side, electrons trailing a tail, a bond of light
 * between the nuclei with sparks running along it. The molecule precesses on
 * its own and leans towards the pointer. Transparent canvas: the page (and
 * the ion field) shows through, every material only adds light.
 */

export type MoleculeBackend = "webgpu" | "webgl2";

export interface MoleculeOptions {
  /** Element the scene draws into: it creates (and removes) its own canvas there. */
  readonly container: HTMLElement;
  /** Device pixel ratio ceiling (default 1.5). */
  readonly maxPixelRatio?: number;
  /** Skip WebGPU (for instance after a WebGPU scene failed). */
  readonly forceWebGL?: boolean;
  /** Called after the first frame is on screen, to cross-fade from the poster. */
  readonly onFirstFrame?: () => void;
  /** Called if a frame fails after start-up; the loop is then stopped for good. */
  readonly onError?: (error: unknown) => void;
}

export interface Molecule {
  readonly backend: MoleculeBackend;
  /** Pointer position in [-1, 1]² (x right, y up), `active` false when it leaves: the molecule leans towards it. */
  setPointer(x: number, y: number, active: boolean): void;
  setRunning(running: boolean): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

const PLASMA = tokenToLinearSrgb(colorTokens.plasma);
const VOLT = tokenToLinearSrgb(colorTokens.volt);
const PAPER = tokenToLinearSrgb(colorTokens.paper);

const toneRgb = (tone: MoleculeTone): LinearRgb => (tone === "plasma" ? PLASMA : VOLT);
/** The white-hot heart of a glow in that tone. */
const hotRgb = ([r, g, b]: LinearRgb, heat: number): LinearRgb => [
  r + (1 - r) * heat,
  g + (1 - g) * heat,
  b + (1 - b) * heat,
];
const rgb = ([r, g, b]: LinearRgb) => vec3(r, g, b);

/** Light only adds up: colour and coverage both accumulate on the transparent canvas. */
function additive<T extends Material>(material: T): T {
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = false;
  material.blending = CustomBlending;
  material.blendEquation = AddEquation;
  material.blendSrc = OneFactor;
  material.blendDst = OneFactor;
  material.blendEquationAlpha = AddEquation;
  material.blendSrcAlpha = OneFactor;
  material.blendDstAlpha = OneFactor;
  return material;
}

/** Colour and the coverage it earns on the canvas (its brightest channel). */
const light = (color: Node<"vec3">) => vec4(color, clamp(max(max(color.x, color.y), color.z), 0, 1));

/** How much a surface faces the viewer: 1 head on, 0 at its silhouette. The soft edge of every glow. */
const facing = () => clamp(normalView.z, 0, 1);

/** A soft radial glow on a sprite. */
function haloMaterial(color: LinearRgb, intensity: number, falloff: number): SpriteNodeMaterial {
  const material = additive(new SpriteNodeMaterial());
  const d = length(uv().sub(0.5)).mul(2);
  const glow = exp(d.mul(d).mul(-falloff)).mul(intensity);
  material.colorNode = light(rgb(color).mul(glow));
  return material;
}

/** A sprite whose colour and brightness the frame sets. */
function sparkMaterial(falloff: number) {
  const material = additive(new SpriteNodeMaterial());
  const uColor = uniform(new Color(1, 1, 1));
  const uLight = uniform(0);
  const d = length(uv().sub(0.5)).mul(2);
  const glow = exp(d.mul(d).mul(-falloff)).mul(uLight);
  material.colorNode = light(uColor.mul(glow));
  return { material, uColor, uLight };
}

/** The nucleus: a sphere white-hot at its heart, its tone towards the limb, fading out at the edge. */
function nucleusMaterial(tone: MoleculeTone): MeshBasicNodeMaterial {
  const material = additive(new MeshBasicNodeMaterial());
  const core = pow(facing(), 2.4);
  const color = mix(rgb(toneRgb(tone)), rgb(hotRgb(toneRgb(tone), 0.85)), core.mul(0.9)).mul(
    float(0.3).add(core.mul(1.1)),
  );
  material.colorNode = light(color);
  return material;
}

/**
 * A ring: paper white, dimmer on the half of the orbit that lies behind the
 * nucleus, so it reads as a circle seen at an angle; soft across the tube.
 */
function ringMaterial(radius: number, intensity: number, softness: number): MeshBasicNodeMaterial {
  const material = additive(new MeshBasicNodeMaterial());
  const centre = modelViewMatrix.mul(vec4(0, 0, 0, 1)).z;
  const near = smoothstep(-1, 1, positionView.z.sub(centre).div(radius));
  const brightness = mix(0.3, 1, near).mul(pow(facing(), softness)).mul(intensity);
  material.colorNode = light(rgb(PAPER).mul(brightness));
  return material;
}

/** The electron's tail: its tone, fading away from the head (the end of the tube). */
function trailMaterial(tone: MoleculeTone, intensity: number): MeshBasicNodeMaterial {
  const material = additive(new MeshBasicNodeMaterial());
  const fade = pow(uv().x, 1.6).mul(pow(facing(), 1.4)).mul(intensity);
  material.colorNode = light(rgb(toneRgb(tone)).mul(fade));
  return material;
}

/** The bond: a beam from plasma to volt, soft across, fading at both ends, breathing. */
function bondMaterial() {
  const material = additive(new MeshBasicNodeMaterial());
  const uPulse = uniform(1);
  const along = uv().y;
  const ends = smoothstep(0, 0.18, along).mul(smoothstep(1, 0.82, along));
  const beam = pow(facing(), 2.6).mul(ends).mul(uPulse).mul(0.55);
  material.colorNode = light(mix(rgb(PLASMA), rgb(VOLT), along).mul(beam));
  return { material, uPulse };
}

/** An arc of a circle in the XY plane, from `-span` to 0: the path of an electron's trail, head last. */
class Arc extends Curve<Vector3> {
  constructor(
    private readonly radius: number,
    private readonly span: number,
  ) {
    super();
  }

  override getPoint(t: number, target = new Vector3()): Vector3 {
    const angle = -this.span + this.span * t;
    return target.set(Math.cos(angle) * this.radius, Math.sin(angle) * this.radius, 0);
  }
}

function sprite(material: SpriteNodeMaterial, size: number): Sprite {
  const object = new Sprite(material);
  object.scale.set(size, size, 1);
  return object;
}

class WebGpuStartError extends Error {
  constructor(cause: unknown) {
    super("WebGPU failed to start", { cause });
  }
}

export async function createMolecule(options: MoleculeOptions): Promise<Molecule> {
  try {
    return await startMolecule(options, options.forceWebGL ?? false);
  } catch (error) {
    if (error instanceof WebGpuStartError) {
      return startMolecule(options, true);
    }
    throw error;
  }
}

async function startMolecule(options: MoleculeOptions, forceWebGL: boolean): Promise<Molecule> {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  options.container.append(canvas);
  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
    forceWebGL,
  });
  try {
    await renderer.init();
  } catch (error) {
    canvas.remove();
    throw forceWebGL ? error : new WebGpuStartError(error);
  }
  const backend: MoleculeBackend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
    ? "webgpu"
    : "webgl2";
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.maxPixelRatio ?? 1.5));
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(MOLECULE_CAMERA.fov, 1, 0.1, 20);
  camera.position.z = MOLECULE_CAMERA.distance;
  const molecule = new Group();
  scene.add(molecule);

  // ---------------------------------------------------------------------------
  // The atoms: nucleus and haze, rings, electrons with their trails.
  // ---------------------------------------------------------------------------
  const pose = moleculePose(0);
  const rings: Array<{ readonly group: Group; readonly electron: Group }> = [];
  for (const atom of pose.atoms) {
    const tone = toneRgb(atom.tone);
    const nucleus = new Mesh(new SphereGeometry(atom.nucleus, 48, 32), nucleusMaterial(atom.tone));
    nucleus.position.set(atom.center.x, atom.center.y, atom.center.z);
    molecule.add(nucleus);
    for (const [size, intensity, falloff] of [
      [4.4, 0.9, 5],
      [11, 0.28, 3.5],
    ] as const) {
      const halo = sprite(haloMaterial(tone, intensity, falloff), atom.nucleus * size);
      halo.position.copy(nucleus.position);
      molecule.add(halo);
    }
    // The electrons wear the other atom's tone: what the two exchange.
    const electronTone: MoleculeTone = atom.tone === "plasma" ? "volt" : "plasma";
    for (const ring of atom.rings) {
      const group = new Group();
      group.matrixAutoUpdate = false;
      for (const [tube, intensity, softness] of [
        [0.0055, 0.85, 0.6],
        [0.026, 0.14, 2],
        [0.07, 0.045, 2.5],
      ] as const) {
        group.add(
          new Mesh(
            new TorusGeometry(ring.radius, tube, 10, 160),
            ringMaterial(ring.radius, intensity, softness),
          ),
        );
      }
      const electron = new Group();
      const head = sprite(haloMaterial(hotRgb(toneRgb(electronTone), 0.7), 1.4, 7), 0.075);
      head.position.set(ring.radius, 0, 0);
      const glow = sprite(haloMaterial(toneRgb(electronTone), 0.5, 4), 0.3);
      glow.position.copy(head.position);
      const trail = new Mesh(
        new TubeGeometry(new Arc(ring.radius, MOLECULE.trail), 40, 0.014, 8, false),
        trailMaterial(electronTone, 0.9),
      );
      electron.add(trail, glow, head);
      group.add(electron);
      molecule.add(group);
      rings.push({ group, electron });
    }
  }

  // ---------------------------------------------------------------------------
  // The bond between the nuclei, and the sparks running along it.
  // ---------------------------------------------------------------------------
  const from = new Vector3(pose.bond.from.x, pose.bond.from.y, pose.bond.from.z);
  const to = new Vector3(pose.bond.to.x, pose.bond.to.y, pose.bond.to.z);
  const span = to.clone().sub(from);
  const bond = bondMaterial();
  const beam = new Mesh(new CylinderGeometry(0.07, 0.07, span.length(), 24, 1, true), bond.material);
  beam.position.copy(from).addScaledVector(span, 0.5);
  beam.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), span.clone().normalize());
  molecule.add(beam);
  const sparks = pose.sparks.map(() => {
    const spark = sparkMaterial(6);
    const object = sprite(spark.material, 0.09);
    molecule.add(object);
    return { object, ...spark };
  });
  const sparkColor = new Color();

  // ---------------------------------------------------------------------------
  // Frames.
  // ---------------------------------------------------------------------------
  const u = new Vector3();
  const v = new Vector3();
  const n = new Vector3();
  let time = 0;
  let last = 0;
  let frame = 0;
  let running = false;
  let failed = false;
  let firstFrame = true;
  const pointer = { x: 0, y: 0, active: false };
  const lean = { x: 0, y: 0 };

  const update = (delta: number) => {
    time += delta;
    const current = moleculePose(time);
    let index = 0;
    for (const atom of current.atoms) {
      for (const ring of atom.rings) {
        const target = rings[index];
        index += 1;
        if (!target) {
          continue;
        }
        u.set(ring.u.x, ring.u.y, ring.u.z);
        v.set(ring.v.x, ring.v.y, ring.v.z);
        n.set(ring.normal.x, ring.normal.y, ring.normal.z);
        target.group.matrix.makeBasis(u, v, n).setPosition(ring.center.x, ring.center.y, ring.center.z);
        target.group.matrixWorldNeedsUpdate = true;
        target.electron.rotation.z = ring.electron;
      }
    }
    for (const [sparkIndex, spark] of current.sparks.entries()) {
      const target = sparks[sparkIndex];
      if (!target) {
        continue;
      }
      target.object.position.set(spark.position.x, spark.position.y, spark.position.z);
      sparkColor.setRGB(
        PLASMA[0] + (VOLT[0] - PLASMA[0]) * spark.along,
        PLASMA[1] + (VOLT[1] - PLASMA[1]) * spark.along,
        PLASMA[2] + (VOLT[2] - PLASMA[2]) * spark.along,
      );
      target.uColor.value.copy(sparkColor);
      target.uLight.value = 1.2 * spark.light;
    }
    bond.uPulse.value = 0.8 + 0.2 * Math.sin(time * 1.3);

    // The molecule sways on its own and leans towards the pointer, easing there.
    const targetX = pointer.active ? -pointer.y * 0.16 : 0;
    const targetY = pointer.active ? pointer.x * 0.26 : 0;
    const ease = 1 - Math.exp(-delta * 4);
    lean.x += (targetX - lean.x) * ease;
    lean.y += (targetY - lean.y) * ease;
    molecule.rotation.set(
      0.05 * Math.sin(0.17 * time) + lean.x,
      0.1 * Math.sin(0.23 * time) + lean.y,
      0.02 * Math.sin(0.11 * time),
    );
  };

  const render = (now: number) => {
    frame = 0;
    if (!running || failed) {
      return;
    }
    const delta = last === 0 ? 0 : Math.min(0.05, (now - last) / 1000);
    last = now;
    try {
      update(delta);
      renderer.render(scene, camera);
    } catch (error) {
      failed = true;
      running = false;
      options.onError?.(error);
      return;
    }
    if (firstFrame) {
      firstFrame = false;
      options.onFirstFrame?.();
    }
    frame = requestAnimationFrame(render);
  };

  const resize = (width: number, height: number) => {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = fieldOfViewFor(camera.aspect);
    camera.updateProjectionMatrix();
  };
  resize(options.container.clientWidth, options.container.clientHeight);

  return {
    backend,
    setPointer(x, y, active) {
      pointer.x = Math.max(-1, Math.min(1, x));
      pointer.y = Math.max(-1, Math.min(1, y));
      pointer.active = active;
    },
    setRunning(next) {
      if (failed || next === running) {
        return;
      }
      running = next;
      if (next) {
        last = 0;
        frame = requestAnimationFrame(render);
      } else {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    },
    resize,
    dispose() {
      running = false;
      cancelAnimationFrame(frame);
      scene.traverse((object) => {
        if (object instanceof Mesh || object instanceof Sprite) {
          object.geometry.dispose();
          (object.material as Material).dispose();
        }
      });
      renderer.dispose();
      canvas.remove();
    },
  };
}
