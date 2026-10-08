/**
 * The glass of the two drops (WebGL2). Each drop is a dome of glass resting
 * on the page; where they come close, a liquid neck joins them (a smooth
 * union of the two discs). Inside, each pixel shows the page as it is seen
 * through the dome: bent by refraction (magnified at the heart, squeezed at
 * the rim, each colour bent a little differently), tinted by its atom's
 * colour, and mixed with what the glass reflects (a dark room with one soft
 * window towards the light, and the other atom's colour on its side). The
 * light the drops gather falls on the page as a pool of their colour, away
 * from the light; outside the drops, only that pool and a thin contact
 * shadow are drawn, the page itself shows through. The page (the hero's
 * background and its title) is a texture drawn from the page.
 */

export const VERTEX_SHADER = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D uScene;
uniform vec2 uResolution;
// Centre (x, y) and radius of each drop, in device pixels, y upwards.
uniform vec3 uFirst;
uniform vec3 uSecond;
uniform vec3 uFirstTint;
uniform vec3 uSecondTint;
// Where the light comes from, in the screen's plane (length up to 1).
uniform vec2 uLight;
// Width of the liquid neck between the drops, in device pixels.
uniform float uBridge;
uniform float uPixel;

out vec4 outColor;

// Blue bends more than red: a fringe of colour where the glass bends most.
const vec3 IOR = vec3(1.47, 1.51, 1.56);
// A little more magnifying than real glass.
const float LENS = 1.25;

vec3 firstTint;
vec3 secondTint;
vec2 away;

vec3 toLinear(vec3 colour) {
  return pow(colour, vec3(2.2));
}

vec3 toScreen(vec3 colour) {
  return pow(clamp(colour, 0.0, 1.0), vec3(1.0 / 2.2));
}

// The light a drop gathers onto the page, away from the light: a pool of its colour.
vec3 pool(vec2 point, vec3 drop, vec3 tint) {
  float size = max(drop.z, 1.0);
  float reach = length(point - drop.xy - away * size) / size;
  float strength = smoothstep(0.0, 8.0, drop.z);
  return tint * strength * (0.22 * exp(-5.0 * reach * reach) + 0.05 * exp(-1.3 * reach * reach));
}

// The page at a point, lit by the drops.
vec3 page(vec2 point) {
  vec3 colour = toLinear(texture(uScene, clamp(point / uResolution, 0.0, 1.0)).rgb);
  return colour + pool(point, uFirst, firstTint) + pool(point, uSecond, secondTint);
}

