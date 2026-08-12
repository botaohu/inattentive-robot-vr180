// VR180 WebXR viewer. Mono half-equirect playback with optional depth-based
// stereo parallax ("mono+depth" packed frames: left half = color, right half
// = inverse depth). Enter VR on a headset, or drag to look around in 2D.
import * as THREE from "three";
import { buildHemisphere, dirFromYawPitch } from "./projection.js";
import { SCENARIOS } from "./scenarios.js";

const params = new URLSearchParams(location.search);
const scenario = SCENARIOS.find((s) => s.id === params.get("s")) ?? SCENARIOS[0];
const layout = params.get("layout") || scenario.layout || "mono";
const srcOverride = params.get("src");

document.getElementById("title").textContent = `${scenario.n} · ${scenario.title}`;
document.getElementById("conflict").textContent = scenario.conflict;

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(80, 1, 0.1, 1000);
camera.layers.enable(1);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

// ---- video ------------------------------------------------------------------
const video = document.createElement("video");
video.src = srcOverride || scenario.video;
video.crossOrigin = "anonymous";
video.loop = true;
video.playsInline = true;
video.preload = "auto";
if (scenario.poster && !srcOverride) video.poster = scenario.poster;
const videoTex = new THREE.VideoTexture(video);
videoTex.colorSpace = THREE.SRGBColorSpace;

// ---- per-eye dome material ----------------------------------------------------
// For "mono+depth" the packed frame is [color | inverse-depth]; each eye
// samples color with a small yaw parallax offset proportional to inverse depth.
const MAX_DISPARITY_DEG = 1.1; // comfortable disparity at ~1 m for 64 mm IPD
function domeMaterial(eyeSign /* -1 left, +1 right, 0 mono */) {
  const packed = layout === "mono+depth";
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: videoTex },
      eyeSign: { value: eyeSign },
      isPacked: { value: packed ? 1 : 0 },
      maxDisparity: { value: (MAX_DISPARITY_DEG / 180) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D map;
      uniform float eyeSign;
      uniform int isPacked;
      uniform float maxDisparity;
      void main() {
        vec2 uv = vUv;
        if (isPacked == 1) {
          // depth from right half; color from left half with parallax shift
          float invDepth = texture2D(map, vec2(0.5 + uv.x * 0.5, uv.y)).r;
          float shift = eyeSign * maxDisparity * invDepth;
          uv = vec2(clamp((uv.x + shift), 0.0, 1.0) * 0.5, uv.y);
        }
        gl_FragColor = texture2D(map, uv);
      }
    `,
  });
}

const geo = buildHemisphere({ radius: 200, segments: 128 });
if (layout === "mono+depth") {
  for (const [sign, layer] of [[-1, 1], [1, 2]]) {
    const mesh = new THREE.Mesh(geo, domeMaterial(sign));
    mesh.layers.set(layer);
    scene.add(mesh);
  }
} else {
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: videoTex }));
  mesh.layers.set(1);
  mesh.layers.enable(2);
  scene.add(mesh);
}

// ---- look controls (non-XR) ---------------------------------------------------
let yaw = 0, pitch = 0, dragging = false, px = 0, py = 0;
canvas.addEventListener("pointerdown", (e) => { dragging = true; px = e.clientX; py = e.clientY; });
addEventListener("pointerup", () => (dragging = false));
addEventListener("pointermove", (e) => {
  if (!dragging) return;
  yaw = Math.max(-110, Math.min(110, yaw - (e.clientX - px) * 0.18));
  pitch = Math.max(-85, Math.min(85, pitch + (e.clientY - py) * 0.18));
  px = e.clientX; py = e.clientY;
});
// device orientation "magic window" on mobile could be added here later

// ---- play/enter-vr UI -----------------------------------------------------------
const startBtn = document.getElementById("start");
const vrBtn = document.getElementById("entervr");
startBtn.addEventListener("click", async () => {
  video.muted = false;
  await video.play().catch(async () => { video.muted = true; await video.play().catch(() => {}); });
  startBtn.classList.add("hidden");
});

let xrSession = null;
async function updateVRButton() {
  const ok = navigator.xr && (await navigator.xr.isSessionSupported?.("immersive-vr").catch(() => false));
  vrBtn.disabled = !ok;
  vrBtn.textContent = ok ? "Enter VR" : "VR not available";
}
updateVRButton();
vrBtn.addEventListener("click", async () => {
  if (xrSession) { await xrSession.end(); return; }
  try {
    xrSession = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor"] });
    xrSession.addEventListener("end", () => { xrSession = null; vrBtn.textContent = "Enter VR"; });
    await renderer.xr.setSession(xrSession);
    vrBtn.textContent = "Exit VR";
    video.muted = false;
    await video.play().catch(() => {});
    startBtn.classList.add("hidden");
  } catch (e) {
    console.error("XR session failed", e);
  }
});

renderer.setAnimationLoop(() => {
  if (!renderer.xr.isPresenting) camera.lookAt(dirFromYawPitch(yaw, pitch));
  renderer.render(scene, camera);
});

// test hooks
window.__viewer = { video, scenario, renderer, layout };
window.__viewerReady = new Promise((res) => {
  if (video.readyState >= 2) res(true);
  else video.addEventListener("loadeddata", () => res(true), { once: true });
});
