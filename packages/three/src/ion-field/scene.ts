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
  length,
  max,
  min,
  mix,
  positionGeometry,
  sign,
  sin,
  smoothstep,
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
  DynamicDrawUsage,
  InstancedBufferAttribute,
  Mesh,
  MeshBasicNodeMaterial,
  type Node,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Vector2,
  WebGPURenderer,
} from "three/webgpu";
import { type LinearRgb, tokenToLinearSrgb } from "../colors";
import {
  FORMATION_STRIDE,
  type Formations,
  formationStrength,
  toWorldFormations,
  type ViewportFormations,
  writeFormations,
} from "./formations";
import { createIonFieldLayout, ION_FIELD_SEED, type IonFieldLayout, SCHOOL_KEYS } from "./layout";
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
  /** Called when the field lowers its quality to keep up (for diagnostics). */
  readonly onDegrade?: (state: { pixelRatio: number; visibleParticles: number }) => void;
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
// Formations follow page elements while they scroll: stiffer, and allowed to move faster.
const FORMATION_SPRING = 30;
const FORMATION_MAX_SPEED = 5;

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
  const layout = createIonFieldLayout(requested, options.seed ?? ION_FIELD_SEED);
  const count = layout.count;
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

  // Formations, computed on the CPU every frame (formations.ts): x, y, pull, 0 and volt, plasma, glow, 0.
  const formationTargets = new Float32Array(count * FORMATION_STRIDE);
  const formationLooks = new Float32Array(count * FORMATION_STRIDE);
  for (let index = 0; index < count; index += 1) {
    formationLooks[index * FORMATION_STRIDE + 2] = 1;
  }
  // And the size of each particle's light (the title draws finer grains).
  const formationGrains = new Float32Array(count).fill(1);

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
      layout,
      toWorldFormations(options.initialFormations, initialWidth, initialHeight),
      null,
      0,
      2 / Math.max(1, initialHeight),
      formationGrains,
    );
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
  /**
   * Look of each bond: the tints of its first end, and the glow of the dimmer
   * one (formations dim the particles that sit them out).
   */
  let bondLook: Node<"vec4">;
  /** Uploads the formation buffers after `writeFormations`. */
  let uploadFormations: () => void;
  let bondA: Node<"vec2">;
  let bondB: Node<"vec2">;
  let step: (delta: number) => void;

  if (backend === "webgpu") {
    const positions = instancedArray(initialPositions, "vec2");
    const velocities = instancedArray(new Float32Array(count * 2), "vec2");
    const props = instancedArray(data.props, "vec2");
    const targets = instancedArray(formationTargets, "vec4");
    const looks = instancedArray(formationLooks, "vec4");
    const grains = instancedArray(formationGrains, "float");

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

    particleCenter = positions.element(instanceIndex);
    const partnerCenter = positions.element(partnerOf(instanceIndex));
    particleBond = float(1).sub(smoothstep(0.03, 0.2, length(partnerCenter.sub(particleCenter))));
    bondA = positions.element(instanceIndex.mul(2));
    bondB = positions.element(instanceIndex.mul(2).add(1));
    particleLook = looks.element(instanceIndex);
    particleGrain = grains.element(instanceIndex);
    const firstLook = looks.element(instanceIndex.mul(2));
    bondLook = vec4(
      firstLook.xy,
      min(firstLook.z, looks.element(instanceIndex.mul(2).add(1)).z),
      firstLook.w,
    );
    uploadFormations = () => {
      targets.value.needsUpdate = true;
      looks.value.needsUpdate = true;
      grains.value.needsUpdate = true;
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
    const bondLookState = new Float32Array((count / 2) * 4);
    const bondLookBuffer = new InstancedBufferAttribute(bondLookState, 4);
    bondLookBuffer.setUsage(DynamicDrawUsage);
    bondLook = instancedDynamicBufferAttribute<"vec4">(bondLookBuffer, "vec4");
    uploadFormations = () => {
      for (let pair = 0; pair < count / 2; pair += 1) {
        const first = pair * 2 * FORMATION_STRIDE;
        bondLookState[pair * 4] = formationLooks[first] ?? 0;
        bondLookState[pair * 4 + 1] = formationLooks[first + 1] ?? 0;
        bondLookState[pair * 4 + 2] = Math.min(
          formationLooks[first + 2] ?? 1,
          formationLooks[first + FORMATION_STRIDE + 2] ?? 1,
        );
        bondLookState[pair * 4 + 3] = formationLooks[first + 3] ?? 0;
      }
      lookBuffer.needsUpdate = true;
      grainBuffer.needsUpdate = true;
      bondLookBuffer.needsUpdate = true;
    };

    particleCenter = particleNode.xy;
    particleBond = particleNode.z;
    bondA = bondNode.xy;
    bondB = bondNode.zw;

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
    };
    write();

    step = (delta) => {
      const time = uTime.value;
      const aspect = uAspect.value;
      const pointer = uPointer.value;
      const pointerStrength = uPointerStrength.value;
      const pointerCharge = uPointerCharge.value;
      const pulse = uPulse.value;
      for (let index = 0; index < count; index += 1) {
        const partner = index ^ 1;
        const px = positions[index * 2] ?? 0;
        const py = positions[index * 2 + 1] ?? 0;
        const charge = data.props[index * 2] ?? 1;
        const phase = data.props[index * 2 + 1] ?? 0;
        const pull = formationTargets[index * FORMATION_STRIDE + 2] ?? 0;
        const hold = pull;
        const free = 1 - hold;

        const angle = flowAngle(px, py, time);
        let ax = Math.cos(angle) * FLOW * free;
        let ay = Math.sin(angle) * FLOW * free;

        const dx = (positions[partner * 2] ?? 0) - px;
        const dy = (positions[partner * 2 + 1] ?? 0) - py;
        const distance = Math.hypot(dx, dy) + 0.0001;
        const nx = dx / distance;
        const ny = dy / distance;
        const rhythm = Math.sin(time * 0.33 + phase * 6.2831) * 0.5 + 0.5;
        const rest = 0.03 + (0.75 - 0.03) * rhythm * rhythm;
        const spring = Math.max(-0.9, Math.min(0.9, (distance - rest) * BOND_SPRING));
        ax += nx * spring * free;
        ay += ny * spring * free;
        const close = 1 - smooth(0.025, 0.16, distance);
        ax += -ny * close * ORBIT * free;
        ay += nx * close * ORBIT * free;

        const tx = pointer.x - px;
        const ty = pointer.y - py;
        const pointerDistance = Math.hypot(tx, ty) + 0.02;
        const qx = tx / pointerDistance;
        const qy = ty / pointerDistance;
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
        // Held particles part around the pointer instead, and their shape pulls them back.
        const reach = pointerDistance / POINTER_REACH;
        const push = hold * pointerStrength * POINTER_PUSH * Math.exp(-reach * reach);
        ax -= qx * push;
        ay -= qy * push;
        const shock = pulse * 2.4 * Math.exp(-pointerDistance * 3.5);
        ax -= qx * shock;
        ay -= qy * shock;

        const boundX = aspect * 1.04;
        const contain = CONTAIN * (1 - pull);
        if (Math.abs(px) > boundX) {
          ax -= (Math.abs(px) - boundX) * Math.sign(px) * contain;
        }
        if (Math.abs(py) > 1.04) {
          ay -= (Math.abs(py) - 1.04) * Math.sign(py) * contain;
        }

        if (pull > 0) {
          const spring = pull * pull * FORMATION_SPRING;
          ax += ((formationTargets[index * FORMATION_STRIDE] ?? 0) - px) * spring;
          ay += ((formationTargets[index * FORMATION_STRIDE + 1] ?? 0) - py) * spring;
        }

        const damping = Math.exp(-(DAMPING_FREE + (DAMPING_HELD - DAMPING_FREE) * hold) * delta);
        let vx = ((velocities[index * 2] ?? 0) + ax * delta) * damping;
        let vy = ((velocities[index * 2 + 1] ?? 0) + ay * delta) * damping;
        const speed = Math.hypot(vx, vy);
        const maxSpeed = MAX_SPEED + (FORMATION_MAX_SPEED - MAX_SPEED) * pull;
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
  // Constant overall light whatever the particle count: thousands of GPU ions
  // read as fine dust, a few hundred CPU ones as brighter sparks.
  const density = Math.min(1, Math.max(0.45, Math.sqrt(1800 / count)));
  const radius = colorAttribute.w.mul(density);
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
  ionMaterial.positionNode = vec3(
    particleCenter.add(positionGeometry.xy.mul(radius.mul(swell).mul(GLOW_QUAD).mul(particleGrain))),
    0,
  );
  // Formations tint some motifs (volt, plasma, paper) and dim the particles that sit them out.
  const tint = (color: Node<"vec3">, look: Node<"vec4">) =>
    mix(
      mix(mix(color, vec3(VOLT[0], VOLT[1], VOLT[2]), look.x), vec3(PLASMA[0], PLASMA[1], PLASMA[2]), look.y),
      vec3(PAPER[0], PAPER[1], PAPER[2]),
      look.w,
    );
  const tinted = tint(colorAttribute.xyz, particleLook);
  const ionColor = tinted
    .mul(twinkle.add(particleBond.mul(0.5)).add(pointerProximity.mul(0.8)))
    .mul(depth)
    .mul(0.5 + density * 0.5)
    .mul(particleLook.z)
    .toVarying();
  const fromCenter = length(uv().sub(0.5)).mul(2);
  const halo = exp(fromCenter.mul(fromCenter).mul(-9)).mul(0.55);
  const core = float(1)
    .sub(smoothstep(0.08, 0.2, fromCenter))
    .mul(1.4);
  ionMaterial.colorNode = vec4(ionColor.mul(halo.add(core)), 1);

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
    bondA.add(segment.mul(along)).add(normal.mul(positionGeometry.y.mul(0.02))),
    0,
  );
  const bondStrength = float(1)
    .sub(smoothstep(0.03, 0.14, segmentLength))
    .mul(bondLook.z)
    .mul(0.75 * density)
    .toVarying();
  // Bonds take the tint of their atoms: the title's letters stay white and plasma.
  const bondColor = tint(mix(bondColorA, bondColorB, along), bondLook).toVarying();
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
  const updateFormations = () => {
    const active = formationStrength(measured) > 0.001;
    const freeLook = `${measured.freeGlow ?? 1}/${measured.freePaper ?? 0}`;
    if (!active && !formationsOn && freeLook === freeLookOn) {
      return;
    }
    const previous = formations;
    formations = toWorldFormations(measured, width, height);
    writeFormations(
      formationTargets,
      formationLooks,
      layout,
      formations,
      previous,
      uTime.value,
      2 / height,
      formationGrains,
    );
    uploadFormations();
    freeLookOn = freeLook;
    formationsOn = active;
    if (!active) {
      formations = null;
    }
  };

  const resize = (nextWidth: number, nextHeight: number) => {
    width = Math.max(1, nextWidth);
    height = Math.max(1, nextHeight);
    // World units change with the size: no carry across a resize.
    formations = null;
    const aspect = width / height;
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
      updateFormations();
      step(delta);
      renderer.render(scene, camera);
    } catch (error) {
      setRunning(false);
      broken = true;
      options.onError?.(error);
      return;
    }

    if (firstFrame) {
      firstFrame = false;
      options.onFirstFrame?.();
    }
    const atFloor = pixelRatio <= 1 && ions.count <= 600;
    const verdict = adaptive ? monitor.push(frameMs, atFloor) : "ok";
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
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(width, height, false);
      } else if (ions.count > 600) {
        ions.count = Math.max(600, Math.floor(ions.count / 2 / 2) * 2);
        bonds.count = ions.count / 2;
      }
      options.onDegrade?.({ pixelRatio, visibleParticles: ions.count });
    }
  };

  const setRunning = (next: boolean) => {
    if (next === running || (next && broken)) {
      return;
    }
    running = next;
    lastTime = -1;
    monitor.reset();
    void renderer.setAnimationLoop(running ? frame : null);
  };

  const release = () => {
    setRunning(false);
    quad.dispose();
    ionMaterial.dispose();
    bondMaterial.dispose();
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

  // Probe one frame now: a WebGPU implementation that does not support what
  // three.js asks for throws here, and the field starts again with WebGL2.
  try {
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
    setRunning,
    resize,
    dispose: release,
  };
}

function smooth(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export { flowAngle };
