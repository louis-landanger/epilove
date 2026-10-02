import { colors as colorTokens, schoolColors } from "@epilove/tokens";
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
  createIonFieldLayout,
  ION_FIELD_SEED,
  type IonFieldLayout,
  MARK,
  MARK_ROLES,
  SCHOOL_KEYS,
} from "./layout";
import { createFrameMonitor, markPlacementFor } from "./quality";

export type IonFieldBackend = "webgpu" | "webgl2";

export interface IonFieldOptions {
  readonly canvas: HTMLCanvasElement;
  /** Initial size of the canvas in CSS pixels (the starting layout is stretched to its aspect ratio). */
  readonly width: number;
  readonly height: number;
  /** Number of particles (even). Called once the backend is known. */
  readonly particleCount: (backend: IonFieldBackend) => number;
  /** Device pixel ratio ceiling (docs/02-design.md, section 9: 1.5). */
  readonly maxPixelRatio?: number;
  readonly seed?: number;
  /** Called after the first frame is on screen, to cross-fade from the poster. */
  readonly onFirstFrame?: () => void;
  /** Called when the field lowers its quality to keep up (for diagnostics). */
  readonly onDegrade?: (state: { pixelRatio: number; visibleParticles: number }) => void;
}

export interface IonField {
  readonly backend: IonFieldBackend;
  readonly particleCount: number;
  /** Pointer position in CSS pixels relative to the canvas; `active` false when it leaves. */
  setPointer(x: number, y: number, active: boolean): void;
  /** Flips the pointer's charge with a small shockwave (click or tap). */
  pulse(): void;
  /** 0: free field, 1: condensed into the logo mark. */
  setCondense(value: number): void;
  setRunning(running: boolean): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

// Physics constants, in world units (half the viewport height = 1) and seconds.
const FLOW = 0.11;
const BOND_SPRING = 1.6;
const ORBIT = 0.42;
const POINTER_FORCE = 0.05;
const CONTAIN = 7;
const DAMPING_FREE = 1.15;
const DAMPING_CONDENSED = 9;
const CONDENSE_SPRING = 26;
const MAX_SPEED = 1.6;
const GLOW_QUAD = 7;

const SCHOOL_RGB: readonly LinearRgb[] = SCHOOL_KEYS.map((key) => tokenToLinearSrgb(schoolColors[key]));
const MARK_RGB: Record<number, LinearRgb> = {
  [MARK_ROLES.orbit]: tokenToLinearSrgb(colorTokens.paper),
  [MARK_ROLES.nucleus]: tokenToLinearSrgb(colorTokens.plasma),
  [MARK_ROLES.electron]: tokenToLinearSrgb(colorTokens.volt),
};
const INK = tokenToLinearSrgb(colorTokens.ink);

interface StaticData {
  /** r, g, b, radius */
  readonly color: Float32Array;
  /** r, g, b, phase */
  readonly mark: Float32Array;
  /** target x, target y, charge, phase */
  readonly props: Float32Array;
  /** Per pair: colour of each end. */
  readonly bondColorA: Float32Array;
  readonly bondColorB: Float32Array;
}

function staticData(layout: IonFieldLayout): StaticData {
  const { count } = layout;
  const color = new Float32Array(count * 4);
  const mark = new Float32Array(count * 4);
  const props = new Float32Array(count * 4);
  const bondColorA = new Float32Array((count / 2) * 3);
  const bondColorB = new Float32Array((count / 2) * 3);
  for (let index = 0; index < count; index += 1) {
    const rgb = SCHOOL_RGB[layout.schools[index] ?? 0] ?? [1, 1, 1];
    const markRgb = MARK_RGB[layout.roles[index] ?? 0] ?? [1, 1, 1];
    const phase = layout.phases[index] ?? 0;
    color.set([rgb[0], rgb[1], rgb[2], layout.sizes[index] ?? 0.005], index * 4);
    mark.set([markRgb[0], markRgb[1], markRgb[2], phase], index * 4);
    props.set(
      [layout.targets[index * 2] ?? 0, layout.targets[index * 2 + 1] ?? 0, layout.charges[index] ?? 1, phase],
      index * 4,
    );
    const pair = index >> 1;
    (index % 2 === 0 ? bondColorA : bondColorB).set(rgb, pair * 3);
  }
  return { color, mark, props, bondColorA, bondColorB };
}

/** Smooth pseudo-noise flow angle, identical on the CPU and in the shaders. */
function flowAngle(x: number, y: number, t: number): number {
  return (
    (Math.sin(x * 1.6 + t * 0.21) + Math.sin(y * 1.9 - t * 0.17) + Math.sin((x + y) * 1.1 + t * 0.13)) * 1.25
  );
}

export async function createIonField(options: IonFieldOptions): Promise<IonField> {
  const maxPixelRatio = options.maxPixelRatio ?? 1.5;
  const renderer = new WebGPURenderer({
    canvas: options.canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });
  await renderer.init();
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
  const uCondense = uniform(0);
  const uMarkScale = uniform(0.5);
  const uMarkOffset = uniform(new Vector2(0, 0));

  // Static per-particle attributes, usable by both backends.
  const colorAttribute = instancedBufferAttribute<"vec4">(
    new InstancedBufferAttribute(data.color, 4),
    "vec4",
  );
  const markAttribute = instancedBufferAttribute<"vec4">(new InstancedBufferAttribute(data.mark, 4), "vec4");
  const bondColorA = instancedBufferAttribute<"vec3">(
    new InstancedBufferAttribute(data.bondColorA, 3),
    "vec3",
  );
  const bondColorB = instancedBufferAttribute<"vec3">(
    new InstancedBufferAttribute(data.bondColorB, 3),
    "vec3",
  );

  // Same relative positions as the server-rendered poster: x is stretched to the aspect ratio.
  const initialAspect = Math.max(1, options.width) / Math.max(1, options.height);
  const initialPositions = new Float32Array(count * 2);
  for (let index = 0; index < count; index += 1) {
    initialPositions[index * 2] = (layout.positions[index * 2] ?? 0) * initialAspect;
    initialPositions[index * 2 + 1] = layout.positions[index * 2 + 1] ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Data sources: GPU storage buffers (WebGPU) or CPU-updated instanced attributes.
  // ---------------------------------------------------------------------------
  let particleCenter: Node<"vec2">;
  let particleBond: Node<"float">;
  let bondA: Node<"vec2">;
  let bondB: Node<"vec2">;
  let step: (delta: number) => void;

  if (backend === "webgpu") {
    const positions = instancedArray(initialPositions, "vec2");
    const velocities = instancedArray(new Float32Array(count * 2), "vec2");
    const props = instancedArray(data.props, "vec4");

    const partnerOf = (index: Node<"uint">) => index.add(1).sub(index.mod(2).mul(2));

    const forces = Fn(() => {
      const p = positions.element(instanceIndex).toVar();
      const v = velocities.element(instanceIndex).toVar();
      const prop = props.element(instanceIndex);
      const charge = prop.z;
      const phase = prop.w;
      const free = float(1).sub(uCondense);

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
      const pull = clamp(
        polarity
          .mul(uPointerStrength)
          .mul(POINTER_FORCE)
          .div(pointerDistance.mul(pointerDistance).add(0.012)),
        -3.5,
        3.5,
      );
      acc.addAssign(pointerDirection.mul(pull).mul(float(1).sub(uCondense.mul(0.75))));
      const swirl = max(pull, 0).mul(0.35);
      acc.addAssign(vec2(pointerDirection.y.negate(), pointerDirection.x).mul(swirl));
      acc.subAssign(pointerDirection.mul(uPulse.mul(2.4).mul(exp(pointerDistance.mul(-3.5)))));

      // 4. Stay on screen.
      const bounds = vec2(uAspect.mul(1.04), 1.04);
      const overflow = max(abs(p).sub(bounds), vec2(0, 0)).mul(sign(p));
      acc.subAssign(overflow.mul(CONTAIN));

      // 5. Condense into the logo mark while scrolling.
      const target = vec2(prop.x, prop.y).mul(uMarkScale).add(uMarkOffset);
      acc.addAssign(target.sub(p).mul(uCondense.mul(uCondense).mul(CONDENSE_SPRING)));

      v.addAssign(acc.mul(uDelta));
      v.mulAssign(exp(mix(float(DAMPING_FREE), float(DAMPING_CONDENSED), uCondense).mul(uDelta).negate()));
      const speed = length(v);
      v.assign(v.mul(clamp(float(MAX_SPEED).div(speed.add(0.00001)), 0, 1)));
      velocities.element(instanceIndex).assign(v);
    })().compute(count);

    const integrate = Fn(() => {
      const p = positions.element(instanceIndex);
      p.assign(p.add(velocities.element(instanceIndex).mul(uDelta)));
    })().compute(count);

    const computeNodes: ComputeNode[] = [forces, integrate];

    particleCenter = positions.element(instanceIndex);
    const partnerCenter = positions.element(partnerOf(instanceIndex));
    particleBond = float(1).sub(smoothstep(0.03, 0.2, length(partnerCenter.sub(particleCenter))));
    bondA = positions.element(instanceIndex.mul(2));
    bondB = positions.element(instanceIndex.mul(2).add(1));

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
      const condense = uCondense.value;
      const free = 1 - condense;
      const aspect = uAspect.value;
      const pointer = uPointer.value;
      const pointerStrength = uPointerStrength.value;
      const pointerCharge = uPointerCharge.value;
      const pulse = uPulse.value;
      const markScale = uMarkScale.value;
      const markOffset = uMarkOffset.value;
      const damping = Math.exp(-(DAMPING_FREE + (DAMPING_CONDENSED - DAMPING_FREE) * condense) * delta);
      for (let index = 0; index < count; index += 1) {
        const partner = index ^ 1;
        const px = positions[index * 2] ?? 0;
        const py = positions[index * 2 + 1] ?? 0;
        const charge = data.props[index * 4 + 2] ?? 1;
        const phase = data.props[index * 4 + 3] ?? 0;

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
        const pull = Math.max(
          -3.5,
          Math.min(
            3.5,
            (-charge * pointerCharge * pointerStrength * POINTER_FORCE) /
              (pointerDistance * pointerDistance + 0.012),
          ),
        );
        const pointerWeight = 1 - condense * 0.75;
        ax += qx * pull * pointerWeight;
        ay += qy * pull * pointerWeight;
        const swirl = Math.max(pull, 0) * 0.35;
        ax += -qy * swirl;
        ay += qx * swirl;
        const shock = pulse * 2.4 * Math.exp(-pointerDistance * 3.5);
        ax -= qx * shock;
        ay -= qy * shock;

        const boundX = aspect * 1.04;
        if (Math.abs(px) > boundX) {
          ax -= (Math.abs(px) - boundX) * Math.sign(px) * CONTAIN;
        }
        if (Math.abs(py) > 1.04) {
          ay -= (Math.abs(py) - 1.04) * Math.sign(py) * CONTAIN;
        }

        const pull2 = condense * condense * CONDENSE_SPRING;
        ax += ((data.props[index * 4] ?? 0) * markScale + markOffset.x - px) * pull2;
        ay += ((data.props[index * 4 + 1] ?? 0) * markScale + markOffset.y - py) * pull2;

        let vx = ((velocities[index * 2] ?? 0) + ax * delta) * damping;
        let vy = ((velocities[index * 2 + 1] ?? 0) + ay * delta) * damping;
        const speed = Math.hypot(vx, vy);
        if (speed > MAX_SPEED) {
          vx *= MAX_SPEED / speed;
          vy *= MAX_SPEED / speed;
        }
        velocities[index * 2] = vx;
        velocities[index * 2 + 1] = vy;
      }
      for (let index = 0; index < count * 2; index += 1) {
        positions[index] = (positions[index] ?? 0) + (velocities[index] ?? 0) * delta;
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
  const radius = colorAttribute.w;
  const phase = markAttribute.w;
  const pointerProximity = float(1)
    .sub(smoothstep(0, 0.35, length(uPointer.sub(particleCenter))))
    .mul(uPointerStrength);
  const twinkle = mix(
    sin(uTime.mul(1.7).add(phase.mul(40)))
      .mul(0.14)
      .add(0.86),
    float(1),
    uCondense,
  );
  // Depth: the smallest ions are dimmer, like dust further away.
  const depth = mix(float(0.26), float(1), smoothstep(0.003, 0.014, radius));
  const swell = float(1).add(particleBond.mul(0.45)).add(pointerProximity.mul(0.6)).sub(uCondense.mul(0.3));
  ionMaterial.positionNode = vec3(
    particleCenter.add(positionGeometry.xy.mul(radius.mul(swell).mul(GLOW_QUAD))),
    0,
  );
  const ionColor = mix(colorAttribute.xyz, markAttribute.xyz, uCondense.mul(0.85))
    .mul(twinkle.add(particleBond.mul(0.5)).add(pointerProximity.mul(0.8)))
    .mul(depth)
    .mul(mix(float(1), float(0.62), uCondense))
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
    .mul(float(1).sub(uCondense))
    .mul(0.75)
    .toVarying();
  const bondColor = mix(bondColorA, bondColorB, along).toVarying();
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
  let lastTime = -1;
  let pointerTarget = 0;
  const pointerWorld = new Vector2(10, 10);
  const monitor = createFrameMonitor();

  const resize = (nextWidth: number, nextHeight: number) => {
    width = Math.max(1, nextWidth);
    height = Math.max(1, nextHeight);
    const aspect = width / height;
    renderer.setSize(width, height, false);
    camera.left = -aspect;
    camera.right = aspect;
    camera.updateProjectionMatrix();
    uAspect.value = aspect;
    const placement = markPlacementFor(aspect, MARK);
    uMarkScale.value = placement.scale;
    uMarkOffset.value.set(placement.x, placement.y);
  };

  const frame = (timestamp: number) => {
    const now = timestamp / 1000;
    // Capped time step: stable integration, and slow devices are only slightly slowed down.
    const delta = lastTime < 0 ? 1 / 60 : Math.min(1 / 24, Math.max(1 / 240, now - lastTime));
    lastTime = now;
    uTime.value += delta;
    uDelta.value = delta;
    uPointerStrength.value += (pointerTarget - uPointerStrength.value) * Math.min(1, delta * 4);
    uPulse.value *= Math.exp(-delta * 5);
    const pointer = uPointer.value;
    pointer.lerp(pointerWorld, Math.min(1, delta * 14));

    step(delta);
    renderer.render(scene, camera);

    if (firstFrame) {
      firstFrame = false;
      options.onFirstFrame?.();
    }
    const verdict = monitor.push(delta * 1000);
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
    if (next === running) {
      return;
    }
    running = next;
    lastTime = -1;
    monitor.reset();
    void renderer.setAnimationLoop(running ? frame : null);
  };

  resize(options.width, options.height);

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
    setCondense(value) {
      uCondense.value = Math.min(1, Math.max(0, value));
    },
    setRunning,
    resize,
    dispose() {
      setRunning(false);
      quad.dispose();
      ionMaterial.dispose();
      bondMaterial.dispose();
      renderer.dispose();
    },
  };
}

function smooth(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export { flowAngle };
