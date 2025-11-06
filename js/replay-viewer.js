import * as THREE from "../three.js-master/build/three.module.js";
import { OrbitControls } from "../three.js-master/examples/jsm/controls/OrbitControls.js";
import { OBJLoader } from "../three.js-master/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "../three.js-master/examples/jsm/loaders/MTLLoader.js";
import { FBXLoader } from "../three.js-master/examples/jsm/loaders/FBXLoader.js";
import * as SkeletonUtils from "../three.js-master/examples/jsm/utils/SkeletonUtils.js";
import { EffectComposer } from "../three.js-master/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "../three.js-master/examples/jsm/postprocessing/RenderPass.js";
import { OutlinePass } from "../three.js-master/examples/jsm/postprocessing/OutlinePass.js";

const crosshairElement = document.getElementById("crosshair");
const freecamButton = document.getElementById("btn-freecam");
const player1Button = document.getElementById("btn-p1");
const player2Button = document.getElementById("btn-p2");
const playButton = document.getElementById("btn-play");
const matchInfoElement = document.getElementById("match-info");

const orbitP1Button = null;
const orbitP2Button = null;

let player1WalkState = false;
let player2WalkState = false;
let player1StrafeState = 0;
let player2StrafeState = 0;

let player1Label = null;
let player2Label = null;

let scene;
let camera;
let renderer;
let controls;
let composer = null;
let outlinePass = null;
let currentMapObject = null;
let objLoader;
let mtlLoader;
let gridHelper;
let fbxLoader;
let orbitYaw = 0;
let orbitPitch = 0;
const ORBIT_DISTANCE = 7;
const ORBIT_TARGET_LERP_SPEED = 12;

let orbitTarget = new THREE.Vector3();

const PLAYER_RADIUS = 0.6;
const PLAYER_HEIGHT = 4.3;
const PLAYER_CYLINDER_LENGTH = PLAYER_HEIGHT - 2 * PLAYER_RADIUS;
const PLAYER_Y_OFFSET = -1.9;

const clock = new THREE.Clock();

const moveState = { forward: false, backward: false, left: false, right: false };
const MOVE_SPEED = 80;

let pointerLocked = false;
const ROT_SPEED = 0.0025;
let yaw = 0;
let pitch = 0;

let cameraMode = "free";
let lastCameraMode = "free";
const CAMERA_LERP_SPEED = 10;

let player1;
let player2;
let player1Material;
let player2Material;
let tagOwner = 0;

let player1Mixer = null;
let player2Mixer = null;

const player1Actions = {
  idle: null,
  walk: null,
  run: null,
  crouch: null,
  fall: null,
  jump: null,
  hit: null,
  slide: null,
  strafeLeft: null,
  strafeRight: null,
  walkStrafeLeft: null,
  walkStrafeRight: null,
};
const player2Actions = {
  idle: null,
  walk: null,
  run: null,
  crouch: null,
  fall: null,
  jump: null,
  hit: null,
  slide: null,
  strafeLeft: null,
  strafeRight: null,
  walkStrafeLeft: null,
  walkStrafeRight: null,
};

let player1CurrentAction = null;
let player2CurrentAction = null;

let player1IsMoving = false;
let player2IsMoving = false;

let currentReplay = null;
let playbackTime = 0;
let playing = false;
let replayAutoStartTimeout = null;
let replayEndBackTimeout = null;
let p1Index = 0;
let p2Index = 0;
let tagIndex = 0;

let player1Spine = null;
let player2Spine = null;
let player1SpineBaseQuat = null;
let player2SpineBaseQuat = null;

let player1AimPitch = 0;
let player2AimPitch = 0;
let player1Yaw = 0;
let player2Yaw = 0;

let player1IsCrouching = false;
let player2IsCrouching = false;
let player1IsSliding = false;
let player2IsSliding = false;
let player1IsWalking = false;
let player2IsWalking = false;
let player1StrafeDir = 0;
let player2StrafeDir = 0;

let player1AirTime = 0;
let player2AirTime = 0;

let player1HitTimer = 0;
let player2HitTimer = 0;
let useItemIndex = 0;

let player1Speed = 0;
let player2Speed = 0;

let orbitCycleIndex = -1;

const raycaster = new THREE.Raycaster();
let playerFootOffset = 0;

const RUN_SPEED_THRESHOLD = 1.0;
const WALK_MAX_SPEED = 10.0;
const NORMAL_RUN_SPEED = 30.0;
const NORMAL_WALK_SPEED = 7.0;

const STRAFE_ANGLE_THRESHOLD = Math.PI * 0.35;
const BACKWARD_ANGLE_THRESHOLD = Math.PI * 0.75;
const WALK_ENTER_SPEED = 1.0;
const WALK_EXIT_SPEED = 14.0;
const STRAFE_ENTER_ANGLE = STRAFE_ANGLE_THRESHOLD + Math.PI * 0.05;
const STRAFE_EXIT_ANGLE = STRAFE_ANGLE_THRESHOLD - Math.PI * 0.05;

const FLOOR_VERT_SPEED_EPS = 0.1;
const CONTACT_EPS = 0.05;
const CROUCH_PEN = 0.25;
const HIT_DURATION = 0.35;

const EYE_HEIGHT = 3.71;

const POS_LERP_SPEED = 20;
const ROT_LERP_SPEED = 20;

function init() {
  const container = document.getElementById("canvas-container");
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight - 40;

  scene = new THREE.Scene();
  createNightSkyBackground();
  createStars();

  camera = new THREE.PerspectiveCamera(120, width / height, 0.1, 2000);
  camera.position.set(0, 10, 0);
  camera.rotation.order = "YXZ";

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;
  const canvas = renderer.domElement;
  container.appendChild(canvas);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  controls.target.set(0, 10, -1);
  controls.update();

  composer = new EffectComposer(renderer);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  outlinePass = new OutlinePass(new THREE.Vector2(width, height), scene, camera);

  outlinePass.edgeStrength = 8.0;
  outlinePass.edgeThickness = 3.0;
  outlinePass.edgeGlow = 0.0;
  outlinePass.visibleEdgeColor.set(0xff0000);
  outlinePass.hiddenEdgeColor.set(0xff0000);

  composer.addPass(outlinePass);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
  scene.add(ambientLight);

  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x1f2933, 1.3);
  hemisphereLight.position.set(0, 80, 0);
  scene.add(hemisphereLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
  directionalLight.position.set(60, 100, 40);
  scene.add(directionalLight);

  gridHelper = new THREE.GridHelper(80, 40, 0x4b5563, 0x1f2937);
  gridHelper.position.y = 0;
  scene.add(gridHelper);

  objLoader = new OBJLoader();
  mtlLoader = new MTLLoader();
  fbxLoader = new FBXLoader();

  loadPlayerModels();

  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp, { passive: false });

  canvas.addEventListener("click", () => {
    if (!pointerLocked && (cameraMode === "free" || cameraMode === "orbitP1" || cameraMode === "orbitP2")) {
      requestPointerLock();
    }
  });

  document.addEventListener("pointerlockchange", onPointerLockChange);
  canvas.addEventListener("mousemove", onPointerLockMouseMove);

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 2) {
      cycleOrbitTarget();
    }
  });

  freecamButton.addEventListener("click", () => setCameraMode("free"));
  player1Button.addEventListener("click", () => setCameraMode("p1"));
  player2Button.addEventListener("click", () => setCameraMode("p2"));
  if (orbitP1Button) orbitP1Button.addEventListener("click", () => setCameraMode("orbitP1"));
  if (orbitP2Button) orbitP2Button.addEventListener("click", () => setCameraMode("orbitP2"));

  playButton.addEventListener("click", () => {
    playing = !playing;
    playButton.textContent = playing ? "Pause" : "Play";
    if (playing && replayEndBackTimeout) {
      clearTimeout(replayEndBackTimeout);
      replayEndBackTimeout = null;
    }
  });

  updatePovButtonLabels();

  animate();

  loadReplayFromQueryString();
}

