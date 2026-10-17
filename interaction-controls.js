import * as THREE from "three";
import { createGifPalette, encodeGif, quantizeGifFrame } from './gif-encoder.js';

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
    let blinkEnabled = false;
    let blinkSpeed = 2;
    let softBlink = false;
    let darkModeOn = false;
    const lightColorInput = document.getElementById('lightColorInput');
    const phoneLightColorInput = document.getElementById('phoneLightColorInput');
    const phoneLightColors = document.getElementById('phoneLightColors');
    const phoneLightColorHint = document.getElementById('phoneLightColorHint');
    const phoneAddLightColor = document.getElementById('phoneAddLightColor');
    const phoneLightToggle = document.getElementById('phoneLightToggle');
    const phoneBlinkToggle = document.getElementById('phoneBlinkToggle');
    const phoneBlinkStyleToggle = document.getElementById('phoneBlinkStyleToggle');
    const phoneBlinkSpeedInput = document.getElementById('phoneBlinkSpeed');
    const phoneBlinkSpeedValue = document.getElementById('phoneBlinkSpeedValue');
    const phoneFlashLightOptions = document.getElementById('phoneFlashLightOptions');
    const phoneFlashTrigger = document.getElementById('phoneFlashTrigger');
    const phoneFlashControls = document.getElementById('phoneFlashControls');
    const phoneFlashClose = document.getElementById('phoneFlashClose');
    const lightColor = new THREE.Color(lightColorInput.value);
    let cameraStream = null;
    let cameraFacingMode = 'environment';
    let cameraRequestId = 0;
    let cameraWasActiveBeforeHide = false;
    let cameraRecoveryInProgress = false;
    
    function setLightState(on) {
        lightOn = on;
        document.getElementById('toggle').textContent = on ? 'LIGHT OFF' : 'LIGHT ON';
        phoneLightToggle.textContent = on ? '라이트 끄기' : '라이트 켜기';
        phoneLightToggle.setAttribute('aria-pressed', String(on));
        phoneFlashLightOptions.hidden = !on;
    
        crystalMat.emissiveIntensity = on ? 8 : 0;
        crystalAuraMat.opacity = on ? 1 : 0;
        crystalLight.intensity = on ? 9 : 0;
        reflections.forEach((reflection) => {
        reflection.material.opacity = on ? reflection.userData.baseOpacity : 0;
        });
    }
    
    function applyLightColor(value) {
        lightColor.set(value);
        crystalMat.emissive.copy(lightColor);
        crystalAuraMat.color.copy(lightColor);
        crystalLight.color.copy(lightColor);
        reflections.forEach((reflection) => reflection.material.color.copy(lightColor));
    }

    function setLightColor(value) {
        lightColorInput.value = value;
        phoneLightColorInput.value = value;
        applyLightColor(value);
    }

    document.getElementById('toggle').addEventListener('click', () => setLightState(!lightOn));
    phoneLightToggle.addEventListener('click', () => setLightState(!lightOn));
    lightColorInput.addEventListener('input', () => setLightColor(lightColorInput.value));
    phoneBlinkToggle.addEventListener('click', () => {
        blinkEnabled = !blinkEnabled;
        phoneBlinkToggle.textContent = `깜빡임 ${blinkEnabled ? 'ON' : 'OFF'}`;
        phoneBlinkToggle.setAttribute('aria-pressed', String(blinkEnabled));
        phoneBlinkStyleToggle.hidden = !blinkEnabled;
    });
    phoneBlinkStyleToggle.addEventListener('click', () => {
        softBlink = !softBlink;
        phoneBlinkStyleToggle.textContent = softBlink ? '부드럽게' : '딱딱하게';
        phoneBlinkStyleToggle.setAttribute('aria-pressed', String(softBlink));
    });
    phoneBlinkSpeedInput.addEventListener('input', () => {
        blinkSpeed = Number(phoneBlinkSpeedInput.value);
        phoneBlinkSpeedValue.value = `${blinkSpeed.toFixed(1)}회/초`;
    });
    const additionalLightColors = ['#ff4fa3', '#59c7ff', '#ffe066'];
    phoneAddLightColor.addEventListener('click', () => {
        const colorCount = phoneLightColors.querySelectorAll('input[type="color"]').length;
        const label = document.createElement('label');
        label.className = 'phone-flash-option phone-flash-color has-remove';
        const colorLabel = document.createElement('span');
        colorLabel.textContent = `색상 ${colorCount + 1}`;
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = additionalLightColors[(colorCount - 1) % additionalLightColors.length];
        colorInput.setAttribute('aria-label', `순서 색상 ${colorCount + 1}`);
        label.append(colorLabel, colorInput);
        phoneLightColors.append(label);
        updateLightColorRemoveButtons();
    });
    phoneLightColors.addEventListener('click', (event) => {
        const removeButton = event.target.closest('.phone-flash-color-remove');
        const colorLabel = removeButton?.closest('.phone-flash-color');
        if (!colorLabel || colorLabel === phoneLightColors.querySelector('.phone-flash-color')) return;
        colorLabel.remove();
        updateLightColorRemoveButtons();
    });
    function updateLightColorRemoveButtons() {
        const colorLabels = phoneLightColors.querySelectorAll('.phone-flash-color');
        colorLabels.forEach((label, index) => {
            const isDefaultColor = index === 0;
            const labelText = isDefaultColor ? '기본 색상' : `색상 ${index + 1}`;
            label.querySelector('span').textContent = labelText;
            label.querySelector('input[type="color"]').setAttribute(
                'aria-label',
                isDefaultColor ? '기본 라이트 색상' : `순서 색상 ${index + 1}`
            );
            const removeColorButton = label.querySelector('.phone-flash-color-remove');
            if (isDefaultColor) {
                removeColorButton?.remove();
                label.classList.remove('has-remove');
                return;
            }
            label.classList.add('has-remove');
            const colorRemoveButton = removeColorButton || document.createElement('button');
            colorRemoveButton.type = 'button';
            colorRemoveButton.className = 'phone-flash-color-remove';
            colorRemoveButton.textContent = '×';
            colorRemoveButton.setAttribute('aria-label', `${labelText} 삭제`);
            if (!removeColorButton) label.append(colorRemoveButton);
        });
        phoneLightColorHint.hidden = colorLabels.length < 2;
    }
    updateLightColorRemoveButtons();
    phoneLightColors.addEventListener('input', (event) => {
        if (event.target === phoneLightColorInput) setLightColor(phoneLightColorInput.value);
    });
    lightColorInput.dispatchEvent(new Event('input'));
    const darkModeToggle = document.getElementById('darkModeToggle');
    const resetViewButton = document.getElementById('resetView');
    const frontModeToggle = document.getElementById('frontModeToggle');
    const captureModeToggle = document.getElementById('captureModeToggle');
    const captureControls = document.getElementById('captureControls');
    const exitCaptureMode = document.getElementById('exitCaptureMode');
    const takeCapture = document.getElementById('takeCapture');
    const frameToggle = document.getElementById('frameToggle');
    const captureFrame = document.querySelector('.capture-frame');
    const phoneCaptureButton = document.getElementById('phoneCaptureButton');
    const gifRecordingTimer = document.getElementById('gifRecordingTimer');
    const phoneInvertButton = document.getElementById('phoneInvertButton');
    const phoneCaptureIntro = document.getElementById('phoneCaptureIntro');
    const cameraHeightControls = document.getElementById('cameraHeightControls');
    const cameraFeed = document.getElementById('cameraFeed');
    const cameraToggle = document.getElementById('cameraToggle');
    const cameraFacingToggle = document.getElementById('cameraFacingToggle');
    const screenImageBackLayer = document.getElementById('screenImageBackLayer');
    const screenImageFrontLayer = document.getElementById('screenImageFrontLayer');
    const lightstickDecorLayer = document.getElementById('lightstickDecorLayer');
    const decorPatternCycle = document.getElementById('decorPatternCycle');
    const decorPatternColor = document.getElementById('decorPatternColor');
    const decorBackgroundToggle = document.getElementById('decorBackgroundToggle');
    const decorBackgroundColor = document.getElementById('decorBackgroundColor');
    const cameraDecorations = [
        {
            element: document.getElementById('dotDecorLayer'),
            label: '점'
        },
        {
            element: document.getElementById('heartDecorLayer'),
            label: '큰 하트'
        },
        {
            element: document.getElementById('miniHeartDecorLayer'),
            label: '작은 하트'
        }
    ].map((decoration) => ({
        ...decoration,
        image: new Image()
    }));
    let cameraDecorationIndex = cameraDecorations.length;
    cameraDecorations.forEach(({ element, image }) => {
        image.src = element.dataset.imageSrc;
    });
    const screenImageControls = document.getElementById('screenImageControls');
    const screenImageLayerToggle = document.getElementById('screenImageLayerToggle');
    const screenImageShadowToggle = document.getElementById('screenImageShadowToggle');
    const screenImageLockToggle = document.getElementById('screenImageLockToggle');
    const addScreenImageButton = document.getElementById('addScreenImage');
    const screenImageInput = document.getElementById('screenImageInput');
    const backgroundImageLayer = document.getElementById('backgroundImageLayer');
    const backgroundImageToggle = document.getElementById('backgroundImageToggle');
    const backgroundImageInput = document.getElementById('backgroundImageInput');
    let backgroundImageUrl = null;
    let selectedScreenImage = null;
    let activeScreenImageDrag = null;
    const screenImageAlphaMasks = new WeakMap();
    const screenImageRemovers = new WeakMap();
    const viewHint = document.getElementById('viewHint');
    const menuToggleButton = document.getElementById('menuToggle');
    const controlMenu = document.getElementById('controlMenu');
    const captureCustomizerToggle = document.getElementById('captureMenuToggle');
    const captureCustomizer = document.getElementById('captureCustomizer');
    const lightstickBaseY = lightstick.position.y;
    let frontMode = false;
    let activeFrontPointerId = null;
    let lastPointerX = 0;
    let captureMode = false;
    let frameEnabled = true;
    let frameColorInverted = false;
    let captureModeOrientationAlertShown = false;
    let specialCaptureAlertShown = false;
    let moonCaptureAlertShown = false;
    let beaPairCaptureAlertShown = false;
    let chaKimPairCaptureAlertShown = false;
    let phoneCaptureIntroDismissed = false;

    document.addEventListener('contextmenu', (event) => {
        event.preventDefault();
    });

    function setPhoneFlashControlsOpen(open) {
        phoneFlashControls.hidden = !open;
        phoneFlashTrigger.setAttribute('aria-expanded', String(open));
    }

    function showPhoneCaptureIntroForFirstPortraitEntry() {
        if (
            captureMode &&
            matchMedia('(orientation: portrait)').matches &&
            !phoneCaptureIntroDismissed
        ) {
            phoneCaptureIntro.hidden = false;
            phoneCaptureIntro.focus();
        }
    }

    phoneFlashTrigger.addEventListener('click', () => {
        setPhoneFlashControlsOpen(phoneFlashControls.hidden);
    });
    phoneFlashClose.addEventListener('click', () => {
        setPhoneFlashControlsOpen(false);
        phoneFlashTrigger.focus();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !phoneFlashControls.hidden) {
            setPhoneFlashControlsOpen(false);
            phoneFlashTrigger.focus();
        }
    });

    function setCaptureMode(enabled) {
        if (
            enabled &&
            !captureModeOrientationAlertShown
        ) {
            alert('가로 화면에서는 디지털 카메라 프레임, 세로 화면에서는 폰 카메라 프레임이 적용됩니다.');
            captureModeOrientationAlertShown = true;
        }
        captureMode = enabled;
        document.body.classList.toggle('capture-mode', enabled);
        captureControls.hidden = !enabled;
        if (!enabled) setPhoneFlashControlsOpen(false);
        showPhoneCaptureIntroForFirstPortraitEntry();
        if (!enabled) resetCameraDecorations();
    }

    function dismissPhoneCaptureIntro() {
        phoneCaptureIntro.hidden = true;
        phoneCaptureIntroDismissed = true;
        phoneCaptureButton.focus();
    }

    phoneCaptureIntro.addEventListener('click', dismissPhoneCaptureIntro);
    phoneCaptureIntro.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            dismissPhoneCaptureIntro();
        }
    });

    function setFrameEnabled(enabled) {
        frameEnabled = enabled;
        document.body.classList.toggle('frame-off', !enabled);
        frameToggle.textContent = `프레임 ${enabled ? 'ON' : 'OFF'}`;
        frameToggle.setAttribute('aria-pressed', String(enabled));
    }

    function toggleFrameColorInversion() {
        frameColorInverted = !frameColorInverted;
        document.body.classList.toggle('frame-color-inverted', frameColorInverted);
    }

    function updateCameraDecoration() {
        cameraDecorations.forEach(({ element }, index) => {
            element.hidden = index !== cameraDecorationIndex;
            element.style.setProperty('--decor-color', decorPatternColor.value);
        });
        const selectedPattern = cameraDecorations[cameraDecorationIndex];
        decorPatternCycle.textContent = `무늬: ${selectedPattern?.label || '없음'}`;
        decorPatternCycle.setAttribute('aria-pressed', String(Boolean(selectedPattern)));
    }

    function resetCameraDecorations() {
        cameraDecorationIndex = cameraDecorations.length;
        decorPatternColor.value = '#ff4fa3';
        updateCameraDecoration();
        decorBackgroundToggle.checked = false;
        decorBackgroundColor.value = '#ffffff';
        lightstickDecorLayer.style.backgroundColor = '';
    }

    decorPatternCycle.addEventListener('click', () => {
        cameraDecorationIndex = (cameraDecorationIndex + 1) % (cameraDecorations.length + 1);
        updateCameraDecoration();
    });
    decorPatternColor.addEventListener('input', updateCameraDecoration);
    decorBackgroundToggle.addEventListener('change', () => {
        lightstickDecorLayer.style.backgroundColor = decorBackgroundToggle.checked
            ? decorBackgroundColor.value
            : '';
    });
    decorBackgroundColor.addEventListener('input', () => {
        if (decorBackgroundToggle.checked) {
            lightstickDecorLayer.style.backgroundColor = decorBackgroundColor.value;
        }
    });

    function closeControlMenu() {
        if (!controlMenu.hidden && controlMenu.classList.contains('is-open')) {
            menuToggleButton.click();
        }
    }

    function closeCaptureCustomizer() {
        if (!captureCustomizer.hidden && captureCustomizer.classList.contains('is-open')) {
            captureCustomizerToggle.click();
        }
    }

    phoneInvertButton.addEventListener('click', () => {
        const isMobileCameraViewport = matchMedia('(pointer: coarse)').matches
            || navigator.maxTouchPoints > 0
            || (innerWidth <= 800 && matchMedia('(orientation: portrait)').matches);
        if (!isMobileCameraViewport) return;
        toggleFrameColorInversion();
    });

    captureModeToggle.addEventListener('click', () => {
        setCaptureMode(true);
        closeControlMenu();
    });
    exitCaptureMode.addEventListener('click', () => {
        setCaptureMode(false);
        closeCaptureCustomizer();
        closeControlMenu();
    });
    frameToggle.addEventListener('click', () => {
        setFrameEnabled(!frameEnabled);
        if (!frameEnabled) setPhoneFlashControlsOpen(false);
    });
    
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
        screenImageLockToggle.title = locked ? '잠금 해제' : '잠금';
        screenImageLayerToggle.textContent = image.dataset.layer === 'back' ? '앞으로' : '뒤로';
        screenImageLayerToggle.setAttribute('aria-label', image.dataset.layer === 'back' ? '앞으로 가져오기' : '뒤로 보내기');
        const hasShadow = image.dataset.shadow !== 'false';
        screenImageShadowToggle.textContent = hasShadow ? '그림자 끄기' : '그림자 켜기';
        screenImageShadowToggle.setAttribute('aria-pressed', String(hasShadow));
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
        if (event.button === 0 && hitImage.dataset.locked !== 'true') {
            activeScreenImageDrag = {
                image: hitImage,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                startLeft: Number.parseFloat(hitImage.style.left) || 0,
                startTop: Number.parseFloat(hitImage.style.top) || 0
            };
            hitImage.classList.add('dragging');
        }
        return;
        }
        if (selectedScreenImage) selectScreenImage(null);
    }, true);

    document.addEventListener('pointermove', (event) => {
        if (!activeScreenImageDrag || event.pointerId !== activeScreenImageDrag.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        const { image, startX, startY, startLeft, startTop } = activeScreenImageDrag;
        image.style.left = `${startLeft + event.clientX - startX}px`;
        image.style.top = `${startTop + event.clientY - startY}px`;
        positionScreenImageControls();
    }, true);

    const finishScreenImageDrag = (event) => {
        if (!activeScreenImageDrag || event.pointerId !== activeScreenImageDrag.pointerId) return;
        activeScreenImageDrag.image.classList.remove('dragging');
        activeScreenImageDrag = null;
    };
    document.addEventListener('pointerup', finishScreenImageDrag, true);
    document.addEventListener('pointercancel', finishScreenImageDrag, true);
    
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
        image.dataset.shadow = 'true';
        image.dataset.locked = 'false';
        image.src = objectUrl;
        image.alt = file.name;
        image.title = '클릭해 조절 · 두 번 클릭해 삭제';
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

    function removeBackgroundImage() {
        backgroundImageLayer.replaceChildren();
        if (backgroundImageUrl) URL.revokeObjectURL(backgroundImageUrl);
        backgroundImageUrl = null;
        backgroundImageToggle.textContent = '백그라운드 이미지 추가';
        backgroundImageInput.value = '';
    }

    backgroundImageToggle.addEventListener('click', () => {
        if (backgroundImageUrl) {
            removeBackgroundImage();
            return;
        }
        backgroundImageInput.click();
    });
    backgroundImageInput.addEventListener('change', () => {
        const [file] = backgroundImageInput.files || [];
        backgroundImageInput.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert('이미지 파일을 선택해 주세요.');
            return;
        }
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.alt = '';
        image.addEventListener('load', () => {
            if (backgroundImageUrl) URL.revokeObjectURL(backgroundImageUrl);
            backgroundImageUrl = objectUrl;
            backgroundImageLayer.replaceChildren(image);
            backgroundImageToggle.textContent = '백그라운드 이미지 삭제';
        }, { once: true });
        image.addEventListener('error', () => {
            URL.revokeObjectURL(objectUrl);
            alert('백그라운드 이미지를 불러오지 못했습니다.');
        }, { once: true });
        image.src = objectUrl;
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
        if (action === 'toggle-shadow') {
        image.dataset.shadow = String(image.dataset.shadow === 'false');
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
        if (image.dataset.shadow !== 'false') {
            context.shadowColor = 'rgba(18, 26, 40, .2)';
            context.shadowBlur = 18;
            context.shadowOffsetY = 8;
        }
        context.drawImage(image, -width / 2, -height / 2, width, height);
        context.restore();
        });
    }

    async function drawCameraDecorations(context, width, height, captureScale) {
        const enabledDecorations = cameraDecorations.filter((_, index) => index === cameraDecorationIndex);
        await Promise.all(enabledDecorations.map(({ image }) => image.decode()));

        if (decorBackgroundToggle.checked) {
            context.fillStyle = decorBackgroundColor.value;
            context.fillRect(0, 0, width, height);
        }

        for (const { image, label } of enabledDecorations) {
            if (!image.naturalWidth || !image.naturalHeight) {
                throw new Error(`${label} 이미지를 불러오지 못했습니다.`);
            }
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = Math.round(width * captureScale);
            maskCanvas.height = Math.round(height * captureScale);
            const maskContext = maskCanvas.getContext('2d');
            if (!maskContext) throw new Error('카메라 장식용 캔버스를 준비하지 못했습니다.');

            const maskScale = Math.max(
                maskCanvas.width / image.naturalWidth,
                maskCanvas.height / image.naturalHeight
            );
            const maskWidth = image.naturalWidth * maskScale;
            const maskHeight = image.naturalHeight * maskScale;
            maskContext.drawImage(
                image,
                (maskCanvas.width - maskWidth) / 2,
                (maskCanvas.height - maskHeight) / 2,
                maskWidth,
                maskHeight
            );
            maskContext.globalCompositeOperation = 'source-in';
            maskContext.fillStyle = decorPatternColor.value;
            maskContext.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
            context.drawImage(maskCanvas, 0, 0, width, height);
        }
    }
    
    async function captureScreen(maxDimension = null, maxPixelCount = null) {
        const width = innerWidth;
        const height = innerHeight;
        const captureScale = Math.min(
        Math.max(devicePixelRatio || 1, 2),
        3,
        8192 / width,
        8192 / height,
        Math.sqrt(40000000 / (width * height)),
        maxPixelCount ? Math.sqrt(maxPixelCount / (width * height)) : Infinity,
        maxDimension ? maxDimension / Math.max(width, height) : Infinity
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
        const backgroundImage = backgroundImageLayer.querySelector('img');
        if (backgroundImage?.complete && backgroundImage.naturalWidth) {
            context.drawImage(backgroundImage, 0, 0, width, height);
        }
        await drawCameraDecorations(context, width, height, captureScale);
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
    
        if (matchMedia('(orientation: portrait)').matches) {
        const phoneTop = document.querySelector('.phone-top');
        const phoneBottom = document.querySelector('.phone-bottom');
        if (frameEnabled && (!phoneTop.complete || !phoneTop.naturalWidth || !phoneBottom.complete || !phoneBottom.naturalWidth)) {
            throw new Error('캡쳐 프레임 이미지를 불러오지 못했습니다.');
        }
        if (frameEnabled) {
            const topHeight = width * phoneTop.naturalHeight / phoneTop.naturalWidth;
            const bottomHeight = width * phoneBottom.naturalHeight / phoneBottom.naturalWidth;
            context.save();
            if (frameColorInverted) context.filter = 'invert(1)';
            const transparentTopRows = 2;
            context.drawImage(
                phoneTop,
                0,
                transparentTopRows,
                phoneTop.naturalWidth,
                phoneTop.naturalHeight - transparentTopRows,
                0,
                0,
                width,
                topHeight
            );
            context.drawImage(phoneBottom, 0, height - bottomHeight, width, bottomHeight);
            context.restore();
        }
        } else if (frameEnabled) {
        const cornerWidth = Math.min(width * 0.32, height * 0.42);
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
            context.save();
            if (frameColorInverted) context.filter = 'invert(1)';
            context.drawImage(frame, x, y, frameWidth, frameHeight);
            context.restore();
        });
        }
    
        return captureCanvas;
    }

    async function downloadCapture(blob, extension) {
        const downloadUrl = URL.createObjectURL(blob);
        const download = document.createElement('a');
        download.href = downloadUrl;
        download.download = `lightstick-capture-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
        document.body.appendChild(download);
        download.click();
        download.remove();
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    }

    function showCaptureAlerts() {
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
    }

    async function withCaptureControlsHidden(callback, hideControls = true) {
        if (hideControls) {
            captureControls.hidden = true;
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        try {
            await callback();
        } finally {
            if (hideControls && captureMode) captureControls.hidden = false;
        }
    }

    async function handleCaptureRequest() {
        try {
            await withCaptureControlsHidden(async () => {
                showCaptureAlerts();
                const canvas = await captureScreen();
                const blob = await new Promise((resolve, reject) => {
                    canvas.toBlob((result) => {
                        if (result) resolve(result);
                        else reject(new Error('캡쳐 이미지를 생성하지 못했습니다.'));
                    }, 'image/png');
                });
                await downloadCapture(blob, 'png');
            });
        } catch (error) {
            console.error('화면 캡쳐에 실패했습니다.', error);
            alert(`화면 캡쳐에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    const gifFrameInterval = 1000 / 8;
    const gifMaxDuration = 5000;
    const gifMaxDimension = 1600;
    const gifMaxPixelCount = 1200000;
    let activeGifRecording = null;

    function updateGifRecordingTimer(recording) {
        if (activeGifRecording !== recording || recording.stopped) return;
        const elapsed = Math.min(performance.now() - recording.startedAt, gifMaxDuration);
        gifRecordingTimer.textContent = `${(elapsed / 1000).toFixed(1)}초`;
        recording.timerFrame = requestAnimationFrame(() => updateGifRecordingTimer(recording));
    }

    function setGifRecordingUi(button, isRecording) {
        button.classList.toggle('is-recording', isRecording);
        if (button === takeCapture) {
            button.textContent = isRecording ? 'GIF 녹화 중 (최대 5초) · 놓으면 저장' : '화면 캡쳐';
        } else {
            button.setAttribute('aria-label', isRecording ? 'GIF 녹화 중, 최대 5초, 놓으면 저장' : '폰 버튼을 눌러 화면 캡처');
        }
        button.title = isRecording ? '최대 5초 녹화합니다. 놓으면 GIF로 저장됩니다' : '화면 캡처 · 길게 누르면 GIF';
    }

    async function recordGif(button, recording) {
        recording.startedAt = performance.now();
        gifRecordingTimer.hidden = false;
        updateGifRecordingTimer(recording);
        setGifRecordingUi(button, true);
        try {
            await withCaptureControlsHidden(async () => {
                showCaptureAlerts();
                const firstFrame = await captureScreen(gifMaxDimension, gifMaxPixelCount);
                const width = firstFrame.width;
                const height = firstFrame.height;
                const frameCanvas = document.createElement('canvas');
                frameCanvas.width = width;
                frameCanvas.height = height;
                const frameContext = frameCanvas.getContext('2d', { willReadFrequently: true });
                if (!frameContext) throw new Error('GIF 프레임을 준비하지 못했습니다.');

                const capturedFrames = [];
                const appendFrame = (canvas) => {
                    frameContext.drawImage(canvas, 0, 0, width, height);
                    capturedFrames.push(frameContext.getImageData(0, 0, width, height));
                };
                appendFrame(firstFrame);
                while (!recording.stopped && performance.now() - recording.startedAt < gifMaxDuration) {
                    await new Promise((resolve) => setTimeout(resolve, gifFrameInterval));
                    if (recording.stopped || performance.now() - recording.startedAt >= gifMaxDuration) break;
                    const canvas = await captureScreen(gifMaxDimension, gifMaxPixelCount);
                    const elapsed = performance.now() - recording.startedAt;
                    if (elapsed >= gifMaxDuration) break;
                    appendFrame(canvas);
                }
                recording.stopped = true;
                cancelAnimationFrame(recording.timerFrame);
                const { palette, colorMap } = createGifPalette(capturedFrames);
                const frames = capturedFrames.map((frame) => quantizeGifFrame(frame, colorMap, palette));
                capturedFrames.length = 0;
                const gifBytes = encodeGif(width, height, frames, palette, Math.floor(gifFrameInterval / 10));
                await downloadCapture(new Blob([gifBytes], { type: 'image/gif' }), 'gif');
            }, false);
        } catch (error) {
            console.error('GIF 저장에 실패했습니다.', error);
            alert(`GIF 저장에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            cancelAnimationFrame(recording.timerFrame);
            gifRecordingTimer.hidden = true;
            setGifRecordingUi(button, false);
            if (activeGifRecording === recording) activeGifRecording = null;
        }
    }

    function startGifRecording(button) {
        const recording = { stopped: false, startedAt: 0, timerFrame: 0 };
        activeGifRecording = recording;
        recording.promise = recordGif(button, recording);
    }

    function stopGifRecording() {
        if (activeGifRecording) activeGifRecording.stopped = true;
    }

    function setupCaptureButton(button) {
        let pressTimer = null;
        let activePointerId = null;
        let longPressStarted = false;
        let suppressClick = false;

        button.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || activePointerId !== null || activeGifRecording) return;
            activePointerId = event.pointerId;
            longPressStarted = false;
            suppressClick = false;
            button.setPointerCapture(event.pointerId);
            pressTimer = setTimeout(() => {
                longPressStarted = true;
                startGifRecording(button);
            }, 500);
        });

        const finishPress = (event) => {
            if (event.pointerId !== activePointerId) return;
            clearTimeout(pressTimer);
            pressTimer = null;
            activePointerId = null;
            suppressClick = event.type === 'pointerup';
            if (longPressStarted) stopGifRecording();
            else if (event.type === 'pointerup') handleCaptureRequest();
        };
        button.addEventListener('pointerup', finishPress);
        button.addEventListener('pointercancel', finishPress);
        button.addEventListener('click', (event) => {
            if (event.detail === 0) {
                handleCaptureRequest();
                return;
            }
            if (suppressClick) {
                suppressClick = false;
                event.preventDefault();
            }
        });
    }

    setupCaptureButton(takeCapture);
    setupCaptureButton(phoneCaptureButton);
    
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
        const blinkPhase = (t * blinkSpeed) % 1;
        const isHardBlinkOn = blinkPhase < 0.5;
        const softBlinkIntensity = (1 - Math.cos(blinkPhase * Math.PI * 2)) / 2;
        const lightColorInputs = phoneLightColors.querySelectorAll('input[type="color"]');
        const colorIndex = blinkEnabled
            ? Math.floor(t * blinkSpeed) % lightColorInputs.length
            : 0;
        const activeColor = lightColorInputs[colorIndex]?.value || phoneLightColorInput.value;
        if (activeColor !== `#${lightColor.getHexString()}`) applyLightColor(activeColor);
        const blinkIntensity = !blinkEnabled
            ? 1
            : softBlink
                ? (lightColorInputs.length > 1
                    ? 0.2 + softBlinkIntensity * 0.8
                    : softBlinkIntensity)
                : (lightColorInputs.length === 1 && !isHardBlinkOn ? 0 : 1);
        const isLightVisible = lightOn && blinkIntensity > 0;
        updateSpecialEffects({ lightOn: isLightVisible, darkModeOn, elapsedTime: t });
    
        if (isLightVisible) {
        crystalMat.emissiveIntensity = (7 + Math.sin(t * 3.2) * 1) * blinkIntensity;
        crystalAuraMat.opacity = (0.95 + Math.sin(t * 2.4) * 0.05) * blinkIntensity;
        crystalLight.intensity = (8 + Math.sin(t * 2.4) * 1) * blinkIntensity;
        const auraSize = 4.1 + Math.sin(t * 2.4) * 0.28;
        crystalAura.scale.set(auraSize, auraSize, 1);
        const isCompactViewport = innerWidth <= 600;
        reflections.forEach((reflection, index) => {
            const shimmer = 0.55 + Math.sin(t * 2.1 + reflection.userData.phase) * 0.35;
            const isSoftenedOut = isCompactViewport && index % 2 === 1;
            reflection.material.opacity = isSoftenedOut
                ? 0
                : reflection.userData.baseOpacity * shimmer * (isCompactViewport ? 0.65 : 1) * blinkIntensity;
            const pulse = 0.85 + shimmer * 0.3;
            reflection.scale.setScalar(
                reflection.userData.baseSize * pulse * (isCompactViewport ? 1.6 : 1)
            );
        });
        } else {
            crystalMat.emissiveIntensity = 0;
            crystalAuraMat.opacity = 0;
            crystalLight.intensity = 0;
            reflections.forEach((reflection) => {
                reflection.material.opacity = 0;
            });
        }
    
        renderer.render(scene, camera);
    }
    
    animate();
    
    addEventListener('resize', () => {
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(innerWidth, innerHeight);
        showPhoneCaptureIntroForFirstPortraitEntry();
        positionScreenImageControls();
    });
}
