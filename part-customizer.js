import * as THREE from "three";

export function setupPartCustomizer({ chamber, partSpindle, mesh }) {
    const partOptions = [
        { label: '사과', value: 'parts/apple.html' },
        { label: '선아현', value: 'parts/ahyeon.html' },
        { label: '배세진', value: 'parts/bea.html' },
        { label: '차유진', value: 'parts/cha.html' },
        { label: '김래빈', value: 'parts/kim.html' },
        { label: '박문대', value: 'parts/moon.html' },
        { label: '류청우', value: 'parts/ryu.html' },
        { label: '이세진', value: 'parts/sejin.html' },
        { label: '하트', value: 'parts/heart.html' }
    ];
    
    function applyPartEdits(model, edits = {}) {
        for (const child of model.children) {
        const edit = edits[child.name];
        if (!edit) continue;
        const position = edit.position || [0, 0, 0];
        const rotation = edit.rotation || [0, 0, 0];
        const axisScale = edit.axisScale || [1, 1, 1];
        child.position.add(new THREE.Vector3(...position));
        child.rotation.x += THREE.MathUtils.degToRad(rotation[0] || 0);
        child.rotation.y += THREE.MathUtils.degToRad(rotation[1] || 0);
        child.rotation.z += THREE.MathUtils.degToRad(rotation[2] || 0);
        child.scale.multiplyScalar(edit.size ?? 1);
        child.scale.multiply(new THREE.Vector3(...axisScale));
        child.visible = edit.visible !== false;
        if (edit.color) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material) => material.color?.set(edit.color));
        }
        }
    }
    
    function applyFeatherClipping(model, clipping, enabled) {
        if (!clipping) return;
        for (const child of model.children) {
        if (!child.name.startsWith('깃털')) continue;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
            const state = material.userData.cylinderClip ||= {
            enabled,
            radius: clipping.cylinderRadius,
            rootInverse: new THREE.Matrix4(),
            shader: null
            };
            state.enabled = enabled;
            state.radius = clipping.cylinderRadius;
            if (!state.shader) {
            material.onBeforeCompile = (shader) => {
                shader.uniforms.uCylinderRootInverse = { value: state.rootInverse };
                shader.uniforms.uCylinderClipEnabled = { value: state.enabled };
                shader.uniforms.uCylinderClipRadius = { value: state.radius };
                shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nuniform mat4 uCylinderRootInverse;\nvarying vec3 vCylinderLocalPosition;')
                .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCylinderLocalPosition = (uCylinderRootInverse * modelMatrix * vec4(transformed, 1.0)).xyz;');
                shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', '#include <common>\nuniform bool uCylinderClipEnabled;\nuniform float uCylinderClipRadius;\nvarying vec3 vCylinderLocalPosition;')
                .replace('#include <opaque_fragment>', 'if (uCylinderClipEnabled && dot(vCylinderLocalPosition.xz, vCylinderLocalPosition.xz) > uCylinderClipRadius * uCylinderClipRadius) discard;\n#include <opaque_fragment>');
                state.shader = shader;
            };
            material.customProgramCacheKey = () => 'cylinder-edge-clip';
            material.needsUpdate = true;
            }
            if (state.shader) {
            state.shader.uniforms.uCylinderClipEnabled.value = enabled;
            state.shader.uniforms.uCylinderClipRadius.value = clipping.cylinderRadius;
            }
        });
        child.onBeforeRender = () => {
            model.updateWorldMatrix(true, false);
            const rootInverse = model.matrixWorld.clone().invert();
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material) => {
            const state = material.userData.cylinderClip;
            if (state) state.rootInverse.copy(rootInverse);
            });
        };
        }
    }
    
    const slotConfigs = [
        { id: 'top', label: '상단', defaultFile: 'parts/apple.html', y: 0.87, scale: 0.7 },
        { id: 'middle', label: '중간', defaultFile: 'parts/moon.html', y: 0.28, scale: 0.7 },
        { id: 'bottom', label: '하단', defaultFile: 'parts/apple.html', y: -0.35, scale: 0.7 }
    ];
    const ribbonColors = new Map([
        ['ahyeon.html', 0xa777e8],
        ['bea.html', 0x3987ff],
        ['moon.html', 0xff72ad]
    ]);
    const selectedPartFiles = new Map(slotConfigs.map((config) => [config.id, config.defaultFile]));
    let foreheadMarkCombinationKey = null;
    let foreheadMarkTriggered = false;
    const loadedPartModels = new Map();
    const heartColors = new Map(slotConfigs.map((config) => [config.id, '#ff80a2']));
    const ribbonCombination = [...ribbonColors.keys()];
    const chaColorCombination = ['cha.html', 'kim.html', 'ryu.html'];
    let chaTransformationEnabled = true;
    let ribbonTransformationEnabled = true;
    const chaCombinationColors = new Map([
        ['머리', 0x383b40],
        ['왼쪽 귀', 0x383b40],
        ['오른쪽 귀', 0x383b40],
        ['무늬 왼쪽', 0x383b40],
        ['무늬 가운데', 0x383b40],
        ['무늬 오른쪽', 0x383b40],
        ['왼쪽 눈', 0xf2cf45],
        ['오른쪽 눈', 0xf2cf45],
        ['왼쪽 눈썹', 0xf2cf45],
        ['오른쪽 눈썹', 0xf2cf45]
    ]);
    
    function updateChaCombinationColors(model, enabled) {
        chaCombinationColors.forEach((color, name) => {
        const component = model.getObjectByName(name);
        if (!component) return;
        component.traverse((object) => {
            if (!object.isMesh) return;
            if (!object.userData.combinationBaseMaterials) {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            object.userData.combinationMaterialArray = Array.isArray(object.material);
            object.userData.combinationBaseMaterials = materials;
            object.userData.combinationOverrideMaterials = materials.map((material) => material.clone());
            }
            const materials = enabled
            ? object.userData.combinationOverrideMaterials
            : object.userData.combinationBaseMaterials;
            if (enabled) materials.forEach((material) => material.color.set(color));
            object.material = object.userData.combinationMaterialArray ? materials : materials[0];
        });
        });
    }
    
    function updateKimCombinationColors(model, enabled) {
        ['머리', '왼쪽 귀', '오른쪽 귀'].forEach((name) => {
        const component = model.getObjectByName(name);
        if (!component) return;
        component.traverse((object) => {
            if (!object.isMesh) return;
            if (!object.userData.specialComboBaseMaterials) {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            object.userData.specialComboMaterialArray = Array.isArray(object.material);
            object.userData.specialComboBaseMaterials = materials;
            object.userData.specialComboWhiteMaterials = materials.map((material) => {
                const whiteMaterial = material.clone();
                whiteMaterial.color.set(0xffffff);
                return whiteMaterial;
            });
            }
            const materials = enabled
            ? object.userData.specialComboWhiteMaterials
            : object.userData.specialComboBaseMaterials;
            object.material = object.userData.specialComboMaterialArray ? materials : materials[0];
        });
        });
    }
    
    function createForeheadAngerMark(head) {
        const mark = new THREE.Group();
        const material = new THREE.MeshBasicMaterial({
        color: 0xe5222a,
        side: THREE.DoubleSide,
        depthWrite: false
        });
    
        // 중앙을 향한 네 개의 꼭짓점과 삼각형처럼 파인 안쪽 공간을 가진 각진 빠직 마크.
        // 위쪽 팔 하나를 만든 뒤 90도씩 회전해 네 방향으로 배치한다.
        const branchShape = new THREE.Shape();
        branchShape.moveTo(-0.43, 0.92);   // 왼쪽 바깥 끝
        branchShape.lineTo(-0.32, 0.86);
        branchShape.lineTo(-0.20, 0.63);
        branchShape.lineTo(-0.10, 0.44);
        branchShape.lineTo(0.00, 0.31);    // 바깥쪽 V의 꼭짓점
        branchShape.lineTo(0.10, 0.44);
        branchShape.lineTo(0.20, 0.63);
        branchShape.lineTo(0.32, 0.86);
        branchShape.lineTo(0.43, 0.92);   // 오른쪽 바깥 끝
        branchShape.lineTo(0.50, 0.79);
        branchShape.lineTo(0.41, 0.56);
        branchShape.lineTo(0.29, 0.36);
        branchShape.lineTo(0.18, 0.27);
        branchShape.lineTo(0.00, 0.17);   // 중앙 빈 공간을 넓히도록 안쪽 꼭짓점 이동
        branchShape.lineTo(-0.18, 0.27);
        branchShape.lineTo(-0.29, 0.36);
        branchShape.lineTo(-0.41, 0.56);
        branchShape.lineTo(-0.50, 0.79);
        branchShape.closePath();
    
        for (let index = 0; index < 4; index += 1) {
        const branch = new THREE.Mesh(new THREE.ShapeGeometry(branchShape), material);
        branch.rotation.z = index * Math.PI / 2;
        mark.add(branch);
        }
    
        mark.name = '빠직 마크';
        // 보는 사람 기준 오른쪽 위 이마에 더 작게 배치하고, 면을 위쪽 하늘 방향으로 45도 기울인다.
        mark.position.set(0.7, 0.58, 0.7);
        mark.scale.setScalar(0.28);
        mark.rotation.x = -Math.PI / 7;
        mark.visible = false;
        head.add(mark);
        return mark;
    }
    
    function applyHeartColor(model, color) {
        const heart = model.getObjectByName('하트');
        if (!heart) return;
        heart.traverse((object) => {
        if (!object.isMesh) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.color?.set(color));
        });
    }
    
    function createForeheadRibbon(head, color) {
        const ribbon = new THREE.Group();
        const ribbonMaterial = new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.28,
        metalness: 0.04,
        clearcoat: 0.8,
        clearcoatRoughness: 0.18,
        side: THREE.DoubleSide
        });
        const loopShape = new THREE.Shape();
        loopShape.moveTo(0, 0);
        loopShape.quadraticCurveTo(-0.05, 0.19, -0.29, 0.22);
        loopShape.quadraticCurveTo(-0.43, 0.16, -0.37, 0);
        loopShape.quadraticCurveTo(-0.43, -0.16, -0.29, -0.22);
        loopShape.quadraticCurveTo(-0.05, -0.19, 0, 0);
        const loopGeometry = new THREE.ExtrudeGeometry(loopShape, {
        depth: 0.055,
        bevelEnabled: true,
        bevelSegments: 5,
        bevelSize: 0.03,
        bevelThickness: 0.04,
        steps: 1,
        curveSegments: 12
        });
        const loopPositions = loopGeometry.attributes.position;
        for (let index = 0; index < loopPositions.count; index += 1) {
        const x = loopPositions.getX(index);
        const y = loopPositions.getY(index);
        const domeRadius = ((x + 0.215) / 0.32) ** 2 + (y / 0.27) ** 2;
        const dome = Math.pow(Math.max(0, 1 - domeRadius), 1.5);
        loopPositions.setZ(index, loopPositions.getZ(index) + 0.18 * dome);
        }
        loopGeometry.computeVertexNormals();
        const leftLoop = new THREE.Mesh(loopGeometry, ribbonMaterial);
        leftLoop.position.z = -0.045;
        ribbon.add(leftLoop);
    
        const rightLoop = new THREE.Mesh(loopGeometry, ribbonMaterial);
        rightLoop.position.z = -0.045;
        rightLoop.scale.x = -1;
        ribbon.add(rightLoop);
    
        const knot = new THREE.Mesh(new THREE.SphereGeometry(0.065, 14, 10), ribbonMaterial);
        knot.position.z = 0.045;
        knot.scale.set(1.05, 1.1, 0.85);
        ribbon.add(knot);
        ribbon.scale.setScalar(1.45);
        ribbon.position.set(0, 0.7, 0.64);
        ribbon.rotation.x = -Math.PI / 4;
        ribbon.visible = false;
        head.add(ribbon);
        return ribbon;
    }
    
    function updateCombinationRibbons() {
        const selectedFiles = [...selectedPartFiles.values()].map((file) => file.split('/').pop());
        const hasRibbonCombination = selectedFiles.length === ribbonCombination.length
        && ribbonCombination.every((file) => selectedFiles.includes(file));
        const hasChaColorCombination = selectedFiles.length === chaColorCombination.length
        && chaColorCombination.every((file) => selectedFiles.includes(file));
        // 이세진과 배세진이 서로 이웃한 슬롯(상단-중간 또는 중간-하단)에 있을 때만 마크 표시
        const selectedFileAt = (slotId) => (selectedPartFiles.get(slotId) || '').split('/').pop();
        const isSejinPair = (first, second) =>
        (first === 'sejin.html' && second === 'bea.html') ||
        (first === 'bea.html' && second === 'sejin.html');
        const hasForeheadMarkCombination =
        isSejinPair(selectedFileAt('top'), selectedFileAt('middle')) ||
        isSejinPair(selectedFileAt('middle'), selectedFileAt('bottom'));
        const combinationKey = hasForeheadMarkCombination
        ? ['top', 'middle', 'bottom'].map(selectedFileAt).join('|')
        : null;
        if (combinationKey !== foreheadMarkCombinationKey) {
        foreheadMarkCombinationKey = combinationKey;
        foreheadMarkTriggered = hasForeheadMarkCombination && Math.random() < 0.5;
        }
        if (!hasRibbonCombination) ribbonTransformationEnabled = true;
        if (!hasChaColorCombination) chaTransformationEnabled = true;
        const isRibbonTransformationActive = hasRibbonCombination && ribbonTransformationEnabled;
        const isChaTransformationActive = hasChaColorCombination && chaTransformationEnabled;
        const isTransformationAvailable = hasRibbonCombination || hasChaColorCombination;
        const isTransformationEnabled = hasRibbonCombination
        ? ribbonTransformationEnabled
        : hasChaColorCombination && chaTransformationEnabled;
        combinationTransformationToggle.hidden = !isTransformationAvailable;
        combinationTransformationToggle.setAttribute('aria-pressed', String(isTransformationEnabled));
        combinationTransformationToggle.textContent = `변신 ${isTransformationEnabled ? 'ON' : 'OFF'}`;
        loadedPartModels.forEach(({ file, ribbon, model, foreheadMark }) => {
        if (ribbon) ribbon.visible = isRibbonTransformationActive && ribbonCombination.includes(file);
        if (file === 'cha.html') updateChaCombinationColors(model, isChaTransformationActive);
        if (file === 'kim.html') updateKimCombinationColors(model, isChaTransformationActive);
        if (foreheadMark) foreheadMark.visible = hasForeheadMarkCombination && foreheadMarkTriggered;
        });
    }
    
    const partPanel = document.getElementById('partPanel');
    const partPanelToggle = document.getElementById('partPanelToggle');
    const partPanelContent = document.getElementById('partPanelContent');
    const spindleToggle = document.getElementById('spindleToggle');
    const combinationTransformationToggle = document.getElementById('combinationTransformationToggle');
    
    combinationTransformationToggle.addEventListener('click', () => {
        const selectedFiles = [...selectedPartFiles.values()].map((file) => file.split('/').pop());
        if (ribbonCombination.every((file) => selectedFiles.includes(file))) {
        ribbonTransformationEnabled = !ribbonTransformationEnabled;
        }
        if (chaColorCombination.every((file) => selectedFiles.includes(file))) {
        chaTransformationEnabled = !chaTransformationEnabled;
        }
        updateCombinationRibbons();
    });
    
    spindleToggle.addEventListener('change', () => {
        partSpindle.visible = spindleToggle.checked;
    });
    
    partPanelToggle.addEventListener('click', () => {
        const isExpanded = partPanelToggle.getAttribute('aria-expanded') === 'true';
        partPanel.classList.toggle('collapsed', isExpanded);
        partPanelContent.hidden = isExpanded;
        partPanelToggle.setAttribute('aria-expanded', String(!isExpanded));
        partPanelToggle.textContent = isExpanded ? '펼치기' : '접기';
    });
    
    slotConfigs.forEach((config) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'part-slot';
    
        const header = document.createElement('div');
        header.className = 'part-slot-header';
        const slotLabel = document.createElement('span');
        slotLabel.textContent = config.label;
        header.appendChild(slotLabel);
    
        const select = document.createElement('select');
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '선택 안 함';
        select.appendChild(emptyOption);
        partOptions.forEach((item) => {
        const option = document.createElement('option');
        option.value = item.value;
        option.textContent = item.label;
        select.appendChild(option);
        });
        select.value = config.defaultFile;
        header.appendChild(select);
    
        const heartColorLabel = document.createElement('label');
        heartColorLabel.className = 'heart-color-control';
        heartColorLabel.textContent = '하트 색상';
        heartColorLabel.hidden = select.value !== 'parts/heart.html';
        const heartColorInput = document.createElement('input');
        heartColorInput.type = 'color';
        heartColorInput.value = heartColors.get(config.id);
        heartColorInput.setAttribute('aria-label', `${config.label} 하트 색상`);
        heartColorLabel.appendChild(heartColorInput);
    
        const positionRange = document.createElement('input');
        positionRange.type = 'range';
        positionRange.min = '-1.5';
        positionRange.max = '1.5';
        positionRange.step = '0.01';
        positionRange.value = '0';
        positionRange.setAttribute('aria-label', `${config.label} 파트 세로 위치`);
    
        const positionLabel = document.createElement('label');
        positionLabel.className = 'part-control-label';
        positionLabel.textContent = '위치';
        positionLabel.appendChild(positionRange);
    
        const iframe = document.createElement('iframe');
        iframe.title = `${config.label} 파트`;
        iframe.hidden = true;
        wrapper.appendChild(header);
        wrapper.appendChild(heartColorLabel);
        wrapper.appendChild(positionLabel);
        wrapper.appendChild(iframe);
        partPanelContent.appendChild(wrapper);
    
        const group = new THREE.Group();
        group.position.set(0, config.y, 0);
        chamber.add(group);
        let inSceneMesh = null;
        const removeCurrentMesh = () => {
        loadedPartModels.delete(config.id);
        if (!inSceneMesh) return;
        group.remove(inSceneMesh);
        inSceneMesh.traverse((object) => {
            object.geometry?.dispose?.();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            const overrideMaterials = [
            ...(object.userData.combinationOverrideMaterials || []),
            ...(object.userData.specialComboWhiteMaterials || [])
            ];
            new Set([...materials, ...overrideMaterials]).forEach((material) => material?.dispose?.());
        });
        inSceneMesh = null;
        };
        const receivePartModel = (event) => {
        const currentFile = new URL(iframe.src).pathname.split('/').pop();
        if (event.source !== iframe.contentWindow || event.data?.type !== 'lightstick-part' || event.data.file !== currentFile) return;
        removeCurrentMesh();
        try {
            const model = new THREE.ObjectLoader().parse(event.data.object);
            applyPartEdits(model, event.data.edits);
            model.position.y = 0.18;
            model.scale.setScalar(config.scale * 0.4);
            model.traverse((object) => {
            if (object.isMesh) {
                object.castShadow = true;
                object.receiveShadow = true;
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                const visibleMaterials = materials.map((material) => {
                if (!material) return material;
                if ('roughness' in material) material.roughness = 0.16;
                if (material.isMeshPhysicalMaterial) {
                    material.clearcoat = 1;
                    material.clearcoatRoughness = 0.08;
                    material.transmission = 0;
                }
                material.transparent = false;
                material.opacity = 1;
                return material;
                });
                object.material = Array.isArray(object.material) ? visibleMaterials : visibleMaterials[0];
            }
            });
            applyFeatherClipping(model, event.data.clipping, event.data.edits?.__settings?.clipFeathers === true);
            if (currentFile === 'heart.html') applyHeartColor(model, heartColors.get(config.id));
            const ribbonColor = ribbonColors.get(currentFile);
            const head = model.getObjectByName('머리');
            const ribbon = ribbonColor && head ? createForeheadRibbon(head, ribbonColor) : null;
            const foreheadMark = ['sejin.html', 'bea.html'].includes(currentFile) && head
            ? createForeheadAngerMark(head)
            : null;
    
    group.add(model);
    inSceneMesh = model;
    
    loadedPartModels.set(config.id, {
    file: currentFile,
    ribbon,
    model,
    foreheadMark
    });
    
    updateCombinationRibbons();
    
        } catch (error) {
            console.error(`파트 모델을 불러오지 못했습니다: ${config.label}`, error);
        }
        };
        window.addEventListener('message', receivePartModel);
    
        select.addEventListener('change', () => {
        removeCurrentMesh();
        selectedPartFiles.set(config.id, select.value);
        heartColorLabel.hidden = select.value !== 'parts/heart.html';
        updateCombinationRibbons();
        if (!select.value) {
            iframe.src = 'about:blank';
            return;
        }
        iframe.src = select.value;
        });
    
        heartColorInput.addEventListener('input', () => {
        const color = heartColorInput.value;
        heartColors.set(config.id, color);
        const loadedPart = loadedPartModels.get(config.id);
        if (loadedPart?.file === 'heart.html') applyHeartColor(loadedPart.model, color);
        });
    
        positionRange.addEventListener('input', () => {
        group.position.y = config.y + Number(positionRange.value);
        });
    
        iframe.src = config.defaultFile;
    });

    let paperGlowTexture = null;
    let paperPlaneFleet = null;
    const orbitRandom = (seed) => {
        const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
        return value - Math.floor(value);
    };

    function createPaperPlane(scale) {
        const shape = new THREE.Shape();
        shape.moveTo(0.24, 0.02);
        shape.lineTo(-0.18, 0.15);
        shape.lineTo(-0.06, 0.01);
        shape.lineTo(-0.18, -0.14);
        shape.closePath();

        const plane = new THREE.Group();
        const paper = new THREE.Mesh(
            new THREE.ShapeGeometry(shape),
            new THREE.MeshBasicMaterial({ color: 0xf5f7ff, side: THREE.DoubleSide })
        );
        const crease = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-0.06, 0.01, 0.01),
            new THREE.Vector3(0.2, 0.02, 0.01)
        ]);
        const paperSurface = new THREE.Group();
        paperSurface.rotation.x = -Math.PI / 2 + 0.4;
        paperSurface.add(paper);
        paperSurface.add(new THREE.Line(crease, new THREE.LineBasicMaterial({ color: 0x8290a8 })));
        plane.add(paperSurface);
        plane.scale.setScalar(scale);
        return plane;
    }

    function createPaperPlaneFleet() {
        const fleet = new THREE.Group();
        if (!paperGlowTexture) {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const context = canvas.getContext('2d');
            const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
            gradient.addColorStop(0, 'rgba(145, 220, 255, 1)');
            gradient.addColorStop(0.25, 'rgba(115, 205, 255, 0.58)');
            gradient.addColorStop(1, 'rgba(90, 185, 255, 0)');
            context.fillStyle = gradient;
            context.fillRect(0, 0, 64, 64);
            paperGlowTexture = new THREE.CanvasTexture(canvas);
        }
        fleet.userData.planes = Array.from({ length: 20 }, (_, index) => {
            const plane = createPaperPlane(0.67);
            const glowMaterial = new THREE.SpriteMaterial({
                map: paperGlowTexture,
                color: 0x91dcff,
                transparent: true,
                opacity: 0.7,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const glow = new THREE.Sprite(glowMaterial);
            glow.scale.set(0.24, 0.24, 1);
            glow.position.z = -0.04;
            plane.add(glow);
            plane.visible = true;
            plane.userData.orbit = {
                angle: (index / 20) * Math.PI * 2 + (orbitRandom(index + 21) - 0.5) * 0.42,
                radius: 2.4 + orbitRandom(index + 1) * 2.2,
                speed: 0.14 + orbitRandom(index + 41) * 0.18,
                height: (orbitRandom(index + 61) - 0.5) * 2.4,
                bobAmplitude: 0.2 + orbitRandom(index + 81) * 0.4,
                bobSpeed: 0.35 + orbitRandom(index + 101) * 0.45,
                pitch: (orbitRandom(index + 281) - 0.5) * 1.4,
                bank: (orbitRandom(index + 301) - 0.5) * 1,
                glow
            };
            fleet.add(plane);
            return plane;
        });
        fleet.userData.sparkles = Array.from({ length: 60 }, (_, index) => {
            const material = new THREE.SpriteMaterial({
                map: paperGlowTexture,
                color: 0xa8e6ff,
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const sparkle = new THREE.Sprite(material);
            const size = 0.1 + orbitRandom(index + 121) * 0.08;
            sparkle.scale.set(size, size, 1);
            sparkle.userData.orbit = {
                angle: orbitRandom(index + 141) * Math.PI * 2,
                radius: 2 + orbitRandom(index + 161) * 2.5,
                speed: 0.1 + orbitRandom(index + 181) * 0.24,
                height: (orbitRandom(index + 201) - 0.5) * 2.5,
                bobAmplitude: 0.12 + orbitRandom(index + 221) * 0.32,
                bobSpeed: 0.3 + orbitRandom(index + 241) * 0.65,
                flickerSpeed: 1.4 + orbitRandom(index + 281) * 2.2,
                phase: orbitRandom(index + 261) * Math.PI * 2
            };
            fleet.add(sparkle);
            return sparkle;
        });
        fleet.visible = false;
        return fleet;
    }

    function createTearDrop() {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0.14);
        shape.quadraticCurveTo(-0.025, 0.06, -0.075, -0.025);
        shape.quadraticCurveTo(-0.12, -0.12, 0, -0.16);
        shape.quadraticCurveTo(0.12, -0.12, 0.075, -0.025);
        shape.quadraticCurveTo(0.025, 0.06, 0, 0.14);
        const tear = new THREE.Mesh(
            new THREE.ShapeGeometry(shape),
            new THREE.MeshBasicMaterial({ color: 0x55caff, side: THREE.DoubleSide })
        );
        tear.position.set(0.5, -0.55, 0.87);
        tear.scale.setScalar(1.5);
        tear.visible = false;
        return tear;
    }

    function getSpecialEffect(model, key, createEffect) {
        model.userData.specialEffects ||= {};
        if (!model.userData.specialEffects[key]) {
            const effect = createEffect();
            model.add(effect);
            model.userData.specialEffects[key] = effect;
        }
        return model.userData.specialEffects[key];
    }

    function updateSpecialEffects({ lightOn, darkModeOn, elapsedTime }) {
        const slotIds = ['top', 'middle', 'bottom'];
        const selectedFile = (slotId) => (selectedPartFiles.get(slotId) || '').split('/').pop();
        const moonSlot = slotIds.find((slotId) => selectedFile(slotId) === 'moon.html');
        const isMoonSoloCombination = Boolean(moonSlot)
            && slotIds.every((slotId) => slotId === moonSlot || !selectedFile(slotId));
        const isActive = lightOn && darkModeOn
            && isMoonSoloCombination;

        if (!isActive) {
            if (paperPlaneFleet) paperPlaneFleet.visible = false;
            loadedPartModels.forEach(({ model }) => {
                const effects = model.userData.specialEffects;
                if (effects) Object.values(effects).forEach((effect) => { effect.visible = false; });
            });
            return;
        }

        const moonPart = moonSlot ? loadedPartModels.get(moonSlot) : null;
        if (moonPart?.file === 'moon.html') {
            const head = moonPart.model.getObjectByName('머리');
            if (head) getSpecialEffect(moonPart.model, 'tear', createTearDrop).visible = true;
        }

        if (!paperPlaneFleet) {
            paperPlaneFleet = createPaperPlaneFleet();
            paperPlaneFleet.position.y = 0.3;
            chamber.add(paperPlaneFleet);
        }
        paperPlaneFleet.visible = true;
        paperPlaneFleet.userData.planes.forEach((plane) => {
            const orbit = plane.userData.orbit;
            const angle = orbit.angle + elapsedTime * orbit.speed;
            const bob = Math.sin(elapsedTime * orbit.bobSpeed + orbit.angle) * orbit.bobAmplitude;
            plane.position.set(
                Math.cos(angle) * orbit.radius,
                orbit.height + bob,
                Math.sin(angle) * orbit.radius
            );
            plane.rotation.set(0, -angle - Math.PI / 2, 0);
            plane.rotateX(orbit.pitch);
            plane.rotateZ(orbit.bank);
            orbit.glow.material.opacity = 0.68 + (Math.sin(elapsedTime * 2.4 + orbit.angle) + 1) * 0.16;
        });
        paperPlaneFleet.userData.sparkles.forEach((sparkle) => {
            const orbit = sparkle.userData.orbit;
            const angle = orbit.angle + elapsedTime * orbit.speed;
            const flicker = Math.max(0, Math.sin(elapsedTime * orbit.flickerSpeed + orbit.phase));
            sparkle.position.set(
                Math.cos(angle) * orbit.radius,
                orbit.height + Math.sin(elapsedTime * orbit.bobSpeed + orbit.phase) * orbit.bobAmplitude,
                Math.sin(angle) * orbit.radius
            );
            sparkle.material.opacity = 0.18 + flicker * 0.72;
        });
    }

    return { selectedPartFiles, chaColorCombination, updateSpecialEffects };
}
