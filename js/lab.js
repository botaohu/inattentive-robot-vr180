// VR180 Projection Lab — validates that footage is projected correctly.
//
// Query params:
//   src     = synthetic | synthetic-sbs | <url to .mp4/.png/.jpg>   (default synthetic)
//   layout  = mono | sbs | tb                                        (default mono)
//   mode    = hequirect | equirect360 | fisheye180 | flat:<hfovDeg>  (default hequirect)
//   grid    = 1 to overlay the angular grid
//   yaw/pitch/fov = initial camera view (degrees)
//
// Test API (used by Playwright):
//   window.__labReady                     — promise resolving once first frame renders
//   window.__probe(yawDeg, pitchDeg)      — [r,g,b] at the exact view direction
//   window.__setView(yawDeg, pitchDeg, fovDeg) — orient main camera, render
//   window.__patches                      — calibration patch table (incl. eye patch)
import * as THREE from "three";
import {
  buildHemisphere, buildFlatPatch, buildFisheyeHemisphere, eyeTransform,
  makeCalibrationCanvas, makeGridCanvas, dirFromYawPitch, PATCHES, EYE_PATCH,
} from "./projection.js";

const q = new URLSearchParams(location.search);
const src = q.get("src") || "synthetic";
const layout = q.get("layout") || "mono";
const mode = q.get("mode") || "hequirect";
const showGrid = q.get("grid") === "1";

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(Number(q.get("fov") || 90), 1, 0.1, 1000);
camera.layers.enable(1); // magic window shows the left-eye mesh

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

// ---- source texture --------------------------------------------------------
let videoEl = null;
async function loadTexture() {
  if (src.startsWith("synthetic")) {
    const sbs = src === "synthetic-sbs";
    const tex = new THREE.CanvasTexture(makeCalibrationCanvas({ sbs }));
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  if (/\.(png|jpe?g|webp)(\?|$)/i.test(src)) {
    const tex = await new THREE.TextureLoader().loadAsync(src);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  videoEl = document.createElement("video");
  videoEl.src = src;
  videoEl.crossOrigin = "anonymous";
  videoEl.loop = true;
  videoEl.muted = true;
  videoEl.playsInline = true;
  await videoEl.play().catch(() => {});
  await new Promise((res) => {
    if (videoEl.readyState >= 2) return res();
    videoEl.addEventListener("loadeddata", res, { once: true });
  });
  const tex = new THREE.VideoTexture(videoEl);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function geometryFor(modeStr, aspect) {
  if (modeStr === "equirect360") return buildHemisphere({ hfov: 360, vfov: 180 });
  if (modeStr === "fisheye180") return buildFisheyeHemisphere({});
  if (modeStr.startsWith("flat")) {
    const hfov = Number(modeStr.split(":")[1] || 100);
    return buildFlatPatch({ hfovDeg: hfov, aspect });
  }
  return buildHemisphere({});
}

const state = { meshes: [] };

async function build() {
  const baseTex = await loadTexture();
  const image = baseTex.image;
  const frameW = image.videoWidth || image.width, frameH = image.videoHeight || image.height;
  // Aspect of a single eye's sub-frame (for flat mode).
  const eyeW = layout === "sbs" ? frameW / 2 : frameW;
  const eyeH = layout === "tb" ? frameH / 2 : frameH;
  const aspect = eyeW / eyeH;

  for (const [eye, layer] of [["left", 1], ["right", 2]]) {
    const geo = geometryFor(mode, aspect);
    const tex = baseTex.clone();
    tex.needsUpdate = true;
    const t = eyeTransform(layout, eye);
    tex.repeat.set(...t.repeat);
    tex.offset.set(...t.offset);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide }));
    mesh.layers.set(layer);
    scene.add(mesh);
    state.meshes.push(mesh);
    if (layout === "mono") break; // one mesh on layer 1; also show on layer 2
  }
  if (layout === "mono") state.meshes[0].layers.enable(2);

  if (showGrid) {
    const gtex = new THREE.CanvasTexture(makeGridCanvas({}));
    gtex.colorSpace = THREE.SRGBColorSpace;
    const gmesh = new THREE.Mesh(
      buildHemisphere({ radius: 150 }),
      new THREE.MeshBasicMaterial({ map: gtex, transparent: true, side: THREE.FrontSide, depthTest: false }),
    );
    gmesh.renderOrder = 10;
    gmesh.layers.enable(1); gmesh.layers.enable(2);
    scene.add(gmesh);
  }
}

// ---- interaction ------------------------------------------------------------
let yaw = Number(q.get("yaw") || 0), pitch = Number(q.get("pitch") || 0);
function applyView() {
  const d = dirFromYawPitch(yaw, pitch);
  camera.lookAt(d);
}
let dragging = false, px = 0, py = 0;
canvas.addEventListener("pointerdown", (e) => { dragging = true; px = e.clientX; py = e.clientY; });
addEventListener("pointerup", () => (dragging = false));
addEventListener("pointermove", (e) => {
  if (!dragging) return;
  yaw = Math.max(-110, Math.min(110, yaw - (e.clientX - px) * 0.2));
  pitch = Math.max(-89, Math.min(89, pitch + (e.clientY - py) * 0.2));
  px = e.clientX; py = e.clientY;
  applyView();
});

// ---- probe (renders to an offscreen target, reads exact center pixel) -------
const probeRT = new THREE.WebGLRenderTarget(64, 64, { colorSpace: THREE.SRGBColorSpace });
const probeCam = new THREE.PerspectiveCamera(6, 1, 0.1, 1000);
probeCam.layers.set(Number(q.get("probeLayer") || 1));
function probe(yawDeg, pitchDeg) {
  probeCam.lookAt(dirFromYawPitch(yawDeg, pitchDeg));
  renderer.setRenderTarget(probeRT);
  renderer.render(scene, probeCam);
  const buf = new Uint8Array(4 * 4 * 4);
  renderer.readRenderTargetPixels(probeRT, 30, 30, 4, 4, buf);
  renderer.setRenderTarget(null);
  // average the 4x4 center block
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < 16; i++) { r += buf[i * 4]; g += buf[i * 4 + 1]; b += buf[i * 4 + 2]; }
  return [Math.round(r / 16), Math.round(g / 16), Math.round(b / 16)];
}

window.__probe = probe;
window.__setView = (y, p, f) => { yaw = y; pitch = p; if (f) { camera.fov = f; camera.updateProjectionMatrix(); } applyView(); renderer.render(scene, camera); };
window.__patches = { patches: PATCHES, eyePatch: EYE_PATCH };
window.__setProbeEye = (eye) => probeCam.layers.set(eye === "right" ? 2 : 1);

const hud = document.getElementById("hud");
window.__labReady = (async () => {
  await build();
  applyView();
  renderer.setAnimationLoop(() => {
    hud.textContent = `src=${src} layout=${layout} mode=${mode} | yaw ${yaw.toFixed(0)}° pitch ${pitch.toFixed(0)}° fov ${camera.fov}°`;
    renderer.render(scene, camera);
  });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return true;
})();