function updatePovButtonLabels() {
  const btnP1 = document.getElementById("btn-p1");
  const btnP2 = document.getElementById("btn-p2");
  const p1Name = currentReplay && currentReplay.p1Name ? currentReplay.p1Name : "P1";
  const p2Name = currentReplay && currentReplay.p2Name ? currentReplay.p2Name : "P2";
  if (btnP1) btnP1.textContent = `POV ${p1Name}`;
  if (btnP2) btnP2.textContent = `POV ${p2Name}`;
  if (matchInfoElement && currentReplay) {
    matchInfoElement.textContent = `${p1Name} vs ${p2Name} — Map ${currentReplay.mapId}`;
  }
}

function cycleOrbitTarget() {
  if (!player1 || !player2) return;

  if (orbitCycleIndex === -1) {
    orbitCycleIndex = 0;
    setCameraMode("orbitP1");
  } else if (orbitCycleIndex === 0) {
    orbitCycleIndex = 1;
    setCameraMode("orbitP2");
  } else {
    orbitCycleIndex = -1;
    setCameraMode("free");
  }
}

function exitOrbitToFree() {
  if (cameraMode === "orbitP1" || cameraMode === "orbitP2") {
    setCameraMode("free");
    orbitCycleIndex = -1;
  }
}

function createNightSkyBackground() {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createRadialGradient(size / 2, size * 0.2, 0, size / 2, size, size);

  gradient.addColorStop(0, "#1e293b");
  gradient.addColorStop(1, "#020617");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;

  scene.background = texture;
}

function createStars() {
  const starCount = 1500;
  const radius = 800;

  const positions = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.acos(2 * Math.random() - 1);

    const r = radius;

    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);

    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    size: 2,
    sizeAttenuation: true,
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
  });

  const stars = new THREE.Points(geometry, material);
  stars.renderOrder = -1;

  scene.add(stars);
}

function fixPlayerMaterials(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;

    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of mats) {
      if (!material) continue;

      if (material.opacity === 0 || material.transparent) {
        material.opacity = 1;
        material.transparent = false;
      }
      material.depthWrite = true;
      material.depthTest = true;
      material.side = THREE.FrontSide;
    }

    child.castShadow = true;
    child.receiveShadow = true;
  });
}

function findSpineBone(root) {
  let spineUpper = null;
  let spineMid = null;
  let spineLow = null;

  root.traverse((obj) => {
    if (!obj.isBone) return;
    const n = obj.name.toLowerCase();

    if (!spineUpper && (n.includes("spine_03") || n.includes("spine3"))) spineUpper = obj;
    if (!spineMid && (n.includes("spine_02") || n.includes("spine2"))) spineMid = obj;
    if (!spineLow && (n === "spine" || n.includes("spine_01") || n.includes("spine1"))) spineLow = obj;
  });

  return spineUpper || spineMid || spineLow;
}

