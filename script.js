import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { setupPartCustomizer } from './part-customizer.js';
import { setupInteractionControls } from './interaction-controls.js';

const container = document.getElementById('app');

const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 100);
const defaultCameraPosition = new THREE.Vector3(5.4, 3.35, 8.6);
const defaultCameraTarget = new THREE.Vector3(0, 0.25, 0);
const frontCameraPosition = new THREE.Vector3(0, 0.8, 8.5);
const frontCameraTarget = new THREE.Vector3(0, 0, 0);
camera.position.copy(defaultCameraPosition);
camera.lookAt(defaultCameraTarget);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.7;
renderer.localClippingEnabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const reflectionRandom = (seed) => {
    const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return value - Math.floor(value);
};

const environmentGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = environmentGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
environmentGenerator.dispose();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.copy(defaultCameraTarget);
controls.minDistance = 5.2;
controls.maxDistance = 15;
controls.maxPolarAngle = Math.PI * 0.82;
controls.saveState();
renderer.domElement.style.touchAction = 'none';

// ---------- Lighting ----------
const hemisphere = new THREE.HemisphereLight(0xffffff, 0x9ba6b6, 0.7);
scene.add(hemisphere);

const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(4, 7, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
scene.add(key);

const rim = new THREE.PointLight(0xcce8ff, 0.45, 20);
rim.position.set(-4, 5, -2);
scene.add(rim);

const warm = new THREE.PointLight(0xffdcc5, 0.4, 14);
warm.position.set(3, 1, 3);
scene.add(warm);

// ---------- Materials ----------
const whiteMat = new THREE.MeshPhysicalMaterial({
    color: 0xf5f6f8,
    roughness: 0.32,
    metalness: 0.08,
    clearcoat: 0.35,
    clearcoatRoughness: 0.18
});

const darkMat = new THREE.MeshStandardMaterial({
    color: 0x24262c,
    roughness: 0.28,
    metalness: 0.65
});

const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xcbd3de,
    transparent: true,
    opacity: 0.24,
    roughness: 0.2,
    ior: 1.45,
    side: THREE.FrontSide,
    depthWrite: false
});
glassMat.envMapIntensity = 0.12;

const creamMat = new THREE.MeshStandardMaterial({
    color: 0xffe9ad,
    roughness: 0.65,
    metalness: 0.0
});

const crystalMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    transmission: 0.12,
    roughness: 0.08,
    metalness: 0,
    emissive: 0xffffff,
    emissiveIntensity: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    ior: 2.4,
    reflectivity: 1
});

const glowCanvas = document.createElement('canvas');
glowCanvas.width = 128;
glowCanvas.height = 128;
const glowContext = glowCanvas.getContext('2d');
if (!glowContext) throw new Error('보석 후광 텍스처를 만들 수 없습니다.');
const glowGradient = glowContext.createRadialGradient(64, 64, 0, 64, 64, 64);
glowGradient.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
glowGradient.addColorStop(0.32, 'rgba(255, 255, 255, 0.42)');
glowGradient.addColorStop(0.65, 'rgba(255, 255, 255, 0.2)');
glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
glowContext.fillStyle = glowGradient;
glowContext.fillRect(0, 0, 128, 128);
const crystalAuraMat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(glowCanvas),
    color: 0xaebfff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});
const reflections = Array.from({ length: 42 }, (_, index) => {
    const azimuth = reflectionRandom(index + 1) * Math.PI * 2;
    const vertical = reflectionRandom(index + 91) * 2 - 1;
    const horizontal = Math.sqrt(1 - vertical * vertical);
    const radius = 4.2 + reflectionRandom(index + 181) * 5.8;
    const reflection = new THREE.Sprite(new THREE.SpriteMaterial({
    map: crystalAuraMat.map,
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
    }));
    const size = 0.12 + reflectionRandom(index + 541) * 0.22;
    reflection.scale.set(size, size, 1);
    reflection.userData.baseSize = size;
    reflection.position.set(
    Math.cos(azimuth) * horizontal * radius,
    1.7 + vertical * radius * 0.9,
    Math.sin(azimuth) * horizontal * radius
    );
    reflection.userData.phase = reflectionRandom(index + 361) * Math.PI * 2;
    reflection.userData.baseOpacity = 0.55 + reflectionRandom(index + 451) * 0.45;
    scene.add(reflection);
    return reflection;
});

