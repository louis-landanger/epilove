import { colors as colorTokens, schoolColors } from "@atomes/tokens";
import {
  abs,
  clamp,
  cos,
  exp,
  Fn,
  float,
  instancedArray,
  instancedBufferAttribute,
  instancedDynamicBufferAttribute,
  instanceIndex,
  int,
  ivec2,
  length,
  max,
  min,
  mix,
  positionGeometry,
  pow,
  sign,
  sin,
  smoothstep,
  step as stepAt,
  textureLoad,
  uint,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import {
  AdditiveBlending,
  Color,
  type ComputeNode,
  DataTexture,
  DynamicDrawUsage,
  FloatType,
  InstancedBufferAttribute,
  Mesh,
  MeshBasicNodeMaterial,
  type Node,
  OrthographicCamera,
  PlaneGeometry,
  RGFormat,
  Scene,
  Vector2,
  Vector3,
  Vector4,
  WebGPURenderer,
} from "three/webgpu";
import { type LinearRgb, linearSrgbToSrgb, tokenToLinearSrgb } from "../colors";
import type { CityFlight } from "./city-painter";
import {
  FLIGHT_MERGE,
  FLIGHT_PACK_STRIDE,
  FLIGHT_PATCH_STRIDE,
  FLIGHT_PUSH,
  FLIGHT_PUSH_REACH,
  FLIGHT_SHARE,
  FLIGHT_START,
  type FlightFormation,
  FORMATION_STRIDE,
  type FormationParticles,
  type Formations,
  followFlight,
  formationStrength,
  gatherFlightSteps,
  packFlightSteps,
  riverMapTransform,
  toWorldFormations,
  type ViewportFormations,
  writeFormations,
} from "./formations";
import {
  createIonFieldLayout,
  ION_FIELD_SEED,
  type IonFieldLayout,
  SCHOOL_KEYS,
  withParticlesAhead,
} from "./layout";
import { loadSchoolLogos } from "./logos";
import { createFrameMonitor } from "./quality";

export type IonFieldBackend = "webgpu" | "webgl2";

export interface IonFieldOptions {
  /**
   * Element the scene draws into: it creates (and removes) its own canvas there,
   * so it can start again on a fresh canvas with WebGL2 if WebGPU fails.
   */
  readonly container: HTMLElement;
  /** Number of particles (even). Called once the backend is known. */
  readonly particleCount: (backend: IonFieldBackend) => number;
  /** Device pixel ratio ceiling (docs/02-design.md, section 9: 1.5). */
  readonly maxPixelRatio?: number;
  readonly seed?: number;
  /** Called after the first frame is on screen, to cross-fade from the poster. */
  readonly onFirstFrame?: () => void;
  /** Called when the field lowers its quality to keep up, or gives it back once it can (for diagnostics). */
  readonly onQuality?: (state: { pixelRatio: number; visibleParticles: number }) => void;
  /** Called when the device cannot keep up even at the lowest quality: the field has stopped. */
  readonly onGiveUp?: () => void;
  /** Called if a frame fails or the GPU device is lost after start-up; the loop is then stopped for good. */
  readonly onError?: (error: unknown) => void;
  /** Skip WebGPU (for instance after a WebGPU field failed). */
  readonly forceWebGL?: boolean;
  /** Lower the quality, then give up, when the device cannot keep up (default: true). */
  readonly adaptiveQuality?: boolean;
  /** Called at the start of every frame, before the simulation: the page measures its formations here. */
  readonly beforeFrame?: () => void;
  /**
   * Formations on screen when the field starts: particles start right by
   * their place in them (instead of the scattered starting layout), so the
   * live field takes over from the static poster without a jump.
   */
  readonly initialFormations?: ViewportFormations;
  /**
   * Keep particles for the plan of Lyon (fleuves hero, `setFlight`):
   * FLIGHT_SHARE more, ahead of the field's own, each the particle a patch of
   * the plan's streets lands as in the logo mark, unseen until then.
   */
  readonly flight?: boolean;
  /**
   * How many particles the shapes past the hero light (cards, tubes, Pact
   * rings) when the hero needs more (the rivers): the landing's count, so
   * they look as they do there, drawn as finely; the hero's others, and the
   * plan's, fuse into them on the way (formations.ts, FormationParticles).
   */
  readonly shapeParticles?: number;
  /**
   * Called when the field takes the plan's dots over from the page (true: the
   * page stops painting them) or hands them back (false), in the frame it
   * starts or stops drawing them.
   */
  readonly onFlightChange?: (flying: boolean) => void;
}

export interface IonField {
  readonly backend: IonFieldBackend;
  readonly particleCount: number;
  /** Pointer position in CSS pixels relative to the container; `active` false when it leaves. */
  setPointer(x: number, y: number, active: boolean): void;
  /** Flips the pointer's charge with a small shockwave (click or tap). */
  pulse(): void;
  /**
   * Shapes drawn by the particles around page elements (the hero's two
   * atoms and the logo mark, cards, test tubes, Pact rings). Their weights add
   * up to at most 1; the rest of each particle drifts freely.
   */
  setFormations(formations: ViewportFormations): void;
  /**
   * The dots of the plan of Lyon (the rivers hero), for the field to fly
   * them into the logo mark when the page scrolls (`flight` formation), where
   * they fuse into the particles it keeps for them (`flight` option); null
   * removes them.
   */
  setFlight(flight: CityFlight | null): void;
  setRunning(running: boolean): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

// Physics constants, in world units (half the viewport height = 1) and seconds.
const FLOW = 0.11;
const BOND_SPRING = 1.6;
const ORBIT = 0.42;
const POINTER_FORCE = 0.05;
/** Held particles make way for the pointer, then go back to their shape: strength and reach (world units). */
const POINTER_PUSH = 7;
const POINTER_REACH = 0.1;
const CONTAIN = 7;
const DAMPING_FREE = 1.15;
const DAMPING_HELD = 9;
const MAX_SPEED = 1.6;
const GLOW_QUAD = 7;
/**
 * Particles a formation draws finer than this (the schools' logos ask for
 * fine grains, formations.ts) have no bond to their partner: in a logo,
 * partners land anywhere, and a bond would be a stray thread across it.
 * Bonds fade out from a grain of 1 down to this.
 */
const BONDLESS_GRAIN = 0.7;
const bondsFor = (grain: number) => {
  const t = Math.min(1, Math.max(0, (grain - BONDLESS_GRAIN) / (1 - BONDLESS_GRAIN)));
  return t * t * (3 - 2 * t);
};
/**
 * Fine particles (the rivers of the hero): a crisp dot of this radius, in
 * CSS pixels, drawn on a quad this wide, with no halo; and thinner bonds.
 * The same on every screen, whatever the particle count.
 */
const FINE_RADIUS = 1.3;
const FINE_QUAD = 5;
const FINE_BOND = 2.5;
/** Fine dots carry all their light in a pixel or two: brighter than a glow's core. */
const FINE_GAIN = 2.1;
// Formations follow page elements while they scroll: stiffer, and allowed to move faster.
const FORMATION_SPRING = 30;
const FORMATION_MAX_SPEED = 5;
/**
 * Seconds in which a particle takes on most of a new paper colour (a school's
 * logo after another): the colours come with the atoms, not ahead of them.
 */
const TINT_FOLLOW = 0.22;
/** Seconds over which the particles kept for the plan come up once the field has it (a page loaded below the hero). */
const FLIGHT_REVEAL = 1.2;
/** Width of the texture through which the plan's dots find their particles with WebGL2. */
const FLIGHT_TEXTURE_WIDTH = 1024;
/** Milliseconds at a time the field gathers the plan's dots, between the page's frames (gatherFlightSteps). */
const FLIGHT_GATHER_SLICE = 4;

const SCHOOL_RGB: readonly LinearRgb[] = SCHOOL_KEYS.map((key) => tokenToLinearSrgb(schoolColors[key]));
const INK = tokenToLinearSrgb(colorTokens.ink);
const VOLT = tokenToLinearSrgb(colorTokens.volt);
const PLASMA = tokenToLinearSrgb(colorTokens.plasma);
const PAPER = tokenToLinearSrgb(colorTokens.paper);

interface StaticData {
  /** r, g, b, radius */
  readonly color: Float32Array;
  /** Twinkle phase. */
  readonly phase: Float32Array;
  /** charge, phase (vec2: read by the simulation) */
  readonly props: Float32Array;
  /** Per pair: colour of each end. */
  readonly bondColorA: Float32Array;
  readonly bondColorB: Float32Array;
}

function staticData(layout: IonFieldLayout): StaticData {
  const { count } = layout;
  const color = new Float32Array(count * 4);
  const phases = new Float32Array(count);
  const props = new Float32Array(count * 2);
  const bondColorA = new Float32Array((count / 2) * 3);
  const bondColorB = new Float32Array((count / 2) * 3);
  for (let index = 0; index < count; index += 1) {
    const rgb = SCHOOL_RGB[layout.schools[index] ?? 0] ?? [1, 1, 1];
    const phase = layout.phases[index] ?? 0;
    color.set([rgb[0], rgb[1], rgb[2], layout.sizes[index] ?? 0.005], index * 4);
    phases[index] = phase;
    props.set([layout.charges[index] ?? 1, phase], index * 2);
    const pair = index >> 1;
    (index % 2 === 0 ? bondColorA : bondColorB).set(rgb, pair * 3);
  }
  return { color, phase: phases, props, bondColorA, bondColorB };
}

/** Smooth pseudo-noise flow angle, identical on the CPU and in the shaders. */
function flowAngle(x: number, y: number, t: number): number {
  return (
    (Math.sin(x * 1.6 + t * 0.21) + Math.sin(y * 1.9 - t * 0.17) + Math.sin((x + y) * 1.1 + t * 0.13)) * 1.25
  );
}

class WebGpuStartError extends Error {
  override readonly name = "WebGpuStartError";
}

/**
 * Starts the field: WebGPU when available, WebGL2 otherwise. If WebGPU is
 * exposed but fails on the first frame (older implementations, drivers), the
 * field starts again on a fresh canvas with the WebGL2 backend. Rejects when
 * neither works: the caller keeps the static poster.
 */
export async function createIonField(options: IonFieldOptions): Promise<IonField> {
  try {
    return await startIonField(options, options.forceWebGL ?? false);
  } catch (error) {
    if (error instanceof WebGpuStartError) {
      return startIonField(options, true);
    }
    throw error;
  }
}

async function startIonField(options: IonFieldOptions, forceWebGL: boolean): Promise<IonField> {
  const maxPixelRatio = options.maxPixelRatio ?? 1.5;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  options.container.append(canvas);
  const renderer = new WebGPURenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
    forceWebGL,
  });
  try {
    await renderer.init();
  } catch (error) {
    canvas.remove();
    throw error;
  }
  const backend: IonFieldBackend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
    ? "webgpu"
    : "webgl2";

  let pixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(new Color(INK[0], INK[1], INK[2]), 1);

  const requested = Math.max(2, Math.floor(options.particleCount(backend) / 2) * 2);
  const seed = options.seed ?? ION_FIELD_SEED;
  const own = createIonFieldLayout(requested, seed);
  // The particles kept for the plan of Lyon come first (formations.ts, FlightParticles).
  const kept = options.flight ? Math.max(2, Math.round((own.count * FLIGHT_SHARE) / 2) * 2) : 0;
  const layout = withParticlesAhead(own, kept, seed);
  const count = layout.count;
  const planned = {
    count: kept,
    patches: new Float32Array(kept * FLIGHT_PATCH_STRIDE),
    reveal: 0,
    landed: new Float32Array(kept).fill(-1),
  };
  // Past a hero that needs more particles, the shapes light as many as the landing has.
  const shapes =
    options.shapeParticles !== undefined && options.shapeParticles < own.count
      ? Math.max(2, Math.floor(options.shapeParticles / 2) * 2)
      : undefined;
  const particles: FormationParticles =
    kept > 0 || shapes !== undefined
      ? { ...layout, ...(kept > 0 ? { flight: planned } : {}), ...(shapes === undefined ? {} : { shapes }) }
      : layout;
  /** The patches a gathering of the plan fills, which the particles kept for it take up once complete. */
  const gatheredPatches = new Float32Array(planned.patches.length);
  const data = staticData(layout);

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, -10, 10);
  camera.position.z = 1;

  // Uniforms shared by the simulation and the materials.
  const uTime = uniform(0);
  const uDelta = uniform(1 / 60);
  const uAspect = uniform(1);
  const uPointer = uniform(new Vector2(10, 10));
  const uPointerStrength = uniform(0);
  const uPointerCharge = uniform(1);
  const uPulse = uniform(0);
  /** How fine the particles are drawn (0: glowing, 1: crisp dots), and a CSS pixel in world units and device pixels. */
  const uFine = uniform(0);
  const uPixel = uniform(2 / Math.max(1, options.container.clientHeight));
  const uPixelRatio = uniform(1);
  // About the same overall light whatever the particle count: the more ions,
  // the finer each one. A desktop's 1,600 read as fine dust, a phone's 900 as
  // slightly brighter sparks. Past a hero with more particles, the shapes'
  // own (the landing's count) are drawn as on the landing.
  const densityFor = (lit: number) => Math.min(1, Math.max(0.45, Math.sqrt(1000 / lit)));
  const density = densityFor(own.count);
  const shapeDensity = shapes === undefined ? density : densityFor(shapes);
  const uDensity = uniform(density);
  /**
   * The plan's flight: its progress, the map (a kilometre, where 0 km lands), the hero (top,
   * height, sides) and the mark's radius (the dots' curves bow by a share of it).
   */
  const uFlight = uniform(0);
  const uFlightMap = uniform(new Vector3(1, 0, 0));
  const uFlightHero = uniform(new Vector4(1, 2, -2, 2));
  const uFlightRadius = uniform(0.3);

  // Formations, computed on the CPU every frame (formations.ts): x, y, pull, 0 and volt, plasma, glow, 0.
  const formationTargets = new Float32Array(count * FORMATION_STRIDE);
  const formationLooks = new Float32Array(count * FORMATION_STRIDE);
  for (let index = 0; index < count; index += 1) {
    // The plan's particles are unseen until it lands.
    formationLooks[index * FORMATION_STRIDE + 2] = index < kept ? 0 : 1;
  }
  // And the size of each particle's light (the title draws finer grains).
  const formationGrains = new Float32Array(count).fill(1);
  // And the paper's colour (formations.ts), white unless a school's logo brings its own: written for
  // this frame, and as drawn, following it.
  const formationTints = new Float32Array(count * FORMATION_STRIDE);
  const particleTints = new Float32Array(count * FORMATION_STRIDE);

  // Static per-particle attributes, usable by both backends.
  const colorAttribute = instancedBufferAttribute<"vec4">(
    new InstancedBufferAttribute(data.color, 4),
    "vec4",
  );
  const phaseAttribute = instancedBufferAttribute<"float">(
    new InstancedBufferAttribute(data.phase, 1),
    "float",
  );
  const bondColorA = instancedBufferAttribute<"vec3">(
    new InstancedBufferAttribute(data.bondColorA, 3),
    "vec3",
  );
  const bondColorB = instancedBufferAttribute<"vec3">(
    new InstancedBufferAttribute(data.bondColorB, 3),
    "vec3",
  );

  // Same relative positions as the server-rendered poster: x is stretched to the aspect ratio.
  const initialWidth = options.container.clientWidth;
  const initialHeight = options.container.clientHeight;
  const initialAspect = Math.max(1, initialWidth) / Math.max(1, initialHeight);
  const initialPositions = new Float32Array(count * 2);
  for (let index = 0; index < count; index += 1) {
    initialPositions[index * 2] = (layout.positions[index * 2] ?? 0) * initialAspect;
    initialPositions[index * 2 + 1] = layout.positions[index * 2 + 1] ?? 0;
  }
  if (options.initialFormations) {
    // Start right by each particle's place, slightly scattered: the shapes settle in.
    writeFormations(
      formationTargets,
      formationLooks,
      particles,
      toWorldFormations(options.initialFormations, initialWidth, initialHeight),
      null,
      0,
      2 / Math.max(1, initialHeight),
      formationGrains,
      formationTints,
    );
    particleTints.set(formationTints);
    for (let index = 0; index < count; index += 1) {
      const offset = index * FORMATION_STRIDE;
      if ((formationTargets[offset + 2] ?? 0) > 0) {
        initialPositions[index * 2] =
          (formationTargets[offset] ?? 0) + (layout.positions[index * 2] ?? 0) * 0.08;
        initialPositions[index * 2 + 1] =
          (formationTargets[offset + 1] ?? 0) + (layout.positions[index * 2 + 1] ?? 0) * 0.08;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Data sources: GPU storage buffers (WebGPU) or CPU-updated instanced attributes.
  // ---------------------------------------------------------------------------
  let particleCenter: Node<"vec2">;
  let particleBond: Node<"float">;
  let particleLook: Node<"vec4">;
  let particleGrain: Node<"float">;
  let particleTint: Node<"vec4">;
  /**
   * Look of each bond: the tints of its first end, and the glow of the dimmer
   * one (formations dim the particles that sit them out).
   */
  let bondLook: Node<"vec4">;
  /** Uploads the formation buffers after `writeFormations`, and the paper's colours if they moved. */
  let uploadFormations: (recolored: boolean) => void;
  let bondA: Node<"vec2">;
  let bondB: Node<"vec2">;
  let step: (delta: number) => void;
  /** Compiles the simulation's GPU passes ahead of the first step (none on the CPU). */
  let compileStep: () => Promise<void> = async () => {};
  /** Where a particle stands, for the plan's dots to fly to theirs (any of the first `kept`). */
  let particleAt: (index: Node<"uint">) => Node<"vec2">;
  let releaseData = () => {};

  if (backend === "webgpu") {
    const positions = instancedArray(initialPositions, "vec2");
    const velocities = instancedArray(new Float32Array(count * 2), "vec2");
    const props = instancedArray(data.props, "vec2");
    const targets = instancedArray(formationTargets, "vec4");
    const looks = instancedArray(formationLooks, "vec4");
    const grains = instancedArray(formationGrains, "float");
    const tints = instancedArray(particleTints, "vec4");

    const partnerOf = (index: Node<"uint">) => index.add(1).sub(index.mod(2).mul(2));

    const forces = Fn(() => {
      const p = positions.element(instanceIndex).toVar();
      const v = velocities.element(instanceIndex).toVar();
      const prop = props.element(instanceIndex);
      const charge = prop.x;
      const phase = prop.y;
      const formation = targets.element(instanceIndex);
      const pull = formation.z;
      // A particle held by the formations; whatever they leave drifts freely.
      const hold = pull;
      const free = float(1).sub(hold);

      // 1. Drift along a smooth flow field.
      const angle = sin(p.x.mul(1.6).add(uTime.mul(0.21)))
        .add(sin(p.y.mul(1.9).sub(uTime.mul(0.17))))
        .add(sin(p.x.add(p.y).mul(1.1).add(uTime.mul(0.13))))
        .mul(1.25);
      const acc = vec2(cos(angle), sin(angle)).mul(FLOW).mul(free).toVar();

      // 2. Opposite charges attract: each particle has a partner, they bond and part rhythmically.
      const partner = positions.element(partnerOf(instanceIndex));
      const toPartner = partner.sub(p);
      const distance = length(toPartner).add(0.0001);
      const direction = toPartner.div(distance);
      const rhythm = sin(uTime.mul(0.33).add(phase.mul(6.2831)))
        .mul(0.5)
        .add(0.5);
      const rest = mix(float(0.03), float(0.75), rhythm.mul(rhythm));
      const spring = clamp(distance.sub(rest).mul(BOND_SPRING), -0.9, 0.9);
      acc.addAssign(direction.mul(spring).mul(free));
      const close = float(1).sub(smoothstep(0.025, 0.16, distance));
      acc.addAssign(vec2(direction.y.negate(), direction.x).mul(close.mul(ORBIT)).mul(free));

      // 3. The pointer is a charged particle: attracts opposite charges, repels the others.
      const toPointer = uPointer.sub(p);
      const pointerDistance = length(toPointer).add(0.02);
      const pointerDirection = toPointer.div(pointerDistance);
      const polarity = charge.mul(uPointerCharge).negate();
      const pointerPull = clamp(
        polarity
          .mul(uPointerStrength)
          .mul(POINTER_FORCE)
          .div(pointerDistance.mul(pointerDistance).add(0.012)),
        -3.5,
        3.5,
      );
      acc.addAssign(pointerDirection.mul(pointerPull).mul(free));
      const swirl = max(pointerPull, 0).mul(0.35).mul(free);
      acc.addAssign(vec2(pointerDirection.y.negate(), pointerDirection.x).mul(swirl));
      // Held particles part around the pointer instead, and their shape pulls them back.
      const reach = pointerDistance.div(POINTER_REACH);
      acc.subAssign(
        pointerDirection.mul(
          hold
            .mul(uPointerStrength)
            .mul(POINTER_PUSH)
            .mul(exp(reach.mul(reach).negate())),
        ),
      );
      acc.subAssign(pointerDirection.mul(uPulse.mul(2.4).mul(exp(pointerDistance.mul(-3.5)))));

      // 4. Stay on screen (formations may lead off screen while their element scrolls away).
      const bounds = vec2(uAspect.mul(1.04), 1.04);
      const overflow = max(abs(p).sub(bounds), vec2(0, 0)).mul(sign(p));
      acc.subAssign(overflow.mul(CONTAIN).mul(float(1).sub(pull)));

      // 5. Formations: the hero's two atoms, the logo mark, cards, test tubes, Pact rings.
      acc.addAssign(formation.xy.sub(p).mul(pull.mul(pull).mul(FORMATION_SPRING)));

      v.addAssign(acc.mul(uDelta));
      v.mulAssign(exp(mix(float(DAMPING_FREE), float(DAMPING_HELD), hold).mul(uDelta).negate()));
      const speed = length(v);
      const maxSpeed = mix(float(MAX_SPEED), float(FORMATION_MAX_SPEED), pull);
      v.assign(v.mul(clamp(maxSpeed.div(speed.add(0.00001)), 0, 1)));
      velocities.element(instanceIndex).assign(v);
    })().compute(count);

    const integrate = Fn(() => {
      const p = positions.element(instanceIndex);
      // The carry moves held particles with their shape's element as the page scrolls.
      const carry = vec2(0, targets.element(instanceIndex).w);
      p.assign(p.add(velocities.element(instanceIndex).mul(uDelta)).add(carry));
    })().compute(count);

    const computeNodes: ComputeNode[] = [forces, integrate];
    compileStep = () => renderer.compileComputeAsync(computeNodes);

    particleCenter = positions.element(instanceIndex);
    particleAt = (index) => positions.element(index);
    const partnerCenter = positions.element(partnerOf(instanceIndex));
    particleBond = float(1).sub(smoothstep(0.03, 0.2, length(partnerCenter.sub(particleCenter))));
    bondA = positions.element(instanceIndex.mul(2));
    bondB = positions.element(instanceIndex.mul(2).add(1));
    particleLook = looks.element(instanceIndex);
    particleGrain = grains.element(instanceIndex);
    particleTint = tints.element(instanceIndex);
    const firstLook = looks.element(instanceIndex.mul(2));
    const finest = min(grains.element(instanceIndex.mul(2)), grains.element(instanceIndex.mul(2).add(1)));
    bondLook = vec4(
      firstLook.xy,
      min(firstLook.z, looks.element(instanceIndex.mul(2).add(1)).z).mul(
        smoothstep(BONDLESS_GRAIN, 1, finest),
      ),
      firstLook.w,
    );
    uploadFormations = (recolored) => {
      targets.value.needsUpdate = true;
      looks.value.needsUpdate = true;
      grains.value.needsUpdate = true;
      if (recolored) {
        tints.value.needsUpdate = true;
      }
    };

    step = () => {
      renderer.compute(computeNodes);
    };
  } else {
    // CPU simulation: fewer particles, same rules, uploaded as instanced attributes.
    const positions = initialPositions;
    const velocities = new Float32Array(count * 2);
    const particleState = new Float32Array(count * 4);
    const bondState = new Float32Array((count / 2) * 4);
    const particleBuffer = new InstancedBufferAttribute(particleState, 4);
    particleBuffer.setUsage(DynamicDrawUsage);
    const bondBuffer = new InstancedBufferAttribute(bondState, 4);
    bondBuffer.setUsage(DynamicDrawUsage);
    const particleNode = instancedDynamicBufferAttribute<"vec4">(particleBuffer, "vec4");
    const bondNode = instancedDynamicBufferAttribute<"vec4">(bondBuffer, "vec4");
    const lookBuffer = new InstancedBufferAttribute(formationLooks, 4);
    lookBuffer.setUsage(DynamicDrawUsage);
    particleLook = instancedDynamicBufferAttribute<"vec4">(lookBuffer, "vec4");
    const grainBuffer = new InstancedBufferAttribute(formationGrains, 1);
    grainBuffer.setUsage(DynamicDrawUsage);
    particleGrain = instancedDynamicBufferAttribute<"float">(grainBuffer, "float");
    const tintBuffer = new InstancedBufferAttribute(particleTints, 4);
    tintBuffer.setUsage(DynamicDrawUsage);
    particleTint = instancedDynamicBufferAttribute<"vec4">(tintBuffer, "vec4");
    const bondLookState = new Float32Array((count / 2) * 4);
    const bondLookBuffer = new InstancedBufferAttribute(bondLookState, 4);
    bondLookBuffer.setUsage(DynamicDrawUsage);
    bondLook = instancedDynamicBufferAttribute<"vec4">(bondLookBuffer, "vec4");
    uploadFormations = (recolored) => {
      for (let pair = 0; pair < count / 2; pair += 1) {
        const first = pair * 2 * FORMATION_STRIDE;
        bondLookState[pair * 4] = formationLooks[first] ?? 0;
        bondLookState[pair * 4 + 1] = formationLooks[first + 1] ?? 0;
        bondLookState[pair * 4 + 2] =
          Math.min(formationLooks[first + 2] ?? 1, formationLooks[first + FORMATION_STRIDE + 2] ?? 1) *
          bondsFor(Math.min(formationGrains[pair * 2] ?? 1, formationGrains[pair * 2 + 1] ?? 1));
        bondLookState[pair * 4 + 3] = formationLooks[first + 3] ?? 0;
      }
      lookBuffer.needsUpdate = true;
      grainBuffer.needsUpdate = true;
      if (recolored) {
        tintBuffer.needsUpdate = true;
      }
      bondLookBuffer.needsUpdate = true;
    };

    particleCenter = particleNode.xy;
    particleBond = particleNode.z;
    bondA = bondNode.xy;
    bondB = bondNode.zw;
    // The positions of the plan's particles, in a texture the plan's dots read.
    const keptWidth = Math.max(1, Math.min(kept, FLIGHT_TEXTURE_WIDTH));
    const keptRows = Math.max(1, Math.ceil(kept / keptWidth));
    const keptPositions = new Float32Array(keptWidth * keptRows * 2);
    const keptTexture = new DataTexture(keptPositions, keptWidth, keptRows, RGFormat, FloatType);
    keptTexture.needsUpdate = true;
    particleAt = (index) =>
      textureLoad(keptTexture, ivec2(int(index.mod(keptWidth)), int(index.div(keptWidth)))).xy;
    releaseData = () => keptTexture.dispose();

    const write = () => {
      for (let index = 0; index < count; index += 1) {
        const partner = index ^ 1;
        const x = positions[index * 2] ?? 0;
        const y = positions[index * 2 + 1] ?? 0;
        const dx = (positions[partner * 2] ?? 0) - x;
        const dy = (positions[partner * 2 + 1] ?? 0) - y;
        const distance = Math.hypot(dx, dy);
        particleState[index * 4] = x;
        particleState[index * 4 + 1] = y;
        particleState[index * 4 + 2] = 1 - smooth(0.03, 0.2, distance);
        if (index % 2 === 0) {
          bondState.set([x, y, x + dx, y + dy], (index >> 1) * 4);
        }
      }
      particleBuffer.needsUpdate = true;
      bondBuffer.needsUpdate = true;
      if (kept > 0) {
        keptPositions.set(positions.subarray(0, kept * 2));
        keptTexture.needsUpdate = true;
      }
    };
    write();

    step = (delta) => {
      const time = uTime.value;
      const aspect = uAspect.value;
      const pointer = uPointer.value;
      const pointerStrength = uPointerStrength.value;
      const pointerCharge = uPointerCharge.value;
      const pulse = uPulse.value;
      // A particle fully held by its shape (almost all of them, mostly) damps and tops out alike.
      const held = 1;
      const heldDamping = Math.exp(-(DAMPING_FREE + (DAMPING_HELD - DAMPING_FREE) * held) * delta);
      const heldSpeed = MAX_SPEED + (FORMATION_MAX_SPEED - MAX_SPEED) * held;
      // The terms that weigh exactly nothing (a held particle's drift, bond and charge, a still
      // pointer's push) are skipped: every sum keeps its value, bit for bit.
      const pointing = pointerStrength !== 0 || pulse !== 0;
      for (let index = 0; index < count; index += 1) {
        const partner = index ^ 1;
        const px = positions[index * 2] ?? 0;
        const py = positions[index * 2 + 1] ?? 0;
        const pull = formationTargets[index * FORMATION_STRIDE + 2] ?? 0;
        const hold = pull;
        const free = 1 - hold;
        let ax = 0;
        let ay = 0;

        if (free !== 0) {
          const angle = flowAngle(px, py, time);
          ax = Math.cos(angle) * FLOW * free;
          ay = Math.sin(angle) * FLOW * free;

          const dx = (positions[partner * 2] ?? 0) - px;
          const dy = (positions[partner * 2 + 1] ?? 0) - py;
          const distance = Math.hypot(dx, dy) + 0.0001;
          const nx = dx / distance;
          const ny = dy / distance;
          const phase = data.props[index * 2 + 1] ?? 0;
          const rhythm = Math.sin(time * 0.33 + phase * 6.2831) * 0.5 + 0.5;
          const rest = 0.03 + (0.75 - 0.03) * rhythm * rhythm;
          const spring = Math.max(-0.9, Math.min(0.9, (distance - rest) * BOND_SPRING));
          ax += nx * spring * free;
          ay += ny * spring * free;
          const close = 1 - smooth(0.025, 0.16, distance);
          ax += -ny * close * ORBIT * free;
          ay += nx * close * ORBIT * free;
        }

        if (pointing) {
          const tx = pointer.x - px;
          const ty = pointer.y - py;
          const pointerDistance = Math.hypot(tx, ty) + 0.02;
          const qx = tx / pointerDistance;
          const qy = ty / pointerDistance;
          if (free !== 0) {
            const charge = data.props[index * 2] ?? 1;
            const pointerPull = Math.max(
              -3.5,
              Math.min(
                3.5,
                (-charge * pointerCharge * pointerStrength * POINTER_FORCE) /
                  (pointerDistance * pointerDistance + 0.012),
              ),
            );
            ax += qx * pointerPull * free;
            ay += qy * pointerPull * free;
            const swirl = Math.max(pointerPull, 0) * 0.35 * free;
            ax += -qy * swirl;
            ay += qx * swirl;
          }
          // Held particles part around the pointer instead, and their shape pulls them back.
          const reach = pointerDistance / POINTER_REACH;
          const push = hold * pointerStrength * POINTER_PUSH * Math.exp(-reach * reach);
          ax -= qx * push;
          ay -= qy * push;
          const shock = pulse * 2.4 * Math.exp(-pointerDistance * 3.5);
          ax -= qx * shock;
          ay -= qy * shock;
        }

        const contain = CONTAIN * (1 - pull);
        if (contain !== 0) {
          const boundX = aspect * 1.04;
          if (Math.abs(px) > boundX) {
            ax -= (Math.abs(px) - boundX) * Math.sign(px) * contain;
          }
          if (Math.abs(py) > 1.04) {
            ay -= (Math.abs(py) - 1.04) * Math.sign(py) * contain;
          }
        }

        if (pull > 0) {
          const spring = pull * pull * FORMATION_SPRING;
          ax += ((formationTargets[index * FORMATION_STRIDE] ?? 0) - px) * spring;
          ay += ((formationTargets[index * FORMATION_STRIDE + 1] ?? 0) - py) * spring;
        }

        const damping =
          hold === held
            ? heldDamping
            : Math.exp(-(DAMPING_FREE + (DAMPING_HELD - DAMPING_FREE) * hold) * delta);
        let vx = ((velocities[index * 2] ?? 0) + ax * delta) * damping;
        let vy = ((velocities[index * 2 + 1] ?? 0) + ay * delta) * damping;
        const speed = Math.hypot(vx, vy);
        const maxSpeed = pull === held ? heldSpeed : MAX_SPEED + (FORMATION_MAX_SPEED - MAX_SPEED) * pull;
        if (speed > maxSpeed) {
          vx *= maxSpeed / speed;
          vy *= maxSpeed / speed;
        }
        velocities[index * 2] = vx;
        velocities[index * 2 + 1] = vy;
      }
      for (let index = 0; index < count * 2; index += 1) {
        positions[index] = (positions[index] ?? 0) + (velocities[index] ?? 0) * delta;
      }
      // The carry moves held particles with their shape's element as the page scrolls.
      for (let index = 0; index < count; index += 1) {
        positions[index * 2 + 1] =
          (positions[index * 2 + 1] ?? 0) + (formationTargets[index * FORMATION_STRIDE + 3] ?? 0);
      }
      write();
    };
  }

  // ---------------------------------------------------------------------------
  // Materials: soft additive glows for the ions, thin luminous quads for the bonds.
  // ---------------------------------------------------------------------------
  const quad = new PlaneGeometry(1, 1);

  const ionMaterial = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
  });
  const radius = colorAttribute.w.mul(uDensity);
  const phase = phaseAttribute;
  const pointerProximity = float(1)
    .sub(smoothstep(0, 0.35, length(uPointer.sub(particleCenter))))
    .mul(uPointerStrength);
  const twinkle = sin(uTime.mul(1.7).add(phase.mul(40)))
    .mul(0.14)
    .add(0.86);
  // Depth: the smallest ions are dimmer, like dust further away.
  const depth = mix(float(0.26), float(1), smoothstep(0.003, 0.014, radius));
  const swell = float(1).add(particleBond.mul(0.45)).add(pointerProximity.mul(0.6));
  // An ion with no light adds nothing: drawn at no size, it costs the GPU nothing either.
  const quadSize = mix(radius.mul(swell).mul(GLOW_QUAD).mul(particleGrain), uPixel.mul(FINE_QUAD), uFine).mul(
    stepAt(1e-6, particleLook.z),
  );
  ionMaterial.positionNode = vec3(particleCenter.add(positionGeometry.xy.mul(quadSize)), 0);
  const quadPixels = quadSize.div(uPixel).toVarying();
  // Formations tint some motifs (volt, plasma, paper) and dim the particles that sit them out.
  const paperWhite = vec3(PAPER[0], PAPER[1], PAPER[2]);
  const tint = (color: Node<"vec3">, look: Node<"vec4">, paper: Node<"vec3">) =>
    mix(
      mix(mix(color, vec3(VOLT[0], VOLT[1], VOLT[2]), look.x), vec3(PLASMA[0], PLASMA[1], PLASMA[2]), look.y),
      paper,
      look.w,
    );
  // A school's logo brings its own paper colours (premultiplied by their share, the rest white).
  const tinted = tint(
    colorAttribute.xyz,
    particleLook,
    paperWhite.mul(float(1).sub(particleTint.w)).add(particleTint.xyz),
  );
  const ionColor = tinted
    .mul(twinkle.add(particleBond.mul(0.5)).add(pointerProximity.mul(0.8)))
    .mul(mix(depth.mul(uDensity.mul(0.5).add(0.5)), float(FINE_GAIN), uFine))
    .mul(particleLook.z)
    .toVarying();
  const fromCenter = length(uv().sub(0.5)).mul(2);
  const halo = exp(fromCenter.mul(fromCenter).mul(-9)).mul(0.55);
  const core = float(1)
    .sub(smoothstep(0.08, 0.2, fromCenter))
    .mul(1.4);
  // A fine particle: a disc, its edge anti-aliased over one device pixel.
  const disc = clamp(
    float(FINE_RADIUS).sub(fromCenter.mul(quadPixels).mul(0.5)).mul(uPixelRatio).add(0.5),
    0,
    1,
  );
  ionMaterial.colorNode = vec4(ionColor.mul(mix(halo.add(core), disc, uFine)), 1);

  const bondMaterial = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
  });
  const segment = bondB.sub(bondA);
  const segmentLength = length(segment).add(0.00001);
  const along = positionGeometry.x.add(0.5);
  const normal = vec2(segment.y.negate(), segment.x).div(segmentLength);
  bondMaterial.positionNode = vec3(
    bondA.add(segment.mul(along)).add(
      normal.mul(
        // A bond between unlit ions adds nothing: no width.
        positionGeometry.y.mul(mix(float(0.02), uPixel.mul(FINE_BOND), uFine)).mul(stepAt(1e-6, bondLook.z)),
      ),
    ),
    0,
  );
  const bondStrength = float(1)
    .sub(smoothstep(0.03, 0.14, segmentLength))
    .mul(bondLook.z)
    .mul(uDensity.mul(0.75))
    .mul(mix(float(1), float(0.6), uFine))
    .toVarying();
  // Bonds take the tint of their atoms: the title's letters stay white and plasma.
  const bondColor = tint(mix(bondColorA, bondColorB, along), bondLook, paperWhite).toVarying();
  const across = abs(uv().y.sub(0.5)).mul(2);
  const beam = exp(across.mul(across).mul(-42)).add(exp(across.mul(across).mul(-5)).mul(0.14));
  bondMaterial.colorNode = vec4(bondColor.mul(beam).mul(bondStrength).mul(0.9), 1);

  const bonds = new Mesh(quad, bondMaterial);
  bonds.count = count / 2;
  bonds.frustumCulled = false;
  const ions = new Mesh(quad, ionMaterial);
  ions.count = count;
  ions.frustumCulled = false;
  scene.add(bonds, ions);

  // ---------------------------------------------------------------------------
  // The plan of Lyon's dots (fleuves hero): the page paints them while it rests;
  // as it scrolls, the field draws them, in the same place and light, and flies
  // each to the particle its patch of streets lands as, kept for it ahead of the
  // others, into which they fuse (formations.ts: gatherFlight, flightPoint, the
  // same path on the CPU).
  // ---------------------------------------------------------------------------
  const INK_SRGB = linearSrgbToSrgb(INK);
  const PLASMA_SRGB = linearSrgbToSrgb(PLASMA);
  let flightMesh: Mesh | null = null;
  let flightMaterial: MeshBasicNodeMaterial | null = null;
  let flightDots: CityFlight | null = null;
  /** Per dot: the particle its patch lands as (-1: none), and 1 if that one lands in the nucleus. */
  let flightLanding: Float32Array | null = null;
  /** The dots the hero shows, packed for the shader (formations.ts, packFlight): route, timing, colour, size. */
  let flightPacks: readonly InstancedBufferAttribute[] = [];
  /** The hero, in kilometres on the map, the dots were gathered for (null until they are). */
  let gatheredFor: readonly number[] | null = null;
  /** The gathering under way, between the page's frames: the hero it gathers for, and how to abandon it. */
  let gathering: { readonly hero: readonly number[]; readonly abandon: () => void } | null = null;
  let revealFrom = -1;
  const setFlight = (flight: CityFlight | null) => {
    gathering?.abandon();
    gathering = null;
    if (flightMesh) {
      scene.remove(flightMesh);
      flightMaterial?.dispose();
      flightMesh = null;
      flightMaterial = null;
    }
    flightDots = null;
    flightLanding = null;
    flightPacks = [];
    gatheredFor = null;
    if (flying) {
      flying = false;
      options.onFlightChange?.(false);
    }
    revealFrom = -1;
    planned.patches.fill(0);
    planned.landed.fill(-1);
    planned.reveal = 0;
    if (!flight || flight.count === 0 || kept === 0) {
      return;
    }
    flightDots = flight;
    flightLanding = new Float32Array(flight.count * 2);
    // The dots the hero shows, packed once gathered (none until then): only they are drawn.
    const pack = (size: number) => new InstancedBufferAttribute(new Float32Array(flight.count * size), size);
    flightPacks = [pack(FLIGHT_PACK_STRIDE), pack(FLIGHT_PACK_STRIDE), pack(FLIGHT_PACK_STRIDE), pack(1)];
    const [routeData, timingData, colorData, sizeData] = flightPacks as [
      InstancedBufferAttribute,
      InstancedBufferAttribute,
      InstancedBufferAttribute,
      InstancedBufferAttribute,
    ];
    const route = instancedBufferAttribute<"vec4">(routeData, "vec4");
    const timing = instancedBufferAttribute<"vec4">(timingData, "vec4");
    const look = instancedBufferAttribute<"vec4">(colorData, "vec4");
    const dotRadius = instancedBufferAttribute<"float">(sizeData, "float");
    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
    });
    const onMap = (km: Node<"vec2">) =>
      vec2(uFlightMap.y.add(km.x.mul(uFlightMap.x)), uFlightMap.z.add(km.y.mul(uFlightMap.x)));
    const start = onMap(route.xy);
    // Each dot flies by its own numbers, those flightPoint draws (packFlight): once the rivers'
    // particles have set off, it leaves when the flow rising from the foot of the hero reaches it, a
    // little ragged, and its patch lands with the rivers' particles, at the end (smootherstep: it
    // sets off and lands gently)…
    const leave = timing.x;
    const land = timing.y;
    const travel = clamp(uFlight.sub(leave).div(land.sub(leave)), 0, 1);
    const progress = travel
      .mul(travel)
      .mul(travel)
      .mul(travel.mul(travel.mul(6).sub(15)).add(10));
    // …on its particle, wherever it stands (in the mark, making way for the pointer)…
    const target = particleAt(uint(route.z));
    // …along a quadratic Bézier of its own, its middle lifted and pushed aside a little.
    const way = target.sub(start);
    const control = start
      .add(target)
      .mul(0.5)
      .add(vec2(way.y.negate(), way.x).mul(timing.z))
      .add(vec2(0, max(uFlightRadius, 1e-6).mul(timing.w)));
    const rest = float(1).sub(progress);
    const curve = start
      .mul(rest.mul(rest))
      .add(control.mul(rest.mul(progress).mul(2)))
      .add(target.mul(progress.mul(progress)));
    // On its way, it makes way for the pointer, as the field's particles do.
    const fromPointer = curve.sub(uPointer);
    const apart = length(fromPointer);
    const near = apart.div(FLIGHT_PUSH_REACH);
    const push = exp(near.mul(near).negate())
      .mul(uPointerStrength)
      .mul(progress.mul(rest).mul(4 * FLIGHT_PUSH));
    const position = curve.add(fromPointer.div(max(apart, 1e-6)).mul(push));
    // Each keeps its light, as the plan's canvas shows it, on its way; as its patch lands, they all
    // fuse into its particle, which lights up as they fade (writeFormations). Those bound for the
    // nucleus take on its colour.
    const fused = smoothstep(land.sub(FLIGHT_MERGE), land, uFlight);
    const lit = look.w.mul(float(1).sub(fused));
    const plasma = route.w.mul(smoothstep(0.4, 1, progress));
    const quadPixels = dotRadius.add(1).mul(2).mul(stepAt(0.002, lit));
    material.positionNode = vec3(position.add(positionGeometry.xy.mul(quadPixels.mul(uPixel))), 0);
    const opacity = lit.toVarying();
    const tint = mix(look.xyz, vec3(PLASMA_SRGB[0], PLASMA_SRGB[1], PLASMA_SRGB[2]), plasma).toVarying();
    const pixels = quadPixels.toVarying();
    const radius = dotRadius.toVarying();
    // A disc of the painted radius, its edge anti-aliased over one device pixel…
    const fromCenter = length(uv().sub(0.5)).mul(2);
    const coverage = clamp(radius.sub(fromCenter.mul(pixels).mul(0.5)).mul(uPixelRatio).add(0.5), 0, 1);
    // …blended over the ink as the page blends the plan's canvas (in sRGB), added in linear light.
    const ink = vec3(INK_SRGB[0], INK_SRGB[1], INK_SRGB[2]);
    const blended = mix(ink, tint, opacity.mul(coverage));
    const linear = pow(blended.add(0.055).div(1.055), vec3(2.4, 2.4, 2.4));
    material.colorNode = vec4(max(linear.sub(vec3(INK[0], INK[1], INK[2])), vec3(0, 0, 0)), 1);
    const mesh = new Mesh(quad, material);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;
    mesh.visible = false;
    scene.add(mesh);
    flightMesh = mesh;
    flightMaterial = material;
  };

  /**
   * Gathers the dots the hero shows into patches of streets, one for each particle kept for the
   * plan, and packs them for the shader, once it has them and again whenever the hero moves on the
   * map (a resize): between the page's frames, a few milliseconds at a time, so that lighting the
   * plan never stalls the rivers. The particles and the shader take it up once complete, and the
   * plan flies from then on (until then, the page paints it).
   */
  const gather = (flight: FlightFormation) => {
    const dots = flightDots;
    const landing = flightLanding;
    const [route, timing, color, size] = flightPacks;
    if (!dots || !landing || !flightMesh || !route || !timing || !color || !size) {
      return;
    }
    const map = riverMapTransform(flight.box);
    const hero = [
      (flight.hero.left - map.x) / map.scale,
      (flight.hero.right - map.x) / map.scale,
      (flight.hero.top - map.y) / map.scale,
      flight.hero.height / map.scale,
    ];
    const near = (to: readonly number[] | null) =>
      hero.every((value, index) => Math.abs(value - (to?.[index] ?? Number.NaN)) < 0.02);
    if (gathering ? near(gathering.hero) : near(gatheredFor)) {
      return;
    }
    gathering?.abandon();
    const into = { ...particles, flight: { ...planned, patches: gatheredPatches } };
    const steps = (function* (): Generator<void, number, void> {
      yield* gatherFlightSteps(dots.place, dots.look, flight, into, landing);
      return yield* packFlightSteps(
        dots.place,
        dots.look,
        dots.radius,
        landing,
        flight,
        route.array as Float32Array,
        timing.array as Float32Array,
        color.array as Float32Array,
        size.array as Float32Array,
      );
    })();
    const complete = (packed: number) => {
      gathering = null;
      const mesh = flightMesh;
      if (!mesh) {
        return;
      }
      planned.patches.set(gatheredPatches);
      // Only what changed goes to the GPU.
      for (const attribute of flightPacks) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, packed * attribute.itemSize);
        attribute.needsUpdate = true;
      }
      mesh.count = packed;
      gatheredFor = hero;
      // Its shaders compile and its dots go to the GPU now, off the main thread where the browser
      // can, not on the first scroll. (Only what shows is prepared: shown for that one call.)
      const visible = mesh.visible;
      mesh.visible = true;
      void renderer.compileAsync(mesh, camera, scene).catch(() => {});
      mesh.visible = visible;
      if (revealFrom < 0) {
        revealFrom = uTime.value;
      }
    };
    gathering = { hero, abandon: runInSlices(steps, FLIGHT_GATHER_SLICE, complete, fail) };
  };

  /** The flight as it glides after the scroll; `following` false starts it where the scroll is. */
  const flightMotion = { progress: 0, speed: 0 };
  let following = false;
  let flying = false;

  /**
   * Follows the plan's flight, gliding after the scroll: drawn only while it is on its way (the
   * page paints it at rest, and it is particles of the field once landed). Returns the flight
   * as it stands.
   */
  const updateFlight = (flight: FlightFormation | null, delta: number): FlightFormation | null => {
    let gliding = flight;
    if (flight) {
      gather(flight);
      if (following) {
        followFlight(flightMotion, flight.progress, delta);
      } else {
        flightMotion.progress = flight.progress;
        flightMotion.speed = 0;
        following = true;
      }
      gliding = { ...flight, progress: Math.min(1, Math.max(0, flightMotion.progress)) };
    } else {
      following = false;
    }
    planned.reveal = revealFrom < 0 ? 0 : Math.min(1, (uTime.value - revealFrom) / FLIGHT_REVEAL);
    // The page stops painting the plan as soon as the field draws it, in the same frame (once gathered).
    const nowFlying =
      flightMesh !== null && gatheredFor !== null && gliding !== null && gliding.progress > FLIGHT_START;
    if (nowFlying !== flying) {
      flying = nowFlying;
      options.onFlightChange?.(flying);
    }
    if (!flightMesh || !gliding) {
      if (flightMesh) {
        flightMesh.visible = false;
      }
      return gliding;
    }
    const map = riverMapTransform(gliding.box);
    uFlightMap.value.set(map.scale, map.x, map.y);
    uFlightHero.value.set(gliding.hero.top, gliding.hero.height, gliding.hero.left, gliding.hero.right);
    uFlightRadius.value = gliding.mark.radius;
    uFlight.value = gliding.progress;
    // At rest the page paints the plan; once landed, it is particles of the field.
    flightMesh.visible = flying && gliding.progress < 1 - FLIGHT_START;
    return gliding;
  };

  // ---------------------------------------------------------------------------
  // Loop, adaptive quality and controls.
  // ---------------------------------------------------------------------------
  let width = 1;
  let height = 1;
  let running = false;
  let firstFrame = true;
  let broken = false;
  let lastTime = -1;
  let pointerTarget = 0;
  const pointerWorld = new Vector2(10, 10);
  const monitor = createFrameMonitor();
  const adaptive = options.adaptiveQuality ?? true;
  let formations: Formations | null = null;
  let measured: ViewportFormations = {};
  let formationsOn = false;
  let freeLookOn = "1/0";

  /**
   * Recomputes the formation targets for this frame (skipped while the field
   * drifts freely, once the free particles' light is set).
   */
  const updateFormations = (delta: number) => {
    const active = formationStrength(measured) > 0.001;
    const freeLook = `${measured.freeGlow ?? 1}/${measured.freePaper ?? 0}`;
    if (!active && !formationsOn && freeLook === freeLookOn) {
      updateFlight(null, delta);
      return;
    }
    const previous = formations;
    const measuredNow = toWorldFormations(measured, width, height);
    formations = { ...measuredNow, flight: updateFlight(measuredNow.flight ?? null, delta) };
    // The schools' logos load as their stage comes near (the atoms orbit it until they are in).
    if (formations.logo) {
      void loadSchoolLogos();
    }
    // Past the hero, the shapes' particles are drawn as finely as on the landing.
    const past =
      (formations.card?.weight ?? 0) +
      (formations.tubes?.weight ?? 0) +
      (formations.logo?.weight ?? 0) +
      (formations.pact?.weight ?? 0);
    uDensity.value = density + (shapeDensity - density) * Math.min(1, past);
    uFine.value = Math.min(1, formations.rivers?.weight ?? 0);
    writeFormations(
      formationTargets,
      formationLooks,
      particles,
      formations,
      previous,
      uTime.value,
      2 / height,
      formationGrains,
      formationTints,
    );
    // The paper's colours follow those written, so that a new logo's come with its atoms: at once
    // without a previous frame, or once the formations let go. Uploaded only while they move.
    const follow = previous && active ? 1 - Math.exp(-delta / TINT_FOLLOW) : 1;
    let recolored = false;
    for (let index = 0; index < particleTints.length; index += 1) {
      const drawn = particleTints[index] ?? 0;
      const written = formationTints[index] ?? 0;
      if (drawn !== written) {
        particleTints[index] =
          Math.abs(written - drawn) < 1e-4 ? written : drawn + (written - drawn) * follow;
        recolored = true;
      }
    }
    uploadFormations(recolored);
    freeLookOn = freeLook;
    formationsOn = active;
    if (!active) {
      formations = null;
      uFine.value = 0;
    }
  };

  const resize = (nextWidth: number, nextHeight: number) => {
    width = Math.max(1, nextWidth);
    height = Math.max(1, nextHeight);
    // World units change with the size: no carry across a resize.
    formations = null;
    const aspect = width / height;
    uPixel.value = 2 / height;
    uPixelRatio.value = pixelRatio;
    renderer.setSize(width, height, false);
    camera.left = -aspect;
    camera.right = aspect;
    camera.updateProjectionMatrix();
    uAspect.value = aspect;
  };

  const frame = (timestamp: number) => {
    const now = timestamp / 1000;
    // Real frame time, for the quality monitor.
    const frameMs = lastTime < 0 ? 1000 / 60 : (now - lastTime) * 1000;
    // Capped time step: stable integration, and slow devices are only slightly slowed down.
    const delta = lastTime < 0 ? 1 / 60 : Math.min(1 / 24, Math.max(1 / 240, now - lastTime));
    lastTime = now;
    uTime.value += delta;
    uDelta.value = delta;
    uPointerStrength.value += (pointerTarget - uPointerStrength.value) * Math.min(1, delta * 4);
    uPulse.value *= Math.exp(-delta * 5);
    const pointer = uPointer.value;
    pointer.lerp(pointerWorld, Math.min(1, delta * 14));

    try {
      options.beforeFrame?.();
      updateFormations(delta);
      step(delta);
      renderer.render(scene, camera);
    } catch (error) {
      fail(error);
      return;
    }

    if (firstFrame) {
      firstFrame = false;
      options.onFirstFrame?.();
    }
    // The particles kept for the plan come first: always drawn, the field's own follow the monitor.
    const atFloor = pixelRatio <= 1 && ions.count - kept <= 600;
    const bestPixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
    const belowBest = ions.count < count || pixelRatio < bestPixelRatio;
    const verdict = adaptive ? monitor.push(frameMs, atFloor, belowBest) : "ok";
    if (verdict === "give-up") {
      // Even at the lowest quality the device cannot keep up: back to the poster.
      setRunning(false);
      broken = true;
      options.onGiveUp?.();
      return;
    }
    if (verdict === "degrade") {
      if (pixelRatio > 1) {
        pixelRatio = 1;
        uPixelRatio.value = pixelRatio;
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(width, height, false);
      } else if (ions.count - kept > 600) {
        ions.count = kept + Math.max(600, Math.floor((ions.count - kept) / 2 / 2) * 2);
        bonds.count = ions.count / 2;
      }
      options.onQuality?.({ pixelRatio, visibleParticles: ions.count });
    }
    if (verdict === "upgrade") {
      // The device keeps up again (the slowdown was a moment): the particles first, then the sharpness.
      if (ions.count < count) {
        ions.count = Math.min(count, kept + (ions.count - kept) * 2);
        bonds.count = ions.count / 2;
      } else {
        pixelRatio = bestPixelRatio;
        uPixelRatio.value = pixelRatio;
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(width, height, false);
      }
      options.onQuality?.({ pixelRatio, visibleParticles: ions.count });
    }
  };

  const setRunning = (next: boolean) => {
    if (next === running || (next && broken)) {
      return;
    }
    running = next;
    lastTime = -1;
    following = false;
    monitor.reset();
    void renderer.setAnimationLoop(running ? frame : null);
  };

  /** Something went wrong (a frame, gathering the plan): stop, and let the caller fall back. */
  function fail(error: unknown) {
    setRunning(false);
    broken = true;
    options.onError?.(error);
  }

  const release = () => {
    setRunning(false);
    gathering?.abandon();
    gathering = null;
    quad.dispose();
    ionMaterial.dispose();
    bondMaterial.dispose();
    flightMaterial?.dispose();
    releaseData();
    renderer.dispose();
    canvas.remove();
  };

  // A lost GPU device silently draws nothing more: stop, and let the caller fall back.
  const reportDeviceLost = renderer.onDeviceLost.bind(renderer);
  renderer.onDeviceLost = (info) => {
    reportDeviceLost(info);
    setRunning(false);
    broken = true;
    options.onError?.(new Error(`${info.api} device lost`));
  };

  resize(initialWidth, initialHeight);

  // Compile the shaders first, off the main thread where the browser can, one after the other, so
  // starting the field never freezes the page; then probe one frame: a WebGPU implementation that
  // does not support what three.js asks for throws here, and the field starts again with WebGL2.
  try {
    await compileStep();
    await yieldToPage();
    await renderer.compileAsync(bonds, camera, scene);
    await yieldToPage();
    await renderer.compileAsync(ions, camera, scene);
    await yieldToPage();
    step(1 / 60);
    renderer.render(scene, camera);
  } catch (error) {
    release();
    throw backend === "webgpu"
      ? new WebGpuStartError("WebGPU failed on the first frame.", { cause: error })
      : error;
  }

  return {
    backend,
    particleCount: count,
    setPointer(x, y, active) {
      pointerTarget = active ? 1 : 0;
      if (active) {
        pointerWorld.set(((x / width) * 2 - 1) * (width / height), 1 - (y / height) * 2);
        if (uPointerStrength.value < 0.05) {
          uPointer.value.copy(pointerWorld);
        }
      }
    },
    pulse() {
      uPointerCharge.value *= -1;
      uPulse.value = 1;
    },
    setFormations(next) {
      measured = next;
    },
    setFlight,
    setRunning,
    resize,
    dispose: release,
  };
}

/** Lets the page breathe between two long steps of the start-up. */
function yieldToPage(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Runs `steps` between the page's frames, `budget` milliseconds at a time (a step at least), then
 * calls `done` with what they return (`failed` if a step throws). Returns a function that abandons
 * them.
 */
function runInSlices<T>(
  steps: Generator<void, T, void>,
  budget: number,
  done: (value: T) => void,
  failed: (error: unknown) => void,
): () => void {
  let abandoned = false;
  const slice = () => {
    if (abandoned) {
      return;
    }
    try {
      const until = performance.now() + budget;
      let step = steps.next();
      while (!step.done && performance.now() < until) {
        step = steps.next();
      }
      if (step.done) {
        done(step.value);
        return;
      }
    } catch (error) {
      failed(error);
      return;
    }
    timer = setTimeout(slice, 0);
  };
  let timer = setTimeout(slice, 0);
  return () => {
    abandoned = true;
    clearTimeout(timer);
  };
}

function smooth(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export { flowAngle };