function loadPlayerModels() {
  if (!fbxLoader) return;

  fbxLoader.setPath("animations/");

  fbxLoader.load(
    "Breathing Idle.fbx",
    (idleObject) => {
      idleObject.scale.setScalar(0.01);
      fixPlayerMaterials(idleObject);

      player1 = idleObject;
      player2 = SkeletonUtils.clone(idleObject);

      scene.add(player1);
      scene.add(player2);

      updateOutlineSelection();

      player1Mixer = new THREE.AnimationMixer(player1);
      player2Mixer = new THREE.AnimationMixer(player2);

      if (idleObject.animations && idleObject.animations.length > 0) {
        const idleClip = idleObject.animations[0];

        player1Actions.idle = player1Mixer.clipAction(idleClip);
        player2Actions.idle = player2Mixer.clipAction(idleClip);

        player1Actions.idle.play();
        player2Actions.idle.play();

        player1CurrentAction = player1Actions.idle;
        player2CurrentAction = player2Actions.idle;
      }

      setTagOwner(1);

      player1Spine = findSpineBone(player1);
      player2Spine = findSpineBone(player2);

      if (player1Spine && player2Spine) {
        player1SpineBaseQuat = player1Spine.quaternion.clone();
        player2SpineBaseQuat = player2Spine.quaternion.clone();
      }

      player1.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(player1);
      const footY = box.min.y;
      playerFootOffset = player1.position.y - footY;

      fbxLoader.load("Running.fbx", (runObject) => {
        if (!(runObject.animations && runObject.animations.length > 0)) return;
        const runClip = runObject.animations[0];
        player1Actions.run = player1Mixer.clipAction(runClip);
        player2Actions.run = player2Mixer.clipAction(runClip);
      });

      fbxLoader.load("Standard Walk.fbx", (walkObject) => {
        if (!(walkObject.animations && walkObject.animations.length > 0)) return;
        const walkClip = walkObject.animations[0];
        player1Actions.walk = player1Mixer.clipAction(walkClip);
        player2Actions.walk = player2Mixer.clipAction(walkClip);
      });

      fbxLoader.load("Crouch Walk Forward.fbx", (crouchObject) => {
        if (!(crouchObject.animations && crouchObject.animations.length > 0)) return;
        const crouchClip = crouchObject.animations[0];
        player1Actions.crouch = player1Mixer.clipAction(crouchClip);
        player2Actions.crouch = player2Mixer.clipAction(crouchClip);
      });

      fbxLoader.load("Falling Idle.fbx", (fallObject) => {
        if (!(fallObject.animations && fallObject.animations.length > 0)) return;
        const fallClip = fallObject.animations[0];
        player1Actions.fall = player1Mixer.clipAction(fallClip);
        player2Actions.fall = player2Mixer.clipAction(fallClip);
        player1Actions.fall.setLoop(THREE.LoopOnce);
        player2Actions.fall.setLoop(THREE.LoopOnce);
        player1Actions.fall.clampWhenFinished = true;
        player2Actions.fall.clampWhenFinished = true;
        const fallTimeScale = 0.5;
        player1Actions.fall.timeScale = fallTimeScale;
        player2Actions.fall.timeScale = fallTimeScale;
      });

      fbxLoader.load("Mutant Jumping.fbx", (jumpObject) => {
        if (!(jumpObject.animations && jumpObject.animations.length > 0)) return;
        const jumpClip = jumpObject.animations[0];
        player1Actions.jump = player1Mixer.clipAction(jumpClip);
        player2Actions.jump = player2Mixer.clipAction(jumpClip);
        player1Actions.jump.setLoop(THREE.LoopOnce);
        player2Actions.jump.setLoop(THREE.LoopOnce);
        player1Actions.jump.clampWhenFinished = true;
        player2Actions.jump.clampWhenFinished = true;
        const jumpTimeScale = 0.6;
        player1Actions.jump.timeScale = jumpTimeScale;
        player2Actions.jump.timeScale = jumpTimeScale;
      });

      fbxLoader.load("Standing Melee Attack Downward.fbx", (hitObject) => {
        if (!(hitObject.animations && hitObject.animations.length > 0)) return;
        const hitClip = hitObject.animations[0];
        player1Actions.hit = player1Mixer.clipAction(hitClip);
        player2Actions.hit = player2Mixer.clipAction(hitClip);
      });

      fbxLoader.load("Female Action Pose.fbx", (slideObject) => {
        if (!(slideObject.animations && slideObject.animations.length > 0)) return;
        const slideClip = slideObject.animations[0];
        player1Actions.slide = player1Mixer.clipAction(slideClip);
        player2Actions.slide = player2Mixer.clipAction(slideClip);
        const slideTimeScale = 0.8;
        player1Actions.slide.timeScale = slideTimeScale;
        player2Actions.slide.timeScale = slideTimeScale;
      });

      fbxLoader.load("Left Strafe.fbx", (leftStrafeObj) => {
        if (!(leftStrafeObj.animations && leftStrafeObj.animations.length > 0)) return;
        const clip = leftStrafeObj.animations[0];
        player1Actions.strafeLeft = player1Mixer.clipAction(clip);
        player2Actions.strafeLeft = player2Mixer.clipAction(clip);
      });

      fbxLoader.load("Right Strafe.fbx", (rightStrafeObj) => {
        if (!(rightStrafeObj.animations && rightStrafeObj.animations.length > 0)) return;
        const clip = rightStrafeObj.animations[0];
        player1Actions.strafeRight = player1Mixer.clipAction(clip);
        player2Actions.strafeRight = player2Mixer.clipAction(clip);
      });

      fbxLoader.load("Left Strafe Walking.fbx", (leftWalkStrafeObj) => {
        if (!(leftWalkStrafeObj.animations && leftWalkStrafeObj.animations.length > 0)) return;
        const clip = leftWalkStrafeObj.animations[0];
        player1Actions.walkStrafeLeft = player1Mixer.clipAction(clip);
        player2Actions.walkStrafeLeft = player2Mixer.clipAction(clip);
      });

      fbxLoader.load("Walk Strafe Right.fbx", (rightWalkStrafeObj) => {
        if (!(rightWalkStrafeObj.animations && rightWalkStrafeObj.animations.length > 0)) return;
        const clip = rightWalkStrafeObj.animations[0];
        player1Actions.walkStrafeRight = player1Mixer.clipAction(clip);
        player2Actions.walkStrafeRight = player2Mixer.clipAction(clip);
      });
    },
    undefined,
    () => {}
  );
}

function setPlayerAction(isP1, key) {
  const actions = isP1 ? player1Actions : player2Actions;
  const current = isP1 ? player1CurrentAction : player2CurrentAction;
  const next = actions[key];
  if (!next || current === next) return;

  next.reset();
  next.play();
  if (current) current.crossFadeTo(next, 0.18, true);

  if (isP1) player1CurrentAction = next;
  else player2CurrentAction = next;
}

function updatePlayerAnimations(deltaTime) {
  if (player1Mixer) player1Mixer.update(deltaTime);
  if (player2Mixer) player2Mixer.update(deltaTime);

  if (player1HitTimer > 0) player1HitTimer = Math.max(0, player1HitTimer - deltaTime);
  if (player2HitTimer > 0) player2HitTimer = Math.max(0, player2HitTimer - deltaTime);

  const p1RunScale = THREE.MathUtils.clamp(player1Speed / NORMAL_RUN_SPEED, 0.25, 1.8);
  const p2RunScale = THREE.MathUtils.clamp(player2Speed / NORMAL_RUN_SPEED, 0.25, 1.8);
  const p1WalkScale = THREE.MathUtils.clamp(player1Speed / NORMAL_WALK_SPEED, 0.25, 1.8);
  const p2WalkScale = THREE.MathUtils.clamp(player2Speed / NORMAL_WALK_SPEED, 0.25, 1.8);

  if (player1Actions.run) player1Actions.run.timeScale = p1RunScale;
  if (player2Actions.run) player2Actions.run.timeScale = p2RunScale;
  if (player1Actions.walk) player1Actions.walk.timeScale = p1WalkScale;
  if (player2Actions.walk) player2Actions.walk.timeScale = p2WalkScale;
  if (player1Actions.crouch) player1Actions.crouch.timeScale = p1RunScale * 0.7;
  if (player2Actions.crouch) player2Actions.crouch.timeScale = p2RunScale * 0.7;

  if (player1Actions.strafeLeft) player1Actions.strafeLeft.timeScale = p1RunScale;
  if (player1Actions.strafeRight) player1Actions.strafeRight.timeScale = p1RunScale;
  if (player2Actions.strafeLeft) player2Actions.strafeLeft.timeScale = p2RunScale;
  if (player2Actions.strafeRight) player2Actions.strafeRight.timeScale = p2RunScale;

  if (player1Actions.walkStrafeLeft) player1Actions.walkStrafeLeft.timeScale = p1WalkScale;
  if (player1Actions.walkStrafeRight) player1Actions.walkStrafeRight.timeScale = p1WalkScale;
  if (player2Actions.walkStrafeLeft) player2Actions.walkStrafeLeft.timeScale = p2WalkScale;
  if (player2Actions.walkStrafeRight) player2Actions.walkStrafeRight.timeScale = p2WalkScale;

  {
    const a = player1Actions;
    let key = null;

    if (player1IsSliding && a.slide) key = "slide";
    else if (player1IsCrouching && a.crouch) key = "crouch";
    else if (!player1IsMoving) key = a.idle ? "idle" : null;
    else {
      if (player1StrafeDir === -1) {
        if (player1IsWalking && a.walkStrafeLeft) key = "walkStrafeLeft";
        else if (!player1IsWalking && a.strafeLeft) key = "strafeLeft";
        else if (player1IsWalking && a.walk) key = "walk";
        else if (a.run) key = "run";
      } else if (player1StrafeDir === 1) {
        if (player1IsWalking && a.walkStrafeRight) key = "walkStrafeRight";
        else if (!player1IsWalking && a.strafeRight) key = "strafeRight";
        else if (player1IsWalking && a.walk) key = "walk";
        else if (a.run) key = "run";
      } else {
        if (player1IsWalking && a.walk) key = "walk";
        else if (a.run) key = "run";
      }
    }

    if (key) setPlayerAction(true, key);
  }

  {
    const a = player2Actions;
    let key = null;

    if (player2IsSliding && a.slide) key = "slide";
    else if (player2IsCrouching && a.crouch) key = "crouch";
    else if (!player2IsMoving) key = a.idle ? "idle" : null;
    else {
      if (player2StrafeDir === -1) {
        if (player2IsWalking && a.walkStrafeLeft) key = "walkStrafeLeft";
        else if (!player2IsWalking && a.strafeLeft) key = "strafeLeft";
        else if (player2IsWalking && a.walk) key = "walk";
        else if (a.run) key = "run";
      } else if (player2StrafeDir === 1) {
        if (player2IsWalking && a.walkStrafeRight) key = "walkStrafeRight";
        else if (!player2IsWalking && a.strafeRight) key = "strafeRight";
        else if (player2IsWalking && a.walk) key = "walk";
        else if (a.run) key = "run";
      } else {
        if (player2IsWalking && a.walk) key = "walk";
        else if (a.run) key = "run";
      }
    }

    if (key) setPlayerAction(false, key);
  }
}