// ---------- Helpers ----------
function mesh(geometry, material, {x=0,y=0,z=0, rx=0,ry=0,rz=0, sx=1,sy=1,sz=1}={}) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x,y,z);
    m.rotation.set(rx,ry,rz);
    m.scale.set(sx,sy,sz);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
}

function torus(r, tube, y, scaleY=1, mat=whiteMat) {
    const t = mesh(new THREE.TorusGeometry(r, tube, 18, 64), mat, {y, rx: Math.PI/2});
    t.scale.y = scaleY;
    return t;
}

// ---------- Root ----------
const lightstick = new THREE.Group();
lightstick.position.y = -1.0;
scene.add(lightstick);

// ---------- Handle / Base ----------
const handle = new THREE.Group();
lightstick.add(handle);

// Main lower grip
handle.add(mesh(new THREE.CylinderGeometry(0.53, 0.42, 2.35, 64), whiteMat, {y:-1.88}));

// slight upper neck
handle.add(mesh(new THREE.CylinderGeometry(0.40, 0.48, 0.30, 64), whiteMat, {y:-0.61}));

// base rim
handle.add(mesh(new THREE.CylinderGeometry(0.68, 0.58, 0.38, 64), whiteMat, {y:-2.98}));
handle.add(torus(0.56, 0.055, -2.86));
handle.add(torus(0.49, 0.035, -1.0));

// Button bezel + button
const bezel = mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.07, 40), whiteMat, {y:-2.15, z:0.49, rx:Math.PI/2});
handle.add(bezel);

const buttonMat = new THREE.MeshPhysicalMaterial({
    color: 0xf4f6f8,
    roughness: 0.22,
    metalness: 0.05,
    clearcoat: 0.8
});
const button = mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.08, 40), buttonMat, {y:-2.15, z:0.535, rx:Math.PI/2});
button.name = 'button';
handle.add(button);

// ---------- Middle transparent chamber ----------
const chamber = new THREE.Group();
lightstick.add(chamber);

// transparent tube
const chamberGlassMat = glassMat.clone();
chamberGlassMat.envMapIntensity = 0;
chamberGlassMat.reflectivity = 0;
chamberGlassMat.roughness = 1;
const chamberGlass = mesh(new THREE.CylinderGeometry(0.47,0.47,2.1,64,1,true), chamberGlassMat, {y:0.48});
chamber.add(chamberGlass);

// top and bottom trim
chamber.add(mesh(new THREE.CylinderGeometry(0.53,0.53,0.15,64), whiteMat, {y:-0.61}));
chamber.add(mesh(new THREE.CylinderGeometry(0.54,0.54,0.15,64), whiteMat, {y:1.57}));

const partSpindleMat = new THREE.MeshStandardMaterial({
    color: 0x858b95,
    roughness: 0.28,
    metalness: 0.72
});
const partSpindle = mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.16, 24), partSpindleMat, {y:0.49});
chamber.add(partSpindle);

// ---------- Custom part slots ----------
const { selectedPartFiles, chaColorCombination, updateSpecialEffects } = setupPartCustomizer({ chamber, partSpindle, mesh });

// ---------- Upper head base ----------
const headGroup = new THREE.Group();
headGroup.position.y = 1.92;
lightstick.add(headGroup);

headGroup.add(mesh(new THREE.CylinderGeometry(0.58,0.48,0.22,64), whiteMat, {y:-0.36}));
headGroup.add(torus(0.54,0.055,-0.22));

