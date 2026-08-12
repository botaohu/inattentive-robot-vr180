// Shared VR180 projection geometry + calibration utilities.
//
// Conventions (right-handed, three.js):
//   forward = -Z, right = +X, up = +Y.
//   yaw   θ ∈ [-90°, +90°]  positive = viewer turns right  → u = (θ + 90) / 180
//   pitch φ ∈ [-90°, +90°]  positive = viewer looks up     → v = (φ + 90) / 180
// A half-equirectangular (VR180) frame maps u,v linearly to yaw,pitch.
// direction(θ, φ) = ( sinθ·cosφ, sinφ, -cosθ·cosφ )
import * as THREE from "three";

export const DEG = Math.PI / 180;

export function dirFromYawPitch(yawDeg, pitchDeg) {
  const t = yawDeg * DEG, p = pitchDeg * DEG;
  return new THREE.Vector3(Math.sin(t) * Math.cos(p), Math.sin(p), -Math.cos(t) * Math.cos(p));
}

// Hemisphere with explicit UVs. `window` optionally restricts the textured
// angular window (for previewing flat footage placed on the dome):
//   { hfov, vfov } in degrees — UVs outside the window are marked by uv.x = -1
//   and discarded in the material via alphaTest-style shader patch (we instead
//   clamp geometry: vertices outside the window get no triangles).
export function buildHemisphere({ radius = 200, segments = 128, hfov = 180, vfov = 180 } = {}) {
  const positions = [], uvs = [], indices = [];
  const cols = segments, rows = segments;
  const yaw0 = -hfov / 2, pitch0 = -vfov / 2;
  for (let r = 0; r <= rows; r++) {
    const pitch = pitch0 + (vfov * r) / rows;
    for (let c = 0; c <= cols; c++) {
      const yaw = yaw0 + (hfov * c) / cols;
      const d = dirFromYawPitch(yaw, pitch);
      positions.push(d.x * radius, d.y * radius, d.z * radius);
      uvs.push(c / cols, r / rows);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1;
      // Wound counter-clockwise as seen from the origin (visible from inside).
      indices.push(a, b, d, b, e, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Rectilinear ("flat") footage placed on the dome: geometry spans the image's
// angular footprint (gnomonic projection), so a normal camera clip previews
// exactly as it would after an ffmpeg v360 flat→hequirect remap.
export function buildFlatPatch({ radius = 200, hfovDeg = 100, aspect = 16 / 9, segments = 96 } = {}) {
  const tanH = Math.tan((hfovDeg / 2) * DEG);
  const tanV = tanH / aspect;
  const positions = [], uvs = [], indices = [];
  for (let r = 0; r <= segments; r++) {
    const t = r / segments; // 0 = bottom of image
    for (let c = 0; c <= segments; c++) {
      const s = c / segments; // 0 = left of image
      const d = new THREE.Vector3((s - 0.5) * 2 * tanH, (t - 0.5) * 2 * tanV, -1).normalize();
      positions.push(d.x * radius, d.y * radius, d.z * radius);
      uvs.push(s, t);
    }
  }
  for (let r = 0; r < segments; r++) {
    for (let c = 0; c < segments; c++) {
      const a = r * (segments + 1) + c, b = a + 1, d = a + segments + 1, e = d + 1;
      indices.push(a, b, d, b, e, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

// Equidistant circular fisheye source (180°): UV computed from angular
// distance to forward axis. Useful when a model outputs a fisheye-look frame.
export function buildFisheyeHemisphere({ radius = 200, segments = 128 } = {}) {
  const positions = [], uvs = [], indices = [];
  for (let r = 0; r <= segments; r++) {
    const pitch = -90 + (180 * r) / segments;
    for (let c = 0; c <= segments; c++) {
      const yaw = -90 + (180 * c) / segments;
      const d = dirFromYawPitch(yaw, pitch);
      positions.push(d.x * radius, d.y * radius, d.z * radius);
      const rho = Math.acos(Math.min(1, Math.max(-1, -d.z))); // angle from forward
      const alpha = Math.atan2(d.y, d.x);
      const rr = (rho / (Math.PI / 2)) * 0.5;
      uvs.push(0.5 + rr * Math.cos(alpha), 0.5 + rr * Math.sin(alpha));
    }
  }
  for (let r = 0; r < segments; r++) {
    for (let c = 0; c < segments; c++) {
      const a = r * (segments + 1) + c, b = a + 1, d = a + segments + 1, e = d + 1;
      indices.push(a, b, d, b, e, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

// Per-eye texture window for stereo layouts.
// layout: "mono" | "sbs" (left half = left eye) | "tb" (top half = left eye)
export function eyeTransform(layout, eye /* "left"|"right" */) {
  if (layout === "sbs") return { repeat: [0.5, 1], offset: [eye === "left" ? 0 : 0.5, 0] };
  if (layout === "tb") return { repeat: [1, 0.5], offset: [0, eye === "left" ? 0.5 : 0] };
  return { repeat: [1, 1], offset: [0, 0] };
}

export function makeEyeMesh(texture, { layout = "mono", eye = "left", hfov = 180, vfov = 180, radius = 200 } = {}) {
  const geo = buildHemisphere({ radius, hfov, vfov });
  const mat = new THREE.MeshBasicMaterial({ map: texture.clone ? texture : texture, side: THREE.FrontSide });
  mat.map = texture;
  const mesh = new THREE.Mesh(geo, mat);
  const t = eyeTransform(layout, eye);
  // Clone texture per eye so offset/repeat are independent.
  const tex = texture.clone();
  tex.needsUpdate = true;
  tex.repeat.set(...t.repeat);
  tex.offset.set(...t.offset);
  tex.colorSpace = THREE.SRGBColorSpace;
  mat.map = tex;
  return mesh;
}

// ---- Calibration texture --------------------------------------------------
// Synthetic half-equirect pattern with angular grid + colored reference
// patches. If the projection pipeline is correct, a probe looking at
// (yaw, pitch) must see PATCHES[i].color at each reference direction and the
// grid lines must appear at 15° intervals.
export const PATCHES = [
  { yaw: 0,   pitch: 0,   color: [255, 255, 255], name: "center-white" },
  { yaw: 45,  pitch: 0,   color: [255, 0, 0],     name: "right45-red" },
  { yaw: -45, pitch: 0,   color: [0, 80, 255],    name: "left45-blue" },
  { yaw: 0,   pitch: 45,  color: [0, 200, 0],     name: "up45-green" },
  { yaw: 0,   pitch: -45, color: [255, 200, 0],   name: "down45-yellow" },
  { yaw: 80,  pitch: 0,   color: [255, 0, 255],   name: "right80-magenta" },
  { yaw: -80, pitch: 0,   color: [0, 255, 255],   name: "left80-cyan" },
];

// Eye-identity patch: painted a different color in each half of an SBS
// calibration frame so stereo routing (left eye ↔ left half) is testable.
export const EYE_PATCH = { yaw: 20, pitch: -20, left: [150, 40, 40], right: [40, 40, 150], name: "eye-id" };

export function makeCalibrationCanvas({ width = 2048, height = 2048, sbs = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = sbs ? width * 2 : width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const paintEye = (x0, label, eye) => {
    ctx.save();
    ctx.translate(x0, 0);
    ctx.fillStyle = "#181818";
    ctx.fillRect(0, 0, width, height);
    // grid every 15°
    for (let a = -90; a <= 90; a += 15) {
      const major = a % 45 === 0;
      ctx.strokeStyle = major ? "#8fa" : "#555";
      ctx.lineWidth = major ? 4 : 2;
      const x = ((a + 90) / 180) * width;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      const y = ((a + 90) / 180) * height;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    // reference patches (angular size ~8°)
    for (const p of PATCHES) {
      const u = (p.yaw + 90) / 180, v = (p.pitch + 90) / 180;
      const r = (8 / 180) * width / 2;
      ctx.fillStyle = `rgb(${p.color.join(",")})`;
      ctx.beginPath();
      // v=0 is bottom of the frame in UV space; canvas y grows downward.
      ctx.arc(u * width, (1 - v) * height, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // per-eye identity patch (differs between the two halves of an SBS frame)
    {
      const u = (EYE_PATCH.yaw + 90) / 180, v = (EYE_PATCH.pitch + 90) / 180;
      const r = (8 / 180) * width / 2;
      ctx.fillStyle = `rgb(${(EYE_PATCH[eye] ?? EYE_PATCH.left).join(",")})`;
      ctx.beginPath();
      ctx.arc(u * width, (1 - v) * height, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // yaw labels
    ctx.fillStyle = "#fff";
    ctx.font = `${Math.round(width / 40)}px sans-serif`;
    ctx.textAlign = "center";
    for (let a = -90; a <= 90; a += 45) {
      const x = ((a + 90) / 180) * width;
      ctx.fillText(`${a}°${label}`, x, height / 2 - width / 60);
    }
    ctx.restore();
  };
  paintEye(0, sbs ? "L" : "", "left");
  if (sbs) paintEye(width, "R", "right");
  return canvas;
}

// Grid overlay texture (transparent) for inspecting real footage.
export function makeGridCanvas({ size = 2048 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  for (let a = -90; a <= 90; a += 15) {
    const major = a % 45 === 0;
    ctx.strokeStyle = major ? "rgba(0,255,140,0.9)" : "rgba(255,255,255,0.35)";
    ctx.lineWidth = major ? 3 : 1.5;
    const x = ((a + 90) / 180) * size;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
    const y = ((a + 90) / 180) * size;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
  }
  ctx.fillStyle = "rgba(0,255,140,0.95)";
  ctx.font = `${Math.round(size / 50)}px sans-serif`;
  ctx.textAlign = "center";
  for (let a = -90; a <= 90; a += 45) {
    const x = ((a + 90) / 180) * size;
    ctx.fillText(`yaw ${a}°`, x, size / 2 - 8);
    const y = ((-a + 90) / 180) * size;
    ctx.fillText(`pitch ${a}°`, size / 2, y - 8);
  }
  return canvas;
}