function applyUpperBodyAim(spine, baseQuat, aimPitch, hitTimer) {
  if (!spine || !baseQuat) return;
  if (aimPitch == null) return;

  const pitchFactor = 1.0;
  const maxPitch = Math.PI;

  const x = THREE.MathUtils.clamp(-aimPitch * pitchFactor, -maxPitch, maxPitch);
  const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), x);

  spine.quaternion.copy(baseQuat);
  spine.quaternion.multiply(pitchQuat);

  if (hitTimer && hitTimer > 0) {
    const t = 1 - hitTimer / HIT_DURATION;
    const swing = Math.sin(t * Math.PI) * 0.7;
    const hitQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), swing);
    spine.quaternion.multiply(hitQuat);
  }
}

function updateUpperBodyAim() {
  applyUpperBodyAim(player1Spine, player1SpineBaseQuat, player1AimPitch, player1HitTimer);
  applyUpperBodyAim(player2Spine, player2SpineBaseQuat, player2AimPitch, player2HitTimer);
}

function getGroundInfoAt(pos) {
  if (!currentMapObject || !pos) {
    return { hasGround: false, dist: Infinity, groundY: -Infinity };
  }

  const origin = new THREE.Vector3(pos.x, pos.y + 10, pos.z);
  const dir = new THREE.Vector3(0, -1, 0);

  raycaster.set(origin, dir);
  const intersects = raycaster.intersectObject(currentMapObject, true);
  if (!intersects.length) {
    return { hasGround: false, dist: Infinity, groundY: -Infinity };
  }

  const hit = intersects[0];
  const feetY = pos.y - playerFootOffset;
  const dist = feetY - hit.point.y;

  return { hasGround: true, dist, groundY: hit.point.y };
}

function setTagOwner(owner) {
  tagOwner = owner;
  const tagOwnerColor = 0xef4444;
  const nonOwnerColor = 0x3b82f6;

  if (player1Material && player2Material) {
    player1Material.color.set(owner === 1 ? tagOwnerColor : nonOwnerColor);
    player2Material.color.set(owner === 2 ? tagOwnerColor : nonOwnerColor);
  }

  updateOutlineSelection();
}

function collectMeshes(root, outArray) {
  root.traverse((obj) => {
    if (obj.isMesh || obj.isSkinnedMesh) {
      outArray.push(obj);
    }
  });
}

function updateOutlineSelection() {
  if (!outlinePass) return;

  const selected = [];

  if (tagOwner === 1 && cameraMode !== "p1" && player1) {
    collectMeshes(player1, selected);
  }
  if (tagOwner === 2 && cameraMode !== "p2" && player2) {
    collectMeshes(player2, selected);
  }

  outlinePass.selectedObjects = selected;
}

function setCameraMode(mode) {
  cameraMode = mode;

  if (player1 && player2) {
    if (mode === "p1") {
      player1.visible = false;
      player2.visible = true;
    } else if (mode === "p2") {
      player1.visible = true;
      player2.visible = false;
    } else {
      player1.visible = true;
      player2.visible = true;
    }
  }

  if (mode === "free") {
    controls.enabled = true;
  } else if (mode === "orbitP1" || mode === "orbitP2") {
    controls.enabled = false;
    crosshairElement.style.display = "none";
    document.body.style.cursor = pointerLocked ? "none" : "default";

    const targetMesh = mode === "orbitP1" ? player1 : player2;
    if (targetMesh) {
      const target = new THREE.Vector3().copy(targetMesh.position);
      target.y += EYE_HEIGHT;

      orbitTarget.copy(target);

      const camToTarget = new THREE.Vector3().subVectors(target, camera.position);
      const r = camToTarget.length();
      if (r > 0.0001) {
        orbitPitch = Math.asin(camToTarget.y / r);
        orbitYaw = Math.atan2(camToTarget.x, camToTarget.z);
      }
    }
  } else {
    controls.enabled = false;
    if (pointerLocked) exitPointerLock();
    document.body.style.cursor = "default";
    crosshairElement.style.display = "none";
    pointerLocked = false;
  }

  updateOutlineSelection();
}