// ---------- Crystal ----------
function createBrilliantCutGeometry() {
    const sides = 8;
    const table = [];
    const crown = [];
    const girdle = [];
    const culet = new THREE.Vector3(0, -0.32, 0);
    for (let index = 0; index < sides; index += 1) {
    const angle = (index / sides) * Math.PI * 2 + Math.PI / sides;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    table.push(new THREE.Vector3(cosine * 0.18, 0.29, sine * 0.18));
    crown.push(new THREE.Vector3(cosine * 0.31, 0.18, sine * 0.31));
    girdle.push(new THREE.Vector3(cosine * 0.44, 0.04, sine * 0.44));
    }

    const vertices = [];
    const colors = [];
    const addFace = (a, b, c, shade) => {
    const normal = new THREE.Vector3()
        .subVectors(b, a)
        .cross(new THREE.Vector3().subVectors(c, a));
    const center = new THREE.Vector3().add(a).add(b).add(c);
    if (normal.dot(center) < 0) [b, c] = [c, b];
    for (const point of [a, b, c]) {
        vertices.push(point.x, point.y, point.z);
        colors.push(shade, shade, shade);
    }
    };

    const center = new THREE.Vector3(0, 0.29, 0);
    for (let index = 0; index < sides; index += 1) {
    const next = (index + 1) % sides;
    const shade = [0.78, 1, 0.9, 0.84, 0.96, 0.74][index % 6];
    addFace(center, table[index], table[next], 1);
    addFace(table[index], crown[index], crown[next], shade);
    addFace(table[index], crown[next], table[next], shade);
    addFace(crown[index], girdle[index], girdle[next], shade);
    addFace(crown[index], girdle[next], crown[next], shade);
    addFace(girdle[index], culet, girdle[next], shade);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
}

const crystal = mesh(createBrilliantCutGeometry(), crystalMat, {y:0.33, sx:1.35, sy:1.6, sz:1.35});
crystal.rotation.y = Math.PI/4;
headGroup.add(crystal);

crystal.geometry.computeBoundingBox();
const crystalCenter = crystal.geometry.boundingBox.getCenter(new THREE.Vector3())
    .multiply(crystal.scale)
    .applyEuler(crystal.rotation)
    .add(crystal.position);

const crystalLight = new THREE.PointLight(0xdde8ff, 0, 6, 2);
crystalLight.position.copy(crystalCenter);
headGroup.add(crystalLight);

const crystalAura = new THREE.Sprite(crystalAuraMat);
crystalAura.position.copy(crystalCenter).add(new THREE.Vector3(0, 0, 0.03));
crystalAura.scale.set(4.2, 4.2, 1);
headGroup.add(crystalAura);

// ---------- Dark cage ----------
function createCageStrut(angle) {
    const radius = 0.72;
    const zOff = 0.0;

    const pts = [
    new THREE.Vector3(0.42, -0.18, zOff),
    new THREE.Vector3(0.62,  0.02, zOff),
    new THREE.Vector3(0.64,  0.48, zOff),
    new THREE.Vector3(0.50,  1.16, zOff)
    ];

    const curve = new THREE.CatmullRomCurve3(pts);
    const strut = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 40, 0.055, 10, false),
    darkMat
    );
    strut.rotation.y = angle;
    strut.castShadow = true;
    return strut;
}

headGroup.add(createCageStrut(0));
headGroup.add(createCageStrut(Math.PI));
headGroup.add(createCageStrut(Math.PI/2));
headGroup.add(createCageStrut(-Math.PI/2));

// top and bottom cage bars
headGroup.add(mesh(new THREE.CylinderGeometry(0.69,0.69,0.09,64), darkMat, {y:1.18}));
headGroup.add(mesh(new THREE.CylinderGeometry(0.63,0.63,0.09,64), darkMat, {y:-0.12}));

// center vertical bar, like reference silhouette
headGroup.add(mesh(new THREE.CylinderGeometry(0.04,0.04,1.35,16), darkMat, {y:0.48}));

// tiny top cap
headGroup.add(mesh(new THREE.SphereGeometry(0.11,24,18), darkMat, {y:1.37}));
headGroup.add(mesh(new THREE.CylinderGeometry(0.055,0.055,0.18,12), darkMat, {y:1.31}));

// ---------- Outer glass dome ----------
// Lathe profile produces a lantern-like rounded dome
const domeProfile = [
    new THREE.Vector2(0.43, -0.30),
    new THREE.Vector2(0.60, -0.08),
    new THREE.Vector2(0.77,  0.38),
    new THREE.Vector2(0.75,  0.90),
    new THREE.Vector2(0.64,  1.42),
    new THREE.Vector2(0.46,  1.72),
    new THREE.Vector2(0.27,  1.82),
    new THREE.Vector2(0.00,  1.82)
];
const dome = mesh(new THREE.LatheGeometry(domeProfile, 72), glassMat, {y:-0.10});
dome.scale.set(1.14, 1.00, 1.08);
headGroup.add(dome);

setupInteractionControls({
    scene, renderer, camera, controls,
    defaultCameraPosition, defaultCameraTarget,
    frontCameraPosition, frontCameraTarget,
    lightstick, crystalMat, crystalAuraMat, crystalLight, crystalAura, reflections,
    hemisphere, key, rim, warm, button,
    selectedPartFiles, chaColorCombination, updateSpecialEffects
});