void main() {
  vec2 p = gl_FragCoord.xy;
  firstTint = toLinear(uFirstTint);
  secondTint = toLinear(uSecondTint);
  away = -0.42 * uLight;

  vec2 toFirst = p - uFirst.xy;
  vec2 toSecond = p - uSecond.xy;
  float lengthFirst = max(length(toFirst), 1e-3);
  float lengthSecond = max(length(toSecond), 1e-3);
  float reachFirst = length(toFirst - away * uFirst.z) / max(uFirst.z, 1.0);
  float reachSecond = length(toSecond - away * uSecond.z) / max(uSecond.z, 1.0);
  if (min(lengthFirst - 1.5 * uFirst.z, lengthSecond - 1.5 * uSecond.z) > 0.0 && min(reachFirst, reachSecond) > 2.6) {
    outColor = vec4(0.0);
    return;
  }

  // Smooth union of the two discs; its gradient blends the two radial directions.
  float d1 = lengthFirst - uFirst.z;
  float d2 = lengthSecond - uSecond.z;
  float bridge = max(uBridge, 1e-3);
  float h = clamp(0.5 + 0.5 * (d2 - d1) / bridge, 0.0, 1.0);
  float d = mix(d2, d1, h) - bridge * h * (1.0 - h);
  vec2 outward = mix(toSecond / lengthSecond, toFirst / lengthFirst, h);
  outward /= max(length(outward), 1e-3);
  float radius = max(mix(uSecond.z, uFirst.z, h), 1e-3);
  vec3 tint = mix(secondTint, firstTint, h);

  // Outside: the page shows through, under the pools of light and a thin contact shadow.
  float edge = 1.25 * uPixel;
  vec3 pools = pool(p, uFirst, firstTint) + pool(p, uSecond, secondTint);
  vec3 lit = toScreen(pools);
  float glow = max(lit.r, max(lit.g, lit.b));
  float shadow = 0.4 * exp(-max(d, 0.0) / (0.05 * radius)) * smoothstep(0.0, 12.0, radius);
  vec4 outside = vec4(lit, glow + shadow * (1.0 - glow));
  if (d > edge) {
    outColor = outside;
    return;
  }

  // The drop as a dome of glass: its height above the page, and its normal.
  float depth = clamp(-d, 0.0, radius);
  float fromAxis = radius - depth;
  float height = sqrt(max(radius * radius - fromAxis * fromAxis, 0.0));
  vec3 normal = vec3(outward * fromAxis, height) / radius;

  // Refraction: from the eye, straight down through the dome to the page.
  vec3 view = vec3(0.0, 0.0, -1.0);
  vec3 rayRed = refract(view, normal, 1.0 / IOR.r);
  vec3 rayGreen = refract(view, normal, 1.0 / IOR.g);
  vec3 rayBlue = refract(view, normal, 1.0 / IOR.b);
  vec3 seen;
  seen.r = page(p + LENS * height * rayRed.xy / max(-rayRed.z, 0.25)).r;
  seen.g = page(p + LENS * height * rayGreen.xy / max(-rayGreen.z, 0.25)).g;
  seen.b = page(p + LENS * height * rayBlue.xy / max(-rayBlue.z, 0.25)).b;
  // Coloured glass: the longer the path through it, the more of its atom's colour.
  float path = height / max(-rayGreen.z, 0.25) / radius;
  seen *= exp(-(1.0 - tint) * 0.55 * path);
  seen += tint * 0.012 * path;

  // What the glass reflects: towards the page, the page around the drop; above
  // it, a dark room with one soft window towards the light, and the other
  // atom's colour on its side.
  vec3 mirrored = reflect(view, normal);
  vec3 key = normalize(vec3(uLight, 0.85));
  vec3 across = cross(vec3(0.0, 0.0, 1.0), key);
  vec3 right = length(across) > 1e-3 ? normalize(across) : vec3(1.0, 0.0, 0.0);
  vec3 up = cross(key, right);
  vec3 room;
  if (mirrored.z < 0.0) {
    room = page(p + mirrored.xy * radius * 0.6);
  } else {
    room = vec3(0.004, 0.003, 0.008) * (1.0 + mirrored.z);
    float facing = dot(mirrored, key);
    if (facing > 0.0) {
      vec2 onWindow = vec2(dot(mirrored, right), dot(mirrored, up)) / facing;
      vec2 corner = abs(onWindow) - vec2(0.5, 0.15) + 0.12;
      float window = length(max(corner, 0.0)) + min(max(corner.x, corner.y), 0.0) - 0.12;
      room += vec3(1.0, 0.97, 0.94) * 8.0 * smoothstep(0.07, -0.07, window);
    }
    vec2 towardsSecond = uSecond.xy - uFirst.xy;
    towardsSecond /= max(length(towardsSecond), 1e-3);
    vec3 partner = normalize(vec3(towardsSecond * (2.0 * h - 1.0), 0.3));
    vec3 partnerTint = mix(firstTint, secondTint, h);
    room += partnerTint * 1.6 * pow(max(dot(mirrored, partner), 0.0), 3.0);
  }
  float fresnel = 0.04 + 0.96 * pow(1.0 - normal.z, 5.0);
  vec3 glass = mix(seen, room, fresnel);

  // A pin of light where the glass faces the light, and its colour at the rim.
  vec3 halfway = normalize(key + vec3(0.0, 0.0, 1.0));
  glass += vec3(1.0) * 2.5 * pow(max(dot(normal, halfway), 0.0), 700.0);
  glass += tint * 0.22 * pow(1.0 - normal.z, 4.0) * (0.35 + 0.65 * max(dot(normal.xy, normalize(uLight + 1e-4)), 0.0));

  float inside = smoothstep(edge, -edge, d);
  outColor = vec4(toScreen(glass), 1.0) * inside + outside * (1.0 - inside);
}
`;