function onResize() {
  if (!renderer || !camera) return;
  const container = document.getElementById("canvas-container");
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight - 40;
  renderer.setSize(width, height);
  if (composer) composer.setSize(width, height);
  if (outlinePass) outlinePass.setSize(width, height);

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function requestPointerLock() {
  const canvas = renderer.domElement;
  if (canvas.requestPointerLock) canvas.requestPointerLock();
}

function exitPointerLock() {
  if (document.exitPointerLock) document.exitPointerLock();
}

function onPointerLockChange() {
  const canvas = renderer.domElement;
  const isLocked = document.pointerLockElement === canvas;
  pointerLocked = isLocked;

  if (!isLocked) {
    document.body.style.cursor = "default";
    crosshairElement.style.display = "none";

    if (cameraMode === "free") {
      controls.enabled = true;
    }
    return;
  }

  document.body.style.cursor = "none";

  if (cameraMode === "free") {
    crosshairElement.style.display = "block";
    controls.enabled = false;
    camera.rotation.order = "YXZ";
    yaw = camera.rotation.y;
    pitch = camera.rotation.x;
  } else if (cameraMode === "orbitP1" || cameraMode === "orbitP2") {
    crosshairElement.style.display = "none";
    controls.enabled = false;
  } else {
    crosshairElement.style.display = "none";
  }
}

function onPointerLockMouseMove(event) {
  if (!pointerLocked || !camera) return;

  const deltaX = event.movementX || 0;
  const deltaY = event.movementY || 0;
  if (deltaX === 0 && deltaY === 0) return;

  if (cameraMode === "free") {
    yaw -= deltaX * ROT_SPEED;
    pitch -= deltaY * ROT_SPEED;

    const verticalLimit = Math.PI / 2 - 0.05;
    if (pitch > verticalLimit) pitch = verticalLimit;
    if (pitch < -verticalLimit) pitch = -verticalLimit;

    camera.rotation.set(pitch, yaw, 0, "YXZ");
  } else if (cameraMode === "orbitP1" || cameraMode === "orbitP2") {
    orbitYaw -= deltaX * ROT_SPEED;
    orbitPitch += deltaY * ROT_SPEED;

    const vLimit = Math.PI / 2 - 0.1;
    if (orbitPitch > vLimit) orbitPitch = vLimit;
    if (orbitPitch < -vLimit) orbitPitch = -vLimit;
  }
}

function onKeyDown(event) {
  const key = event.key.toLowerCase();

  if (key === "z" || key === "q" || key === "s" || key === "d") {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey || event.altKey) return;
  }

  if (key === "control") {
    if (cameraMode === "free") {
      if (pointerLocked) exitPointerLock();
      else requestPointerLock();
    }
    event.preventDefault();
    return;
  }

  const k = event.key.toLowerCase();
  if (
    k === "z" ||
    k === "q" ||
    k === "s" ||
    k === "d" ||
    k === "w" ||
    k === "a" ||
    k === "s" ||
    k === "d"
  ) {
    exitOrbitToFree();
  }

  switch (key) {
    case "z":
      moveState.forward = true;
      break;
    case "s":
      moveState.backward = true;
      break;
    case "q":
      moveState.left = true;
      break;
    case "d":
      moveState.right = true;
      break;
  }
}

function onKeyUp(event) {
  const key = event.key.toLowerCase();
  if (key === "z" || key === "q" || key === "s" || key === "d") event.preventDefault();

  switch (key) {
    case "z":
      moveState.forward = false;
      break;
    case "s":
      moveState.backward = false;
      break;
    case "q":
      moveState.left = false;
      break;
    case "d":
      moveState.right = false;
      break;
  }
}

function updateMovement(deltaTime) {
  if (cameraMode !== "free") return;
  if (!camera) return;

  const movementVector = new THREE.Vector3();
  const upVector = new THREE.Vector3(0, 1, 0);

  const forwardVector = new THREE.Vector3();
  camera.getWorldDirection(forwardVector);
  forwardVector.normalize();

  const rightVector = new THREE.Vector3().crossVectors(forwardVector, upVector).normalize();

  if (moveState.forward) movementVector.add(forwardVector);
  if (moveState.backward) movementVector.sub(forwardVector);
  if (moveState.right) movementVector.add(rightVector);
  if (moveState.left) movementVector.sub(rightVector);

  if (movementVector.lengthSq() > 0) {
    movementVector.normalize().multiplyScalar(MOVE_SPEED * deltaTime);
    camera.position.add(movementVector);
    controls.target.add(movementVector);
  }
}

function disposeCurrentMap() {
  if (!currentMapObject) return;
  currentMapObject.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material && material.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
  scene.remove(currentMapObject);
  currentMapObject = null;
}

function focusOnObject(object) {
  const boundingBox = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  boundingBox.getSize(size);
  boundingBox.getCenter(center);

  const maxDimension = Math.max(size.x, size.y, size.z);
  const distance = maxDimension * 1.5 || 20;

  camera.position.set(center.x + distance, center.y + distance, center.z + distance);
  controls.target.copy(center);
  controls.update();

  if (gridHelper) gridHelper.position.y = boundingBox.min.y;
}

function fixMaterials(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) continue;
      if (material.opacity === 0) material.opacity = 1;
      material.transparent = false;
      material.depthWrite = true;
      material.side = THREE.FrontSide;
    }
  });
}

function loadMap(mapId) {
  disposeCurrentMap();

  const basePath = "maps/" + mapId + "/";
  const baseName = mapId.toString();

  mtlLoader.setPath(basePath);
  objLoader.setPath(basePath);

  mtlLoader.load(baseName + ".mtl", (materials) => {
    materials.preload();
    objLoader.setMaterials(materials);
    objLoader.load(baseName + ".obj", (object) => {
      fixMaterials(object);
      currentMapObject = object;
      scene.add(currentMapObject);
      focusOnObject(currentMapObject);
    });
  });
}

function createNameSprite(text) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const fontSize = 48;
  ctx.font = `bold ${fontSize}px sans-serif`;
  const textMetrics = ctx.measureText(text || "");
  const textWidth = textMetrics.width;

  const paddingX = 16;
  const paddingY = 10;

  canvas.width = Math.ceil(textWidth + paddingX * 2);
  canvas.height = Math.ceil(fontSize + paddingY * 2);

  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "black";
  ctx.lineWidth = 4;
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);

  ctx.fillStyle = "white";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
  });

  const sprite = new THREE.Sprite(material);

  const worldHeight = 0.8;
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(worldHeight * aspect, worldHeight, 1);

  sprite.center.set(0.5, 0.0);

  return sprite;
}

function createOrUpdateNameLabels() {
  if (!currentReplay || !scene) return;

  const p1Name = currentReplay.p1Name || "Player 1";
  const p2Name = currentReplay.p2Name || "Player 2";

  if (player1Label) {
    scene.remove(player1Label);
    player1Label.material.map.dispose();
    player1Label.material.dispose();
  }
  if (player2Label) {
    scene.remove(player2Label);
    player2Label.material.map.dispose();
    player2Label.material.dispose();
  }

  player1Label = createNameSprite(p1Name);
  player2Label = createNameSprite(p2Name);

  scene.add(player1Label);
  scene.add(player2Label);
}

