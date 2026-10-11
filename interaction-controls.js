import * as THREE from "three";

export function setupInteractionControls(context) {
    const {
        scene, renderer, camera, controls,
        defaultCameraPosition, defaultCameraTarget,
        frontCameraPosition, frontCameraTarget,
        lightstick, crystalMat, crystalAuraMat, crystalLight, crystalAura, reflections,
        hemisphere, key, rim, warm, button,
        selectedPartFiles, chaColorCombination, updateSpecialEffects
    } = context;

    // ---------- Interaction ----------
    let lightOn = false;
    let darkModeOn = false;
    const lightColorInput = document.getElementById('lightColorInput');
    const lightColor = new THREE.Color(lightColorInput.value);
    let cameraStream = null;
    let cameraFacingMode = 'environment';
    let cameraRequestId = 0;
    let cameraWasActiveBeforeHide = false;
    let cameraRecoveryInProgress = false;
    
    function setLightState(on) {
        lightOn = on;
        document.getElementById('toggle').textContent = on ? 'LIGHT OFF' : 'LIGHT ON';
    
        crystalMat.emissiveIntensity = on ? 8 : 0;
        crystalAuraMat.opacity = on ? 1 : 0;
        crystalLight.intensity = on ? 9 : 0;
        reflections.forEach((reflection) => {
        reflection.material.opacity = on ? reflection.userData.baseOpacity : 0;
        });
    }
    
    document.getElementById('toggle').addEventListener('click', () => setLightState(!lightOn));
    lightColorInput.addEventListener('input', () => {
        lightColor.set(lightColorInput.value);
        crystalMat.emissive.copy(lightColor);
        crystalAuraMat.color.copy(lightColor);
        crystalLight.color.copy(lightColor);
        reflections.forEach((reflection) => reflection.material.color.copy(lightColor));
    });
    lightColorInput.dispatchEvent(new Event('input'));
    const darkModeToggle = document.getElementById('darkModeToggle');
    const resetViewButton = document.getElementById('resetView');
    const frontModeToggle = document.getElementById('frontModeToggle');
    const captureModeToggle = document.getElementById('captureModeToggle');
    const captureControls = document.getElementById('captureControls');
    const exitCaptureMode = document.getElementById('exitCaptureMode');
    const takeCapture = document.getElementById('takeCapture');
    const phoneCaptureButton = document.getElementById('phoneCaptureButton');
    const cameraHeightControls = document.getElementById('cameraHeightControls');
    const cameraFeed = document.getElementById('cameraFeed');
    const cameraToggle = document.getElementById('cameraToggle');
    const cameraFacingToggle = document.getElementById('cameraFacingToggle');
    const screenImageBackLayer = document.getElementById('screenImageBackLayer');
    const screenImageFrontLayer = document.getElementById('screenImageFrontLayer');
    const screenImageControls = document.getElementById('screenImageControls');
    const screenImageLayerToggle = document.getElementById('screenImageLayerToggle');
    const screenImageLockToggle = document.getElementById('screenImageLockToggle');
    const addScreenImageButton = document.getElementById('addScreenImage');
    const screenImageInput = document.getElementById('screenImageInput');
    let selectedScreenImage = null;
    let activeScreenImageDrag = null;
    const screenImageAlphaMasks = new WeakMap();
    const screenImageRemovers = new WeakMap();
    const viewHint = document.getElementById('viewHint');
    const lightstickBaseY = lightstick.position.y;
    let frontMode = false;
    let activeFrontPointerId = null;
    let lastPointerX = 0;
    let captureMode = false;
    let specialCaptureAlertShown = false;
    let moonCaptureAlertShown = false;
    let beaPairCaptureAlertShown = false;
    let chaKimPairCaptureAlertShown = false;
    
    function setCaptureMode(enabled) {
        captureMode = enabled;
        document.body.classList.toggle('capture-mode', enabled);
        captureControls.hidden = !enabled;
    }
    
    captureModeToggle.addEventListener('click', () => setCaptureMode(true));
    exitCaptureMode.addEventListener('click', () => setCaptureMode(false));
    
    function screenImageContainsPoint(image, clientX, clientY) {
        const alphaMask = screenImageAlphaMasks.get(image);
        if (!alphaMask) return false;
        const width = image.offsetWidth;
        const height = image.offsetHeight;
        if (!width || !height) return false;
    
        const bounds = image.getBoundingClientRect();
        const scale = Number(image.dataset.scale) || 1;
        const rotation = THREE.MathUtils.degToRad(Number(image.dataset.rotation) || 0);
        const deltaX = clientX - (bounds.left + bounds.width / 2);
        const deltaY = clientY - (bounds.top + bounds.height / 2);
        const localX = width / 2 + (Math.cos(rotation) * deltaX + Math.sin(rotation) * deltaY) / scale;
        const localY = height / 2 + (-Math.sin(rotation) * deltaX + Math.cos(rotation) * deltaY) / scale;
        const fitScale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
        const renderedWidth = image.naturalWidth * fitScale;
        const renderedHeight = image.naturalHeight * fitScale;
        const pixelX = Math.floor((localX - (width - renderedWidth) / 2) / renderedWidth * image.naturalWidth);
        const pixelY = Math.floor((localY - (height - renderedHeight) / 2) / renderedHeight * image.naturalHeight);
        if (pixelX < 0 || pixelY < 0 || pixelX >= image.naturalWidth || pixelY >= image.naturalHeight) return false;
        return alphaMask[pixelY * image.naturalWidth + pixelX] > 12;
    }
    
    function findScreenImageAt(clientX, clientY) {
        for (const layer of [screenImageFrontLayer, screenImageBackLayer]) {
        const images = [...layer.querySelectorAll('.screen-image')].reverse();
        const hit = images.find((image) => screenImageContainsPoint(image, clientX, clientY));
        if (hit) return hit;
        }
        return null;
    }
    
    document.addEventListener('pointermove', (event) => {
        const drag = activeScreenImageDrag;
        if (!drag || event.pointerId !== drag.pointerId) return;
        const deltaX = event.clientX - drag.startX;
        const deltaY = event.clientY - drag.startY;
        if (!drag.moved && Math.hypot(deltaX, deltaY) < 3) return;
        drag.moved = true;
        event.preventDefault();
        event.stopPropagation();
        drag.image.style.left = `${THREE.MathUtils.clamp(drag.startLeft + deltaX, 0, innerWidth - drag.image.offsetWidth)}px`;
        drag.image.style.top = `${THREE.MathUtils.clamp(drag.startTop + deltaY, 0, innerHeight - drag.image.offsetHeight)}px`;
        positionScreenImageControls();
    }, true);
    
    const finishScreenImageDrag = (event) => {
        if (activeScreenImageDrag?.pointerId === event.pointerId) activeScreenImageDrag = null;
    };
    document.addEventListener('pointerup', finishScreenImageDrag, true);
    document.addEventListener('pointercancel', finishScreenImageDrag, true);
    
    function stopCamera() {
        cameraRequestId += 1;
        cameraStream?.getTracks().forEach((track) => track.stop());
        cameraStream = null;
        cameraFeed.pause();
        cameraFeed.srcObject = null;
        document.body.classList.remove('camera-active');
        document.body.classList.remove('front-camera-active');
        cameraToggle.textContent = '카메라 켜기';
        cameraToggle.setAttribute('aria-pressed', 'false');
        cameraFacingToggle.hidden = true;
        cameraToggle.disabled = false;
        cameraFacingToggle.disabled = false;
    }
    
    async function startCamera() {
        if (!navigator.mediaDevices?.getUserMedia) {
        alert('카메라를 사용할 수 없습니다. HTTPS 또는 localhost에서 페이지를 열어 주세요.');
        return false;
        }
    
        const requestId = ++cameraRequestId;
        cameraToggle.disabled = true;
        cameraFacingToggle.disabled = true;
        try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
            facingMode: { ideal: cameraFacingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 }
            }
        });
        if (requestId !== cameraRequestId) {
            stream.getTracks().forEach((track) => track.stop());
            return false;
        }
    
        cameraStream = stream;
        cameraFeed.srcObject = stream;
        await cameraFeed.play();
        document.body.classList.add('camera-active');
        document.body.classList.toggle('front-camera-active', cameraFacingMode === 'user');
        cameraToggle.textContent = '카메라 끄기';
        cameraToggle.setAttribute('aria-pressed', 'true');
        cameraFacingToggle.textContent = cameraFacingMode === 'environment'
            ? '전면으로 전환'
            : '후면으로 전환';
        cameraFacingToggle.hidden = false;
        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
            if (cameraStream === stream) stopCamera();
        }, { once: true });
        return true;
        } catch (error) {
        if (requestId === cameraRequestId) {
            cameraStream?.getTracks().forEach((track) => track.stop());
            cameraStream = null;
            cameraFeed.srcObject = null;
            document.body.classList.remove('camera-active', 'front-camera-active');
            cameraToggle.textContent = '카메라 켜기';
            cameraToggle.setAttribute('aria-pressed', 'false');
            cameraFacingToggle.hidden = true;
            alert(`카메라를 시작할 수 없습니다: ${error instanceof Error ? error.message : String(error)}`);
        }
        return false;
        } finally {
        if (requestId === cameraRequestId) {
            cameraToggle.disabled = false;
            cameraFacingToggle.disabled = false;
        }
        }
    }
    
    cameraToggle.addEventListener('click', () => {
        if (cameraStream) {
            cameraWasActiveBeforeHide = false;
            stopCamera();
        }
        else startCamera();
    });
    
    cameraFacingToggle.addEventListener('click', async () => {
        if (!cameraStream) return;
        cameraFacingMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
        cameraStream.getTracks().forEach((track) => track.stop());
        cameraStream = null;
        cameraFeed.srcObject = null;
        await startCamera();
    });

    async function resumeCameraAfterVisibility() {
        if (
            document.visibilityState === 'hidden' ||
            !cameraWasActiveBeforeHide ||
            cameraRecoveryInProgress
        ) {
            return;
        }

        cameraWasActiveBeforeHide = false;
        cameraRecoveryInProgress = true;
        const facingMode = cameraFacingMode;

        if (cameraStream) stopCamera();
        cameraFacingMode = facingMode;

        try {
            await startCamera();
        } finally {
            cameraRecoveryInProgress = false;
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            cameraWasActiveBeforeHide ||= Boolean(cameraStream);
            return;
        }

        resumeCameraAfterVisibility();
    });

    window.addEventListener('blur', () => {
        cameraWasActiveBeforeHide ||= Boolean(cameraStream);
    });
    window.addEventListener('pagehide', () => {
        cameraWasActiveBeforeHide ||= Boolean(cameraStream);
    });
    window.addEventListener('pageshow', resumeCameraAfterVisibility);
    window.addEventListener('focus', resumeCameraAfterVisibility);
    
    function selectScreenImage(image) {
        screenImageBackLayer.querySelectorAll('.screen-image').forEach((item) => item.classList.remove('selected'));
        screenImageFrontLayer.querySelectorAll('.screen-image').forEach((item) => item.classList.remove('selected'));
        selectedScreenImage = image;
        if (image) {
        image.classList.add('selected');
        image.focus({ preventScroll: true });
        }
        document.body.classList.toggle('back-screen-image-selected', image?.dataset.layer === 'back');
        screenImageControls.hidden = !image;
        if (image) {
        const locked = image.dataset.locked === 'true';
        screenImageControls.classList.toggle('locked', locked);
        screenImageControls.querySelectorAll('[data-image-edit-control]').forEach((button) => {
            button.hidden = locked;
        });
        screenImageLockToggle.textContent = locked ? '잠금 해제' : '잠금';
        screenImageLockToggle.setAttribute('aria-label', locked ? '이미지 잠금 해제' : '이미지 잠금');
        screenImageLayerToggle.textContent = image.dataset.layer === 'back' ? '앞으로 가져오기' : '뒤로 보내기';
        positionScreenImageControls();
        }
    }
    
    document.addEventListener('pointerdown', (event) => {
        if (event.target instanceof Element && event.target.closest('#screenImageControls')) return;
        const hitImage = findScreenImageAt(event.clientX, event.clientY);
        if (hitImage) {
        event.preventDefault();
        event.stopPropagation();
        selectScreenImage(hitImage);
        if (hitImage.dataset.locked !== 'true' && event.button === 0) {
            activeScreenImageDrag = {
            image: hitImage,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startLeft: Number.parseFloat(hitImage.style.left) || 0,
            startTop: Number.parseFloat(hitImage.style.top) || 0,
            moved: false
            };
        }
        return;
        }
        if (selectedScreenImage) selectScreenImage(null);
    }, true);
    
    function positionScreenImageControls() {
        if (!selectedScreenImage || screenImageControls.hidden) return;
        const imageBounds = selectedScreenImage.getBoundingClientRect();
        const controlsHeight = screenImageControls.offsetHeight;
        const top = imageBounds.bottom + controlsHeight + 8 <= innerHeight
        ? imageBounds.bottom + 8
        : imageBounds.top - controlsHeight - 8;
        screenImageControls.style.left = `${THREE.MathUtils.clamp(
        imageBounds.left + (imageBounds.width - screenImageControls.offsetWidth) / 2,
        8,
        innerWidth - screenImageControls.offsetWidth - 8
        )}px`;
        screenImageControls.style.top = `${THREE.MathUtils.clamp(top, 8, innerHeight - controlsHeight - 8)}px`;
    }
    
    function addScreenImage(file) {
        if (!file.type.startsWith('image/')) return;
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.className = 'screen-image';
        image.dataset.layer = 'front';
        image.dataset.scale = '1';
        image.dataset.rotation = '0';
        image.dataset.locked = 'false';
        image.src = objectUrl;
        image.alt = file.name;
        image.title = '드래그하여 이동 · 클릭해 조절 · 두 번 클릭해 삭제';
        image.draggable = false;
        image.tabIndex = 0;
        screenImageFrontLayer.appendChild(image);
        selectScreenImage(null);
    
        image.addEventListener('load', () => {
        try {
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = image.naturalWidth;
            maskCanvas.height = image.naturalHeight;
            const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });
            maskContext.drawImage(image, 0, 0);
            const rgba = maskContext.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data;
            const alphaMask = new Uint8Array(image.naturalWidth * image.naturalHeight);
            for (let index = 0; index < alphaMask.length; index += 1) alphaMask[index] = rgba[index * 4 + 3];
            screenImageAlphaMasks.set(image, alphaMask);
        } catch (error) {
            console.error('이미지 투명 영역을 분석하지 못했습니다.', error);
            screenImageAlphaMasks.set(image, null);
        }
        const bounds = image.getBoundingClientRect();
        const imageIndex = [...screenImageFrontLayer.children].indexOf(image);
        image.style.left = `${THREE.MathUtils.clamp((innerWidth - bounds.width) / 2 + imageIndex * 20, 0, innerWidth - bounds.width)}px`;
        image.style.top = `${THREE.MathUtils.clamp((innerHeight - bounds.height) / 2 + imageIndex * 20, 0, innerHeight - bounds.height)}px`;
        if (selectedScreenImage === image) positionScreenImageControls();
        }, { once: true });
        image.addEventListener('error', () => {
        URL.revokeObjectURL(objectUrl);
        image.remove();
        if (selectedScreenImage === image) selectScreenImage(null);
        }, { once: true });
    
        const removeImage = () => {
        if (image.dataset.locked === 'true') return;
        image.remove();
        URL.revokeObjectURL(objectUrl);
        if (selectedScreenImage === image) selectScreenImage(null);
        };
        screenImageRemovers.set(image, removeImage);
        image.addEventListener('keydown', (event) => {
        if (image.dataset.locked === 'true') return;
        if (event.key !== 'Delete' && event.key !== 'Backspace') return;
        event.preventDefault();
        removeImage();
        });
    }
    
    document.addEventListener('dblclick', (event) => {
        const image = findScreenImageAt(event.clientX, event.clientY);
        if (!image || image.dataset.locked === 'true') return;
        event.preventDefault();
        event.stopPropagation();
        screenImageRemovers.get(image)?.();
    }, true);
    
    addScreenImageButton.addEventListener('click', () => screenImageInput.click());
    screenImageInput.addEventListener('change', () => {
        Array.from(screenImageInput.files || []).forEach(addScreenImage);
        screenImageInput.value = '';
    });
    
    screenImageControls.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-image-action]');
        if (!button || !selectedScreenImage) return;
        const image = selectedScreenImage;
        const action = button.dataset.imageAction;
        const locked = image.dataset.locked === 'true';
        if (locked && action !== 'toggle-lock') return;
        const scale = Number(image.dataset.scale);
        const rotation = Number(image.dataset.rotation);
    
        if (action === 'toggle-lock') {
        image.dataset.locked = String(!locked);
        selectScreenImage(image);
        return;
        }
        if (action === 'scale-down' || action === 'scale-up') {
        image.dataset.scale = String(THREE.MathUtils.clamp(scale + (action === 'scale-up' ? 0.1 : -0.1), 0.2, 3));
        } else if (action === 'rotate-left' || action === 'rotate-right') {
        image.dataset.rotation = String(rotation + (action === 'rotate-right' ? 15 : -15));
        } else if (action === 'toggle-layer') {
        const nextLayer = image.dataset.layer === 'back' ? 'front' : 'back';
        (nextLayer === 'back' ? screenImageBackLayer : screenImageFrontLayer).appendChild(image);
        image.dataset.layer = nextLayer;
        selectScreenImage(image);
        } else if (action === 'remove') {
        screenImageRemovers.get(image)?.();
        return;
        }
    
        image.style.transform = `scale(${image.dataset.scale}) rotate(${image.dataset.rotation}deg)`;
        positionScreenImageControls();
    });
    
    function drawScreenImages(layer, context) {
        layer.querySelectorAll('.screen-image').forEach((image) => {
        if (!image.complete || !image.naturalWidth) return;
        const width = image.offsetWidth;
        const height = image.offsetHeight;
        const left = Number.parseFloat(image.style.left) || 0;
        const top = Number.parseFloat(image.style.top) || 0;
        const scale = Number(image.dataset.scale) || 1;
        const rotation = THREE.MathUtils.degToRad(Number(image.dataset.rotation) || 0);
        context.save();
        context.translate(left + width / 2, top + height / 2);
        context.rotate(rotation);
        context.scale(scale, scale);
        context.drawImage(image, -width / 2, -height / 2, width, height);
        context.restore();
        });
    }
    
    async function captureScreen() {
        const width = innerWidth;
        const height = innerHeight;
        const captureScale = Math.min(
        Math.max(devicePixelRatio || 1, 2),
        3,
        8192 / width,
        8192 / height,
        Math.sqrt(40000000 / (width * height))
        );
        const captureCanvas = document.createElement('canvas');
        captureCanvas.width = Math.round(width * captureScale);
        captureCanvas.height = Math.round(height * captureScale);
        const context = captureCanvas.getContext('2d');
        if (!context) throw new Error('캡쳐용 캔버스를 준비하지 못했습니다.');
    
        context.scale(captureScale, captureScale);
        if (cameraStream && cameraFeed.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        if (cameraFacingMode === 'user') {
            context.save();
            context.translate(width, 0);
            context.scale(-1, 1);
        }
        context.drawImage(cameraFeed, 0, 0, width, height);
        if (cameraFacingMode === 'user') context.restore();
        } else {
        const background = context.createRadialGradient(width * 0.5, height * 0.3, 0, width * 0.5, height * 0.3, Math.max(width, height) * 0.75);
        if (darkModeOn) {
            background.addColorStop(0, '#242a37');
            background.addColorStop(0.48, '#11151e');
            background.addColorStop(1, '#080a10');
        } else {
            background.addColorStop(0, '#f8fbff');
            background.addColorStop(0.38, '#e8edf5');
            background.addColorStop(1, '#cfd6e2');
        }
        context.fillStyle = background;
        context.fillRect(0, 0, width, height);
        }
        drawScreenImages(screenImageBackLayer, context);
        const previousPixelRatio = renderer.getPixelRatio();
        const previousRendererSize = renderer.getSize(new THREE.Vector2());
        try {
        renderer.setPixelRatio(captureScale);
        renderer.setSize(width, height, false);
        renderer.render(scene, camera);
        context.drawImage(renderer.domElement, 0, 0, width, height);
        } finally {
        renderer.setPixelRatio(previousPixelRatio);
        renderer.setSize(previousRendererSize.x, previousRendererSize.y, false);
        }
        drawScreenImages(screenImageFrontLayer, context);
    
        if (matchMedia('(max-width: 600px)').matches) {
        const phoneTop = document.querySelector('.phone-top');
        const phoneBottom = document.querySelector('.phone-bottom');
        if (!phoneTop.complete || !phoneTop.naturalWidth || !phoneBottom.complete || !phoneBottom.naturalWidth) {
            throw new Error('캡쳐 프레임 이미지를 불러오지 못했습니다.');
        }
        const topHeight = width * phoneTop.naturalHeight / phoneTop.naturalWidth;
        const bottomHeight = width * phoneBottom.naturalHeight / phoneBottom.naturalWidth;
        context.drawImage(phoneTop, 0, 0, width, topHeight);
        context.drawImage(phoneBottom, 0, height - bottomHeight, width, bottomHeight);
        } else {
        const cornerWidth = Math.min(width * 0.38, height * 0.5);
        const centerWidth = cornerWidth / 2;
        const desktopFrames = [
            { selector: '.desktop-left-top', x: 0, y: 0, width: cornerWidth },
            { selector: '.desktop-left-bottom', x: 0, y: height - cornerWidth, width: cornerWidth },
            { selector: '.desktop-middle-bottom', x: (width - centerWidth) / 2, y: height - centerWidth, width: centerWidth },
            { selector: '.desktop-right-top', x: width - cornerWidth, y: 0, width: cornerWidth },
            { selector: '.desktop-right-bottom', x: width - cornerWidth, y: height - cornerWidth, width: cornerWidth }
        ];
        desktopFrames.forEach(({ selector, x, y, width: frameWidth }) => {
            const frame = document.querySelector(selector);
            if (!frame.complete || !frame.naturalWidth) {
            throw new Error(`캡쳐 프레임 이미지를 불러오지 못했습니다: ${selector}`);
            }
            const frameHeight = frameWidth * frame.naturalHeight / frame.naturalWidth;
            context.drawImage(frame, x, y, frameWidth, frameHeight);
        });
        }
    
        const blob = await new Promise((resolve, reject) => {
        captureCanvas.toBlob((result) => {
            if (result) resolve(result);
            else reject(new Error('캡쳐 이미지를 생성하지 못했습니다.'));
        }, 'image/png');
        });
        const downloadUrl = URL.createObjectURL(blob);
        const download = document.createElement('a');
        download.href = downloadUrl;
        download.download = `lightstick-capture-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
        document.body.appendChild(download);
        download.click();
        download.remove();
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    }
    
    async function handleCaptureRequest() {
        captureControls.hidden = true;
        await new Promise((resolve) => setTimeout(resolve, 50));
        try {
        const selectedFiles = [...selectedPartFiles.values()].map((file) => file.split('/').pop());
        const isMoonSoloCombination = selectedFiles.filter((file) => file === 'moon.html').length === 1
            && selectedFiles.every((file) => !file || file === 'moon.html');
        const isMoonSoloCapture = lightOn && darkModeOn
            && isMoonSoloCombination;
        if (isMoonSoloCapture && !moonCaptureAlertShown) {
            moonCaptureAlertShown = true;
            alert('저는 테스타의 박문대라서 행복합니다.');
        }
        const isBeaPairCombination = selectedFiles.filter((file) => file === 'bea.html').length === 2
            && selectedFiles.filter(Boolean).length === 2;
        if (isBeaPairCombination && !beaPairCaptureAlertShown) {
            beaPairCaptureAlertShown = true;
            alert('[기억 내놔!]');
        }
        const isChaKimPairCombination = selectedFiles.filter((file) => file === 'cha.html').length === 1
            && selectedFiles.filter((file) => file === 'kim.html').length === 1
            && selectedFiles.filter(Boolean).length === 2;
        if (isChaKimPairCombination && !chaKimPairCaptureAlertShown) {
            chaKimPairCaptureAlertShown = true;
            alert('[잘 가 차유진]');
        }
        const isSpecialCaptureCombination = selectedFiles.length === chaColorCombination.length
            && chaColorCombination.every((file) => selectedFiles.includes(file));
        if (isSpecialCaptureCombination && !specialCaptureAlertShown) {
            specialCaptureAlertShown = true;
            alert(Math.random() < 0.5 ? 'Oh, 우리 팬이에요?' : '…건우 형?');
        }
        await captureScreen();
        } catch (error) {
        console.error('화면 캡쳐에 실패했습니다.', error);
        alert(`화면 캡쳐에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
        if (captureMode) captureControls.hidden = false;
        }
    }
    
    takeCapture.addEventListener('click', handleCaptureRequest);
    phoneCaptureButton.addEventListener('click', handleCaptureRequest);
    
    function setCameraView(front) {
        controls.enabled = true;
        controls.reset();
        camera.position.copy(front ? frontCameraPosition : defaultCameraPosition);
        controls.target.copy(front ? frontCameraTarget : defaultCameraTarget);
        camera.lookAt(controls.target);
        controls.update();
        controls.enabled = !front;
    }
    
    function screenPixelOffsetAt(worldPosition, deltaX, deltaY = 0) {
        camera.updateMatrixWorld(true);
        const projected = worldPosition.clone().project(camera);
        projected.x += deltaX * 2 / innerWidth;
        projected.y -= deltaY * 2 / innerHeight;
        return projected.unproject(camera).sub(worldPosition);
    }
    
    cameraHeightControls.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-direction]');
        if (!button) return;
        const direction = Number(button.dataset.direction);
        const axis = button.dataset.axis;
        if (frontMode) {
        if (axis === 'x') {
            lightstick.updateWorldMatrix(true, true);
            const screenAnchor = new THREE.Box3().setFromObject(lightstick).getCenter(new THREE.Vector3());
            const movement = screenPixelOffsetAt(screenAnchor, -direction * 40);
            lightstick.position.add(movement);
        } else {
            lightstick.position.y = THREE.MathUtils.clamp(
            lightstick.position.y - direction * 0.25,
            lightstickBaseY - 1.5,
            lightstickBaseY + 1.5
            );
        }
        return;
        }
        if (axis === 'x') {
        camera.updateMatrixWorld(true);
        const movement = screenPixelOffsetAt(controls.target, -direction * 40);
        camera.position.add(movement);
        controls.target.add(movement);
        controls.update();
        return;
        }
        const targetY = controls.target.y;
        const nextTargetY = THREE.MathUtils.clamp(targetY - direction * 0.25, -2.5, 4.5);
        const heightChange = nextTargetY - targetY;
        camera.position.y += heightChange;
        controls.target.y = nextTargetY;
        camera.lookAt(controls.target);
        controls.update();
    });
    
    resetViewButton.addEventListener('click', () => setCameraView(frontMode));
    frontModeToggle.addEventListener('click', () => {
        frontMode = !frontMode;
        controls.enabled = !frontMode;
        activeFrontPointerId = null;
        if (frontMode) {
        lightstick.position.y = lightstickBaseY;
        lightstick.rotation.set(0, 0, 0);
        }
        cameraHeightControls.querySelectorAll('button[data-direction]').forEach((button) => {
        const directionLabel = button.dataset.axis === 'x'
            ? (button.dataset.direction === '-1' ? '왼쪽' : '오른쪽')
            : (button.dataset.direction === '1' ? '올리기' : '내리기');
        const targetLabel = frontMode ? '라이트스틱' : '카메라 시점';
        button.setAttribute('aria-label', `${targetLabel} ${directionLabel}`);
        button.title = `${targetLabel} ${directionLabel}`;
        });
        setCameraView(frontMode);
        frontModeToggle.textContent = `정면 조작 ${frontMode ? 'ON' : 'OFF'}`;
        frontModeToggle.setAttribute('aria-pressed', String(frontMode));
        viewHint.textContent = frontMode
        ? '정면 조작: 좌우 드래그 회전 · 화살표로 상하좌우 이동'
        : '드래그: 회전 · 휠: 확대/축소';
    });
    
    darkModeToggle.addEventListener('click', () => {
        darkModeOn = !darkModeOn;
        document.body.classList.toggle('dark-mode', darkModeOn);
        darkModeToggle.textContent = darkModeOn ? '다크모드 ON' : '다크모드 OFF';
        darkModeToggle.setAttribute('aria-pressed', String(darkModeOn));
    
        hemisphere.intensity = darkModeOn ? 0.2 : 0.7;
        key.intensity = darkModeOn ? 0.32 : 1.2;
        rim.intensity = darkModeOn ? 0.2 : 0.45;
        warm.intensity = darkModeOn ? 0.16 : 0.4;
    });
    
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    
    renderer.domElement.addEventListener('pointerdown', (event) => {
        if (selectedScreenImage?.dataset.layer === 'back') selectScreenImage(null);
        if (frontMode) {
        if (event.button !== 0) return;
        event.preventDefault();
        activeFrontPointerId = event.pointerId;
        lastPointerX = event.clientX;
        renderer.domElement.setPointerCapture(event.pointerId);
        return;
        }
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObject(button, true);
        if (hits.length) setLightState(!lightOn);
    });
    
    renderer.domElement.addEventListener('pointermove', (event) => {
        if (!frontMode || event.pointerId !== activeFrontPointerId) return;
        event.preventDefault();
        const deltaX = event.clientX - lastPointerX;
        lastPointerX = event.clientX;
        lightstick.rotation.y += deltaX * 0.004;
    });
    
    const finishFrontDrag = (event) => {
        if (event.pointerId !== activeFrontPointerId) return;
        activeFrontPointerId = null;
        if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
        }
    };
    renderer.domElement.addEventListener('pointerup', finishFrontDrag);
    renderer.domElement.addEventListener('pointercancel', finishFrontDrag);
    
    // ---------- Animation ----------
    const clock = new THREE.Clock();
    
    function animate() {
        requestAnimationFrame(animate);
    
        const t = clock.getElapsedTime();
    
        controls.update();
        updateSpecialEffects({ lightOn, darkModeOn, elapsedTime: t });
    
        if (lightOn) {
        crystalMat.emissiveIntensity = 7 + Math.sin(t * 3.2) * 1;
        crystalAuraMat.opacity = 0.95 + Math.sin(t * 2.4) * 0.05;
        crystalLight.intensity = 8 + Math.sin(t * 2.4) * 1;
        const auraSize = 4.1 + Math.sin(t * 2.4) * 0.28;
        crystalAura.scale.set(auraSize, auraSize, 1);
        const isCompactViewport = innerWidth <= 600;
        reflections.forEach((reflection, index) => {
            const shimmer = 0.55 + Math.sin(t * 2.1 + reflection.userData.phase) * 0.35;
            const isSoftenedOut = isCompactViewport && index % 2 === 1;
            reflection.material.opacity = isSoftenedOut
                ? 0
                : reflection.userData.baseOpacity * shimmer * (isCompactViewport ? 0.65 : 1);
            const pulse = 0.85 + shimmer * 0.3;
            reflection.scale.setScalar(
                reflection.userData.baseSize * pulse * (isCompactViewport ? 1.6 : 1)
            );
        });
        }
    
        renderer.render(scene, camera);
    }
    
    animate();
    
    addEventListener('resize', () => {
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(innerWidth, innerHeight);
    });
}