function updateNameLabelPositions() {
  const offsetY = EYE_HEIGHT + 0.5;

  if (player1 && player1Label) {
    player1Label.position.copy(player1.position);
    player1Label.position.y += offsetY;
    player1Label.visible = cameraMode !== "p1";
  }

  if (player2 && player2Label) {
    player2Label.position.copy(player2.position);
    player2Label.position.y += offsetY;
    player2Label.visible = cameraMode !== "p2";
  }
}

async function loadReplayFromUrl(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return;
    }
    const buffer = await res.arrayBuffer();
    const replay = parseReplay(buffer);
    if (!replay) {
      return;
    }
    applyReplay(replay);
  } catch (err) {}
}

function loadReplayFromQueryString() {
  const params = new URLSearchParams(window.location.search);
  const rplUrl = params.get("rpl") || params.get("replay") || params.get("file");
  if (!rplUrl) {
    return;
  }

  loadReplayFromUrl(rplUrl);
}

function applyReplay(replay) {
  currentReplay = replay;
  updatePovButtonLabels();
  playbackTime = 0;

  if (replayAutoStartTimeout) {
    clearTimeout(replayAutoStartTimeout);
    replayAutoStartTimeout = null;
  }
  if (replayEndBackTimeout) {
    clearTimeout(replayEndBackTimeout);
    replayEndBackTimeout = null;
  }

  playing = false;
  playButton.textContent = "Play";
  createOrUpdateNameLabels();
  p1Index = 0;
  p2Index = 0;
  tagIndex = 0;
  player1IsMoving = false;
  player2IsMoving = false;
  player1IsCrouching = false;
  player2IsCrouching = false;
  player1IsSliding = false;
  player2IsSliding = false;
  player1IsWalking = false;
  player2IsWalking = false;
  player1StrafeDir = 0;
  player2StrafeDir = 0;
  player1AirTime = 0;
  player2AirTime = 0;
  player1HitTimer = 0;
  player2HitTimer = 0;
  useItemIndex = 0;
  setTagOwner(0);

  loadMap(replay.mapId);

  if (player1) player1.userData.replayInitialized = false;
  if (player2) player2.userData.replayInitialized = false;

  replayAutoStartTimeout = setTimeout(() => {
     playbackTime = 0;
     p1Index = 0;
     p2Index = 0;
     tagIndex = 0;
     useItemIndex = 0;

     playing = true;
     playButton.textContent = "Pause";
  }, 5000);
}

function parseReplay(buffer) {
  const dataView = new DataView(buffer);
  let offset = 0;

  function readUint8() {
    const value = dataView.getUint8(offset);
    offset += 1;
    return value;
  }

  function readInt32() {
    const value = dataView.getInt32(offset, true);
    offset += 4;
    return value;
  }

  function readUint16() {
    const value = dataView.getUint16(offset, true);
    offset += 2;
    return value;
  }

  function readFloat32() {
    const value = dataView.getFloat32(offset, true);
    offset += 4;
    return value;
  }

  if (readUint8() !== 82 || readUint8() !== 80 || readUint8() !== 76 || readUint8() !== 49) return null;
  const version = readUint8();
  if (version < 1) return null;

  const mapId = readInt32();

  offset += 8;
  offset += 8;

  const winner = readUint8();

  const p1NameLength = readUint16();
  const p1NameBytes = new Uint8Array(buffer, offset, p1NameLength);
  offset += p1NameLength;
  const p2NameLength = readUint16();
  const p2NameBytes = new Uint8Array(buffer, offset, p2NameLength);
  offset += p2NameLength;
  const decoder = new TextDecoder("utf-8");
  const p1Name = decoder.decode(p1NameBytes);
  const p2Name = decoder.decode(p2NameBytes);

  const countP1 = readInt32();
  const countP2 = readInt32();
  const countTag = readInt32();
  const countUseItem = readInt32();

  const p1Samples = [];
  const p2Samples = [];
  const tagEvents = [];
  const useItemEvents = [];

  for (let i = 0; i < countP1; i++) {
    const t = readFloat32();
    const x = readFloat32();
    const y = readFloat32();
    const z = readFloat32();
    const yaw = readFloat32();
    const pitch = readFloat32();
    p1Samples.push({ t, x, y, z, yaw, pitch });
  }

  for (let i = 0; i < countP2; i++) {
    const t = readFloat32();
    const x = readFloat32();
    const y = readFloat32();
    const z = readFloat32();
    const yaw = readFloat32();
    const pitch = readFloat32();
    p2Samples.push({ t, x, y, z, yaw, pitch });
  }

  for (let i = 0; i < countTag; i++) {
    const t = readFloat32();
    const who = readUint8();
    tagEvents.push({ t, who });
  }

  for (let i = 0; i < countUseItem; i++) {
    const t = readFloat32();
    const who = readUint8();
    useItemEvents.push({ t, who });
  }

  let duration = 0;
  if (p1Samples.length) duration = Math.max(duration, p1Samples[p1Samples.length - 1].t);
  if (p2Samples.length) duration = Math.max(duration, p2Samples[p2Samples.length - 1].t);
  if (tagEvents.length) duration = Math.max(duration, tagEvents[tagEvents.length - 1].t);
  if (useItemEvents.length) duration = Math.max(duration, useItemEvents[useItemEvents.length - 1].t);

  return { mapId, winner, p1Name, p2Name, p1Samples, p2Samples, tagEvents, useItemEvents, duration };
}

function lerpAngleDeg(a, b, t) {
  let delta = (b - a) % 360;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return a + delta * t;
}

function normalizeAngle(rad) {
  let a = rad;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function updateReplay(deltaTime) {
  if (!currentReplay || !playing) return;
  const replay = currentReplay;
  playbackTime += deltaTime;

  if (playbackTime > replay.duration) {
    playbackTime = replay.duration;
    playing = false;
    playButton.textContent = "Play";
    if (!replayEndBackTimeout) {
      replayEndBackTimeout = setTimeout(() => {
        window.history.back();
      }, 5000);
    }
  }

  updatePlayerFromSamples(player1, replay.p1Samples, true, deltaTime);
  updatePlayerFromSamples(player2, replay.p2Samples, false, deltaTime);
  updateTagFromEvents(replay.tagEvents);
  updateUseItemFromEvents(replay.useItemEvents);
}

function updatePlayerFromSamples(mesh, samples, isP1, deltaTime) {
  if (!mesh || samples.length === 0) return;

  let index = isP1 ? p1Index : p2Index;

  while (index < samples.length - 1 && samples[index + 1].t <= playbackTime) index++;

  const a = samples[index];
  const b = index < samples.length - 1 ? samples[index + 1] : null;

  let x = a.x;
  let y = a.y;
  let z = a.z;
  let yawDeg = a.yaw;
  let pitchDeg = a.pitch;

  if (b && playbackTime > a.t && b.t > a.t) {
    const segDt = b.t - a.t;
    const tNorm = segDt > 0 ? (playbackTime - a.t) / segDt : 0;

    x = a.x + (b.x - a.x) * tNorm;
    y = a.y + (b.y - a.y) * tNorm;
    z = a.z + (b.z - a.z) * tNorm;
    yawDeg = lerpAngleDeg(a.yaw, b.yaw, tNorm);
    pitchDeg = lerpAngleDeg(a.pitch, b.pitch, tNorm);
  }

  const targetPosition = new THREE.Vector3(x, y + PLAYER_Y_OFFSET, z);

  let horizontalSpeed = 0;
  let verticalSpeed = 0;
  let moveAngle = null;

  if (b && b.t > a.t) {
    let dt = b.t - a.t;
    const dxSeg = b.x - a.x;
    const dzSeg = b.z - a.z;
    const dySeg = b.y - a.y;

    const distSq = dxSeg * dxSeg + dzSeg * dzSeg;

    if (distSq > 1e-6) {
      const dist = Math.sqrt(distSq);
      if (dt < 1e-4) dt = 1e-4;

      horizontalSpeed = dist / dt;
      verticalSpeed = dySeg / dt;

      moveAngle = Math.atan2(dxSeg, dzSeg);
    }
  }

  let yawRad = 0;
  if (!Number.isNaN(yawDeg)) {
    yawRad = (yawDeg * Math.PI) / 180;
  }

  let pitchRad = 0;
  if (!Number.isNaN(pitchDeg)) {
    pitchRad = (-pitchDeg * Math.PI) / 180;
  }

  if (isP1) {
    player1AimPitch = pitchRad;
    player1Yaw = yawRad;
  } else {
    player2AimPitch = pitchRad;
    player2Yaw = yawRad;
  }

  const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yawRad, 0, "YXZ"));

  if (!mesh.userData.replayInitialized) {
    mesh.position.copy(targetPosition);
    mesh.quaternion.copy(targetQuat);
    mesh.userData.replayInitialized = true;
  } else {
    const alphaPos = 1 - Math.exp(-POS_LERP_SPEED * deltaTime);
    const alphaRot = 1 - Math.exp(-ROT_LERP_SPEED * deltaTime);
    mesh.position.lerp(targetPosition, alphaPos);
    mesh.quaternion.slerp(targetQuat, alphaRot);
  }

  const movingVertically = Math.abs(verticalSpeed) > FLOOR_VERT_SPEED_EPS;
  const isMoving = horizontalSpeed > RUN_SPEED_THRESHOLD;

  let isWalking = false;

  if (isP1) {
    if (!isMoving) {
      player1WalkState = false;
    } else {
      if (!player1WalkState) {
        if (horizontalSpeed < WALK_ENTER_SPEED) player1WalkState = true;
      } else {
        if (horizontalSpeed > WALK_EXIT_SPEED) player1WalkState = false;
      }
    }
    isWalking = player1WalkState;
  } else {
    if (!isMoving) {
      player2WalkState = false;
    } else {
      if (!player2WalkState) {
        if (horizontalSpeed < WALK_ENTER_SPEED) player2WalkState = true;
      } else {
        if (horizontalSpeed > WALK_EXIT_SPEED) player2WalkState = false;
      }
    }
    isWalking = player2WalkState;
  }

  let strafeDirInstant = 0;
  let rel = null;

  if (isMoving && moveAngle !== null) {
    rel = normalizeAngle(moveAngle - yawRad);

    if (rel > STRAFE_ENTER_ANGLE && rel < BACKWARD_ANGLE_THRESHOLD) {
      strafeDirInstant = 1;
    } else if (rel < -STRAFE_ENTER_ANGLE && rel > -BACKWARD_ANGLE_THRESHOLD) {
      strafeDirInstant = -1;
    }
  }

  let strafeDir = 0;

  if (isP1) {
    if (player1StrafeState === 0) {
      player1StrafeState = strafeDirInstant;
    } else if (player1StrafeState === 1) {
      if (!(rel !== null && rel > STRAFE_EXIT_ANGLE && rel < BACKWARD_ANGLE_THRESHOLD)) {
        player1StrafeState = 0;
      }
    } else if (player1StrafeState === -1) {
      if (!(rel !== null && rel < -STRAFE_EXIT_ANGLE && rel > -BACKWARD_ANGLE_THRESHOLD)) {
        player1StrafeState = 0;
      }
    }
    strafeDir = player1StrafeState;
  } else {
    if (player2StrafeState === 0) {
      player2StrafeState = strafeDirInstant;
    } else if (player2StrafeState === 1) {
      if (!(rel !== null && rel > STRAFE_EXIT_ANGLE && rel < BACKWARD_ANGLE_THRESHOLD)) {
        player2StrafeState = 0;
      }
    } else if (player2StrafeState === -1) {
      if (!(rel !== null && rel < -STRAFE_EXIT_ANGLE && rel > -BACKWARD_ANGLE_THRESHOLD)) {
        player2StrafeState = 0;
      }
    }
    strafeDir = player2StrafeState;
  }

  const groundInfo = playerFootOffset !== 0 ? getGroundInfoAt(targetPosition) : { hasGround: false };

  let isOnGround = false;
  let isCrouching = false;
  let isSliding = false;

  if (groundInfo.hasGround) {
    const dist = groundInfo.dist;

    if (Math.abs(dist) <= CONTACT_EPS) {
      isOnGround = true;
    }

    if (dist < -CROUCH_PEN) {
      isOnGround = true;
      isCrouching = true;
    }

    if (isOnGround || isCrouching) {
      if (isP1) player1AirTime = 0;
      else player2AirTime = 0;
    } else {
      if (movingVertically) {
        if (isP1) player1AirTime += deltaTime;
        else player2AirTime += deltaTime;
      }
    }

    if (isCrouching && horizontalSpeed > WALK_MAX_SPEED) {
      isSliding = true;
      isCrouching = false;
    }
  } else {
    if (movingVertically) {
      if (isP1) player1AirTime += deltaTime;
      else player2AirTime += deltaTime;
    }
  }

  if (isP1) {
    player1IsMoving = isMoving;
    player1IsWalking = isWalking;
    player1StrafeDir = strafeDir;
    player1IsCrouching = isCrouching;
    player1IsSliding = isSliding;
    p1Index = index;
    player1Speed = horizontalSpeed;
  } else {
    player2IsMoving = isMoving;
    player2IsWalking = isWalking;
    player2StrafeDir = strafeDir;
    player2IsCrouching = isCrouching;
    player2IsSliding = isSliding;
    p2Index = index;
    player2Speed = horizontalSpeed;
  }
}

function updateTagFromEvents(events) {
  if (!events || events.length === 0) return;

  let owner = tagOwner;

  while (tagIndex < events.length && events[tagIndex].t <= playbackTime) {
    owner = events[tagIndex].who;
    tagIndex++;
  }

  if (owner !== tagOwner) setTagOwner(owner);
}

function updateUseItemFromEvents(events) {
  if (!events || events.length === 0) return;

  while (useItemIndex < events.length && events[useItemIndex].t <= playbackTime) {
    const evt = events[useItemIndex];
    if (evt.who === 1) {
      player1HitTimer = HIT_DURATION;
    } else if (evt.who === 2) {
      player2HitTimer = HIT_DURATION;
    }
    useItemIndex++;
  }
}

function updateCameraPOV(deltaTime) {
  const eyeHeight = EYE_HEIGHT;

  if (cameraMode === "p1" && player1) {
    const targetPosition = new THREE.Vector3().copy(player1.position);
    targetPosition.y += eyeHeight;

    const euler = new THREE.Euler(player1AimPitch, player1Yaw + Math.PI, 0, "YXZ");
    const targetQuaternion = new THREE.Quaternion().setFromEuler(euler);

    if (lastCameraMode !== "p1") {
      camera.position.copy(targetPosition);
      camera.quaternion.copy(targetQuaternion);
      lastCameraMode = "p1";
      return;
    }

    const alpha = 1 - Math.exp(-CAMERA_LERP_SPEED * deltaTime);
    camera.position.lerp(targetPosition, alpha);
    camera.quaternion.slerp(targetQuaternion, alpha);
    lastCameraMode = "p1";
  } else if (cameraMode === "p2" && player2) {
    const targetPosition = new THREE.Vector3().copy(player2.position);
    targetPosition.y += eyeHeight;

    const euler = new THREE.Euler(player2AimPitch, player2Yaw + Math.PI, 0, "YXZ");
    const targetQuaternion = new THREE.Quaternion().setFromEuler(euler);

    if (lastCameraMode !== "p2") {
      camera.position.copy(targetPosition);
      camera.quaternion.copy(targetQuaternion);
      lastCameraMode = "p2";
      return;
    }

    const alpha = 1 - Math.exp(-CAMERA_LERP_SPEED * deltaTime);
    camera.position.lerp(targetPosition, alpha);
    camera.quaternion.slerp(targetQuaternion, alpha);
    lastCameraMode = "p2";
  } else if (cameraMode === "orbitP1" && player1) {
    const rawTarget = new THREE.Vector3().copy(player1.position);
    rawTarget.y += EYE_HEIGHT;

    const dir = new THREE.Vector3(
      Math.sin(orbitYaw) * Math.cos(orbitPitch),
      Math.sin(orbitPitch),
      Math.cos(orbitYaw) * Math.cos(orbitPitch)
    );

    if (lastCameraMode !== "orbitP1") {
      orbitTarget.copy(rawTarget);
      const desiredPos = new THREE.Vector3().copy(orbitTarget).addScaledVector(dir, ORBIT_DISTANCE);
      camera.position.copy(desiredPos);
      camera.lookAt(orbitTarget);
      lastCameraMode = "orbitP1";
      return;
    }

    const alphaTarget = 1 - Math.exp(-ORBIT_TARGET_LERP_SPEED * deltaTime);
    orbitTarget.lerp(rawTarget, alphaTarget);

    const desiredPos = new THREE.Vector3().copy(orbitTarget).addScaledVector(dir, ORBIT_DISTANCE);

    const alpha = 1 - Math.exp(-CAMERA_LERP_SPEED * deltaTime);
    camera.position.lerp(desiredPos, alpha);
    camera.lookAt(orbitTarget);
    lastCameraMode = "orbitP1";
  } else if (cameraMode === "orbitP2" && player2) {
    const rawTarget = new THREE.Vector3().copy(player2.position);
    rawTarget.y += EYE_HEIGHT;

    const dir = new THREE.Vector3(
      Math.sin(orbitYaw) * Math.cos(orbitPitch),
      Math.sin(orbitPitch),
      Math.cos(orbitYaw) * Math.cos(orbitPitch)
    );

    if (lastCameraMode !== "orbitP2") {
      orbitTarget.copy(rawTarget);
      const desiredPos = new THREE.Vector3().copy(orbitTarget).addScaledVector(dir, ORBIT_DISTANCE);
      camera.position.copy(desiredPos);
      camera.lookAt(orbitTarget);
      lastCameraMode = "orbitP2";
      return;
    }

    const alphaTarget = 1 - Math.exp(-ORBIT_TARGET_LERP_SPEED * deltaTime);
    orbitTarget.lerp(rawTarget, alphaTarget);

    const desiredPos = new THREE.Vector3().copy(orbitTarget).addScaledVector(dir, ORBIT_DISTANCE);

    const alpha = 1 - Math.exp(-CAMERA_LERP_SPEED * deltaTime);
    camera.position.lerp(desiredPos, alpha);
    camera.lookAt(orbitTarget);
    lastCameraMode = "orbitP2";
  }
}

function animate() {
  requestAnimationFrame(animate);

  let deltaTime = clock.getDelta();

  const MAX_FRAME_DT = 1 / 60;
  if (deltaTime > MAX_FRAME_DT) {
    deltaTime = MAX_FRAME_DT;
  }

  updateMovement(deltaTime);
  updateReplay(deltaTime);
  updateCameraPOV(deltaTime);

  updatePlayerAnimations(deltaTime);
  updateUpperBodyAim();

  if (controls && cameraMode === "free" && !pointerLocked) {
    controls.update();
  }

  updateNameLabelPositions();

  if (composer && scene && camera) {
    composer.render();
  } else if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

async function bootstrapReplayViewer() {
  const authWarning = document.getElementById("auth-warning");
  const viewer = document.getElementById("viewer");

  try {
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      if (authWarning) {
        authWarning.classList.add("visible");
        authWarning.innerHTML = `
          <span>🔒 You need an account to watch replays.</span>
          <button id="auth-login-btn" type="button">Sign in with Discord</button>
        `;
      }
      if (viewer) {
        viewer.classList.add("viewer-disabled");
      }

      const loginBtn = document.getElementById("auth-login-btn");
      if (loginBtn) {
        loginBtn.addEventListener("click", () => {
          supabaseClient.auth.signInWithOAuth({
            provider: "discord",
            options: { redirectTo: window.location.href },
          });
        });
      }
      return;
    }
  } catch (err) {
    if (authWarning) {
      authWarning.classList.add("visible");
      authWarning.textContent = "Error while checking login. Please refresh the page.";
    }
    if (viewer) {
      viewer.classList.add("viewer-disabled");
    }
    return;
  }

  init();
}

bootstrapReplayViewer();
