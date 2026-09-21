import { app } from "../../scripts/app.js";

const NODE_CLASS = "XinbaoPintu";
const DEFAULT_STATE = { x: 0.5, y: 0.5, scale: 0.35, rotation: 0 };
const MIN_SCALE = 0.008;
const MAX_SCALE = 8;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function opacityFraction(percent) {
    const value = clamp(Number(percent || 0), 0, 100) / 100;
    return Math.pow(value, 2.2);
}

function parseState(raw) {
    try {
        const data = JSON.parse(raw || "{}");
        return {
            x: Number.isFinite(+data.x) ? +data.x : DEFAULT_STATE.x,
            y: Number.isFinite(+data.y) ? +data.y : DEFAULT_STATE.y,
            scale: clamp(Number.isFinite(+data.scale) ? +data.scale : DEFAULT_STATE.scale, MIN_SCALE, MAX_SCALE),
            rotation: Number.isFinite(+data.rotation) ? +data.rotation : DEFAULT_STATE.rotation,
        };
    } catch {
        return { ...DEFAULT_STATE };
    }
}

function setWidgetValue(node, widget, value) {
    if (!widget) return;
    widget.value = value;
    if (typeof widget.callback === "function") {
        widget.callback(value, app.canvas, node, app.canvas?.graph_mouse);
    }
    node.graph?.setDirtyCanvas?.(true, true);
}

function hideWidget(widget) {
    if (!widget) return;
    widget.type = "xinbao_hidden";
    widget.hidden = true;
    widget.disabled = true;
    widget.computeSize = () => [0, -4];
    widget.serializeValue = () => widget.value;
}

function injectStyles() {
    if (document.getElementById("xinbao-pintu-styles")) return;
    const style = document.createElement("style");
    style.id = "xinbao-pintu-styles";
    style.textContent = `
        .xinbao-pintu-root { width: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; padding: 6px; color: var(--fg-color, #ddd); font-family: sans-serif; overflow: hidden; }
        .xinbao-pintu-toolbar { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .xinbao-pintu-toolbar.mode4 { grid-template-columns: 1fr 1fr 1fr 1fr; }
        .xinbao-pintu-slider-row { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center; font-size: 12px; }
        .xinbao-pintu-slider { width: 100%; }
        .xinbao-pintu-btn { min-height: 32px; border: 1px solid rgba(255,255,255,.18); border-radius: 7px; background: rgba(255,255,255,.08); color: inherit; cursor: pointer; font-weight: 600; }
        .xinbao-pintu-btn:hover { background: rgba(255,255,255,.14); }
        .xinbao-pintu-btn.locked { background: rgba(255,80,100,.24); border-color: rgba(255,100,120,.65); }
        .xinbao-pintu-btn.active { background: rgba(53,212,255,.18); border-color: rgba(53,212,255,.8); }
        .xinbao-pintu-btn:disabled { opacity: .45; cursor: not-allowed; }
        .xinbao-pintu-stage { position: relative; overflow: hidden; border: 1px solid rgba(255,255,255,.16); background-color: #202020; background-image: linear-gradient(45deg,#292929 25%,transparent 25%),linear-gradient(-45deg,#292929 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#292929 75%),linear-gradient(-45deg,transparent 75%,#292929 75%); background-size: 20px 20px; background-position: 0 0,0 10px,10px -10px,-10px 0; height: 420px; min-height: 420px; max-height: 420px; width: 100%; }
        .xinbao-pintu-canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: default; }
        .xinbao-pintu-status { min-height: 18px; font-size: 12px; line-height: 1.35; opacity: .88; text-align: center; }
    `;
    document.head.appendChild(style);
}

function parseViewRefFromUrl(src) {
    if (!src) return null;
    try {
        const url = new URL(src, window.location.href);
        const filename = url.searchParams.get("filename") || "";
        const subfolder = url.searchParams.get("subfolder") || "";
        const type = url.searchParams.get("type") || "input";
        if (!filename) return null;
        return { filename, subfolder, type };
    } catch {
        return null;
    }
}

function refToUrl(ref) {
    if (!ref?.filename) return "";
    const params = new URLSearchParams({
        filename: ref.filename,
        subfolder: ref.subfolder || "",
        type: ref.type || "input",
    });
    params.set("t", String(Date.now()));
    return `./view?${params.toString()}`;
}

function loadBrowserImageFromRef(ref) {
    return new Promise((resolve, reject) => {
        if (!ref?.filename) {
            resolve(null);
            return;
        }
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`无法预览图片：${ref.filename}`));
        image.src = refToUrl(ref);
    });
}

function detectTransparentPixels(image) {
    if (!image?.naturalWidth || !image?.naturalHeight) return false;
    const c = document.createElement("canvas");
    c.width = image.naturalWidth;
    c.height = image.naturalHeight;
    const cctx = c.getContext("2d", { willReadFrequently: true });
    if (!cctx) return false;
    cctx.drawImage(image, 0, 0);
    const data = cctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 250) return true;
    }
    return false;
}

function getOriginNode(node, inputIndex) {
    const input = node.inputs?.[inputIndex];
    if (!input || input.link == null) return null;
    const link = node.graph?.links?.[input.link];
    if (!link) return null;
    return node.graph?.getNodeById?.(link.origin_id) || null;
}

function extractRefFromUpstreamNode(originNode) {
    if (!originNode) return null;
    const preview = originNode.imgs?.[0];
    const previewSrc = typeof preview === "string" ? preview : preview?.src;
    const previewRef = parseViewRefFromUrl(previewSrc);
    if (previewRef) return previewRef;

    const imageWidget = originNode.widgets?.find((w) => w.name === "image") || originNode.widgets?.[0];
    const value = typeof imageWidget?.value === "string" ? imageWidget.value : "";
    if (value) {
        const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
        const slash = normalized.lastIndexOf("/");
        return {
            filename: slash >= 0 ? normalized.slice(slash + 1) : normalized,
            subfolder: slash >= 0 ? normalized.slice(0, slash) : "",
            type: "input",
        };
    }
    return null;
}

function setupEditor(node) {
    if (node.__xinbaoPintuReady) return;
    node.__xinbaoPintuReady = true;
    injectStyles();

    const widgetByName = (name) => node.widgets?.find((w) => w.name === name);
    const outlineSizeWidget = widgetByName("outline_size");
    const outlineOpacityWidget = widgetByName("outline_opacity");
    const stateWidget = widgetByName("transform_json");
    const lockWidget = widgetByName("locked");
    const bgRefWidget = widgetByName("background_ref");
    const productRefWidget = widgetByName("product_ref");
    const paintLayerWidget = widgetByName("paint_layer");
    [stateWidget, lockWidget, bgRefWidget, productRefWidget, paintLayerWidget].forEach(hideWidget);

    // 保留内部英文键名以兼容旧工作流，但界面全部显示中文。
    if (node.inputs?.[0]) {
        node.inputs[0].label = "背景图";
        node.inputs[0].localized_name = "背景图";
    }
    if (node.inputs?.[1]) {
        node.inputs[1].label = "产品图";
        node.inputs[1].localized_name = "产品图";
    }
    if (node.outputs?.[0]) {
        node.outputs[0].label = "拼合图";
        node.outputs[0].localized_name = "拼合图";
    }
    if (node.outputs?.[1]) {
        node.outputs[1].label = "产品遮罩";
        node.outputs[1].localized_name = "产品遮罩";
    }
    if (outlineSizeWidget) {
        outlineSizeWidget.label = "描边大小";
        outlineSizeWidget.options = { ...(outlineSizeWidget.options || {}), label: "描边大小" };
    }
    if (outlineOpacityWidget) {
        outlineOpacityWidget.label = "透明度";
        outlineOpacityWidget.options = { ...(outlineOpacityWidget.options || {}), label: "透明度" };
    }

    let state = parseState(stateWidget?.value);
    let locked = Boolean(lockWidget?.value);
    let editorMode = "move";
    let backgroundImage = null;
    let overlayImage = null;
    let overlayHasTransparentPixels = false;
    let loadedBgRefJson = "";
    let loadedProductRefJson = "";
    let currentBgSignature = typeof bgRefWidget?.value === "string" ? bgRefWidget.value : "";
    let currentProductSignature = typeof productRefWidget?.value === "string" ? productRefWidget.value : "";
    let viewRect = { x: 0, y: 0, w: 1, h: 1 };
    let overlayGeometry = null;
    let interaction = null;
    let pendingRedraw = false;
    let paintCanvas = null;
    let cursorPoint = null;
    let paintCtx = null;

    const root = document.createElement("div");
    root.className = "xinbao-pintu-root";
    root.innerHTML = `
        <div class="xinbao-pintu-toolbar">
            <button class="xinbao-pintu-btn" data-action="refresh">读取输入图</button>
            <button class="xinbao-pintu-btn" data-action="lock">🔓 锁定位置</button>
        </div>
        <div class="xinbao-pintu-toolbar">
            <button class="xinbao-pintu-btn" data-action="reset">恢复居中</button>
            <button class="xinbao-pintu-btn" data-action="fit">适配画布</button>
        </div>
        <div class="xinbao-pintu-toolbar mode4">
            <button class="xinbao-pintu-btn" data-mode="move">移动</button>
            <button class="xinbao-pintu-btn" data-mode="brush">画笔</button>
            <button class="xinbao-pintu-btn" data-mode="eraser">橡皮</button>
            <button class="xinbao-pintu-btn" data-action="clear-paint">清空</button>
        </div>
        <div class="xinbao-pintu-slider-row">
            <span>笔触大小</span>
            <input class="xinbao-pintu-slider" type="range" min="1" max="200" step="1" value="40" data-role="brush-size">
            <span data-role="brush-size-value">40</span>
        </div>
        <div class="xinbao-pintu-stage"><canvas class="xinbao-pintu-canvas"></canvas></div>
        <div class="xinbao-pintu-status">画布尺寸：-- × --</div>
    `;

    const canvas = root.querySelector("canvas");
    const stage = root.querySelector(".xinbao-pintu-stage");
    const status = root.querySelector(".xinbao-pintu-status");
    const refreshButton = root.querySelector('[data-action="refresh"]');
    const lockButton = root.querySelector('[data-action="lock"]');
    const resetButton = root.querySelector('[data-action="reset"]');
    const fitButton = root.querySelector('[data-action="fit"]');
    const clearPaintButton = root.querySelector('[data-action="clear-paint"]');
    const modeButtons = Array.from(root.querySelectorAll('[data-mode]'));
    const brushSizeInput = root.querySelector('[data-role="brush-size"]');
    const brushSizeValue = root.querySelector('[data-role="brush-size-value"]');
    const ctx = canvas.getContext("2d");

    function updateMetaLine() {
        if (backgroundImage?.naturalWidth > 0 && backgroundImage?.naturalHeight > 0) {
            status.textContent = `画布尺寸：${backgroundImage.naturalWidth} × ${backgroundImage.naturalHeight}`;
        } else {
            status.textContent = "画布尺寸：-- × --";
        }
    }

    function setStatus() {
        updateMetaLine();
    }

    function scheduleDraw() {
        if (pendingRedraw) return;
        pendingRedraw = true;
        requestAnimationFrame(() => {
            pendingRedraw = false;
            draw();
        });
    }

    function saveState() {
        clampStateWithinBounds();
        setWidgetValue(node, stateWidget, JSON.stringify({
            x: +state.x.toFixed(7),
            y: +state.y.toFixed(7),
            scale: +state.scale.toFixed(7),
            rotation: +state.rotation.toFixed(4),
        }));
    }

    function savePaintLayer() {
        if (!paintCanvas) {
            setWidgetValue(node, paintLayerWidget, "");
            return;
        }
        setWidgetValue(node, paintLayerWidget, paintCanvas.toDataURL("image/png"));
    }

    function initPaintCanvas(loadExisting = true) {
        if (!backgroundImage?.naturalWidth || !backgroundImage?.naturalHeight) {
            paintCanvas = null;
            paintCtx = null;
            setWidgetValue(node, paintLayerWidget, "");
            return;
        }
        paintCanvas = document.createElement("canvas");
        paintCanvas.width = backgroundImage.naturalWidth;
        paintCanvas.height = backgroundImage.naturalHeight;
        paintCtx = paintCanvas.getContext("2d");
        if (loadExisting && paintLayerWidget?.value) {
            const img = new Image();
            img.onload = () => {
                paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
                paintCtx.drawImage(img, 0, 0, paintCanvas.width, paintCanvas.height);
                scheduleDraw();
            };
            img.src = paintLayerWidget.value;
        } else {
            setWidgetValue(node, paintLayerWidget, "");
        }
    }

    function clearPaintCanvas() {
        if (!paintCtx || !paintCanvas) return;
        paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
        savePaintLayer();
        scheduleDraw();
    }

    function updateLockUI() {
        lockButton.textContent = locked ? "🔒 已锁定（点此解锁）" : "🔓 锁定位置";
        lockButton.classList.toggle("locked", locked);
        resetButton.disabled = locked;
        fitButton.disabled = locked;
        canvas.style.cursor = locked ? "not-allowed" : "default";
        setWidgetValue(node, lockWidget, locked);
        scheduleDraw();
    }

    function updateModeUI() {
        modeButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.mode === editorMode));
        brushSizeInput.disabled = editorMode === "move" || locked;
    }

    function fitScale() {
        if (!backgroundImage || !overlayImage) return DEFAULT_STATE.scale;
        const ratio = overlayImage.naturalHeight / overlayImage.naturalWidth;
        const bgRatio = viewRect.h / viewRect.w;
        const candidate = Math.min(0.42, 0.42 * (bgRatio / Math.max(0.0001, ratio)));
        return clamp(candidate, 0.03, getMaxScaleForRotation(0));
    }

    let editorMinHeight = 680;
    const FIXED_NODE_WIDTH = 560;

    function layoutStageFromBackground() {
        requestAnimationFrame(() => {
            // clientWidth is the unscaled layout width. getBoundingClientRect() changes with
            // ComfyUI zoom and would make the canvas ratio wrong or repeatedly resize.
            const stageWidth = Math.max(1, Math.round(stage.clientWidth || root.clientWidth || (FIXED_NODE_WIDTH - 24)));
            let desiredH = 420;
            if (backgroundImage?.naturalWidth > 0 && backgroundImage?.naturalHeight > 0) {
                desiredH = Math.max(1, Math.round(stageWidth * backgroundImage.naturalHeight / backgroundImage.naturalWidth));
            }

            stage.style.height = `${desiredH}px`;
            stage.style.minHeight = `${desiredH}px`;
            stage.style.maxHeight = `${desiredH}px`;
            stage.style.aspectRatio = "auto";

            editorMinHeight = desiredH + 230;
            const desiredNodeHeight = editorMinHeight + 55;
            const currentHeight = Number(node.size?.[1] || 0);
            if (Math.abs(currentHeight - desiredNodeHeight) > 2 || Number(node.size?.[0] || 0) !== FIXED_NODE_WIDTH) {
                node.setSize?.([FIXED_NODE_WIDTH, desiredNodeHeight]);
            }
            requestAnimationFrame(() => scheduleDraw());
        });
    }

    function resetTransform() {
        if (locked) return;
        state = { x: 0.5, y: 0.5, scale: fitScale(), rotation: 0 };
        saveState();
        scheduleDraw();
    }

    function applyBestFit() {
        if (locked || !backgroundImage || !overlayImage) return;
        state.scale = getMaxScaleForRotation(state.rotation);
        state.x = 0.5;
        state.y = 0.5;
        saveState();
        scheduleDraw();
    }

    function canvasPoint(event) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left) * canvas.width / rect.width,
            y: (event.clientY - rect.top) * canvas.height / rect.height,
        };
    }

    function previewToOutput(point) {
        if (!backgroundImage?.naturalWidth || !backgroundImage?.naturalHeight) return { x: 0, y: 0 };
        const px = clamp((point.x - viewRect.x) / Math.max(1, viewRect.w), 0, 1);
        const py = clamp((point.y - viewRect.y) / Math.max(1, viewRect.h), 0, 1);
        return {
            x: px * backgroundImage.naturalWidth,
            y: py * backgroundImage.naturalHeight,
        };
    }

    function rotatedPoint(cx, cy, x, y, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return { x: cx + x * cos - y * sin, y: cy + x * sin + y * cos };
    }

    function rotatedBounds(scale, rotationDeg) {
        if (!backgroundImage || !overlayImage) return { bboxW: 0, bboxH: 0, w: 0, h: 0 };
        const w = scale * viewRect.w;
        const h = w * overlayImage.naturalHeight / overlayImage.naturalWidth;
        const angle = rotationDeg * Math.PI / 180;
        const c = Math.abs(Math.cos(angle));
        const s = Math.abs(Math.sin(angle));
        return {
            w,
            h,
            bboxW: w * c + h * s,
            bboxH: w * s + h * c,
        };
    }

    function getMaxScaleForRotation(rotationDeg) {
        if (!backgroundImage || !overlayImage) return MAX_SCALE;
        const ratio = overlayImage.naturalHeight / overlayImage.naturalWidth;
        const angle = rotationDeg * Math.PI / 180;
        const c = Math.abs(Math.cos(angle));
        const s = Math.abs(Math.sin(angle));
        const limitX = 1 / Math.max(0.000001, c + ratio * s);
        const limitY = (viewRect.h / viewRect.w) / Math.max(0.000001, s + ratio * c);
        return Math.max(MIN_SCALE, Math.min(MAX_SCALE, limitX, limitY));
    }

    function clampStateWithinBounds() {
        if (!backgroundImage || !overlayImage || !viewRect.w || !viewRect.h) return;
        state.scale = clamp(state.scale, MIN_SCALE, MAX_SCALE);
        const rb = rotatedBounds(state.scale, state.rotation);
        // Allow up to 80% of the product to extend outside the frame.
        // That means at least 20% remains inside, so the center may move
        // outward by 30% of the rotated bounding-box size beyond each edge.
        const marginX = 0.3 * (rb.bboxW / viewRect.w);
        const marginY = 0.3 * (rb.bboxH / viewRect.h);
        state.x = clamp(state.x, -marginX, 1 + marginX);
        state.y = clamp(state.y, -marginY, 1 + marginY);
    }

    function geometry() {
        if (!backgroundImage || !overlayImage) return null;
        clampStateWithinBounds();
        const cx = viewRect.x + state.x * viewRect.w;
        const cy = viewRect.y + state.y * viewRect.h;
        const w = state.scale * viewRect.w;
        const h = w * overlayImage.naturalHeight / overlayImage.naturalWidth;
        const angle = state.rotation * Math.PI / 180;
        const corners = [
            rotatedPoint(cx, cy, -w / 2, -h / 2, angle),
            rotatedPoint(cx, cy, w / 2, -h / 2, angle),
            rotatedPoint(cx, cy, w / 2, h / 2, angle),
            rotatedPoint(cx, cy, -w / 2, h / 2, angle),
        ];
        const rotateHandle = rotatedPoint(cx, cy, 0, -h / 2 - 34, angle);
        const topCenter = rotatedPoint(cx, cy, 0, -h / 2, angle);
        return { cx, cy, w, h, angle, corners, rotateHandle, topCenter };
    }

    function drawPlaceholder(text) {
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.65)";
        ctx.font = `${Math.max(14, canvas.width / 32)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        ctx.restore();
    }

    function drawPreviewPaint(targetCtx) {
        const opacity = opacityFraction(outlineOpacityWidget?.value ?? 50);
        if (!paintCanvas || opacity <= 0) return;
        targetCtx.save();
        targetCtx.globalAlpha = opacity;
        targetCtx.drawImage(paintCanvas, viewRect.x, viewRect.y, viewRect.w, viewRect.h);
        targetCtx.restore();
    }

    function drawPreviewOutline(targetCtx, g) {
        const outputSize = Math.max(0, Number(outlineSizeWidget?.value || 0));
        const opacity = opacityFraction(outlineOpacityWidget?.value ?? 50);
        const previewScale = backgroundImage?.naturalWidth ? (viewRect.w / backgroundImage.naturalWidth) : 1;
        const size = Math.max(0, outputSize * previewScale);
        if (!overlayImage || size <= 0 || opacity <= 0) return;

        if (!overlayHasTransparentPixels) {
            targetCtx.save();
            targetCtx.translate(g.cx, g.cy);
            targetCtx.rotate(g.angle);
            targetCtx.strokeStyle = `rgba(255,255,255,${opacity})`;
            targetCtx.lineWidth = Math.max(1, size * 2);
            targetCtx.lineJoin = "miter";
            targetCtx.lineCap = "butt";
            targetCtx.strokeRect(-g.w / 2, -g.h / 2, g.w, g.h);
            targetCtx.restore();
            return;
        }

        const radius = Math.max(1, Math.round(size));
        const pad = Math.max(2, radius + 4);
        const temp = document.createElement("canvas");
        temp.width = Math.max(2, Math.ceil(g.w + pad * 2));
        temp.height = Math.max(2, Math.ceil(g.h + pad * 2));
        const tctx = temp.getContext("2d");
        if (!tctx) return;

        const drawX = pad;
        const drawY = pad;
        for (let oy = -radius; oy <= radius; oy++) {
            for (let ox = -radius; ox <= radius; ox++) {
                tctx.drawImage(overlayImage, drawX + ox, drawY + oy, g.w, g.h);
            }
        }
        tctx.globalCompositeOperation = "source-in";
        tctx.fillStyle = `rgba(255,255,255,${opacity})`;
        tctx.fillRect(0, 0, temp.width, temp.height);
        tctx.globalCompositeOperation = "destination-out";
        tctx.drawImage(overlayImage, drawX, drawY, g.w, g.h);
        tctx.globalCompositeOperation = "source-over";

        targetCtx.save();
        targetCtx.translate(g.cx, g.cy);
        targetCtx.rotate(g.angle);
        targetCtx.drawImage(temp, -temp.width / 2, -temp.height / 2);
        targetCtx.restore();
    }


    function draw() {
        updateMetaLine();

        const rect = stage.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const wantedW = Math.max(2, Math.round(rect.width * dpr));
        const wantedH = Math.max(2, Math.round(rect.height * dpr));
        if (canvas.width !== wantedW || canvas.height !== wantedH) {
            canvas.width = wantedW;
            canvas.height = wantedH;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        viewRect = { x: 0, y: 0, w: canvas.width, h: canvas.height };

        if (!backgroundImage) {
            drawPlaceholder("等待背景 IMAGE 输入");
            overlayGeometry = null;
            return;
        }

        const scene = document.createElement("canvas");
        scene.width = canvas.width;
        scene.height = canvas.height;
        const sctx = scene.getContext("2d");
        if (!sctx) return;

        sctx.drawImage(backgroundImage, viewRect.x, viewRect.y, viewRect.w, viewRect.h);

        if (!overlayImage) {
            ctx.drawImage(scene, 0, 0);
            drawPlaceholder("等待产品 IMAGE 输入");
            overlayGeometry = null;
            return;
        }

        overlayGeometry = geometry();
        const g = overlayGeometry;
        drawPreviewPaint(sctx);
        drawPreviewOutline(sctx, g);
        sctx.save();
        sctx.translate(g.cx, g.cy);
        sctx.rotate(g.angle);
        sctx.drawImage(overlayImage, -g.w / 2, -g.h / 2, g.w, g.h);
        sctx.restore();
        ctx.drawImage(scene, 0, 0);

        if (!locked && (editorMode === "brush" || editorMode === "eraser") && cursorPoint) {
            ctx.save();
            const scaleX = viewRect.w / backgroundImage.naturalWidth;
            const radius = Number(brushSizeInput.value || 40) * scaleX / 2;
            ctx.beginPath();
            ctx.arc(cursorPoint.x, cursorPoint.y, radius, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        }

        if (!locked && editorMode === "move") {
            ctx.save();
            ctx.strokeStyle = "#35d4ff";
            ctx.fillStyle = "#ffffff";
            ctx.lineWidth = Math.max(2, canvas.width / 320);
            ctx.setLineDash([10, 7]);
            ctx.beginPath();
            ctx.moveTo(g.corners[0].x, g.corners[0].y);
            for (let i = 1; i < g.corners.length; i++) ctx.lineTo(g.corners[i].x, g.corners[i].y);
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(g.topCenter.x, g.topCenter.y);
            ctx.lineTo(g.rotateHandle.x, g.rotateHandle.y);
            ctx.stroke();
            const r = Math.max(7, canvas.width / 75);
            for (const p of g.corners) {
                ctx.beginPath();
                ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
                ctx.fill();
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(g.rotateHandle.x, g.rotateHandle.y, r * 1.05, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
    }

    function distance(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function isPointInsideViewRect(point) {
        return point.x >= viewRect.x && point.x <= viewRect.x + viewRect.w && point.y >= viewRect.y && point.y <= viewRect.y + viewRect.h;
    }

    function hitTest(point) {
        const g = overlayGeometry;
        if (!g || locked || editorMode !== "move") return null;
        const threshold = Math.max(14, canvas.width / 45);
        if (distance(point, g.rotateHandle) <= threshold) return "rotate";
        if (g.corners.some((p) => distance(point, p) <= threshold)) return "resize";

        const dx = point.x - g.cx;
        const dy = point.y - g.cy;
        const cos = Math.cos(-g.angle);
        const sin = Math.sin(-g.angle);
        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;
        if (Math.abs(lx) <= g.w / 2 && Math.abs(ly) <= g.h / 2) return "move";
        return null;
    }

    function updateCursor(point) {
        cursorPoint = point;
        if (locked) {
            canvas.style.cursor = "not-allowed";
            return;
        }
        if (editorMode === "brush") {
            canvas.style.cursor = "crosshair";
            return;
        }
        if (editorMode === "eraser") {
            canvas.style.cursor = "cell";
            return;
        }
        const hit = hitTest(point);
        canvas.style.cursor = hit === "move" ? "move" : hit === "resize" ? "nwse-resize" : hit === "rotate" ? "crosshair" : "default";
    }

    function beginPaintAt(point, erase) {
        if (!paintCtx || !paintCanvas || !isPointInsideViewRect(point)) return false;
        const out = previewToOutput(point);
        paintCtx.save();
        paintCtx.globalCompositeOperation = erase ? "destination-out" : "source-over";
        paintCtx.strokeStyle = "rgba(255,255,255,1)";
        paintCtx.fillStyle = "rgba(255,255,255,1)";
        paintCtx.lineCap = "round";
        paintCtx.lineJoin = "round";
        paintCtx.lineWidth = Math.max(1, Number(brushSizeInput.value || 40));
        paintCtx.beginPath();
        paintCtx.moveTo(out.x, out.y);
        paintCtx.lineTo(out.x, out.y);
        paintCtx.stroke();
        paintCtx.restore();
        savePaintLayer();
        scheduleDraw();
        return true;
    }

    function continuePaintTo(point, erase) {
        if (!paintCtx || !paintCanvas) return;
        const out = previewToOutput(point);
        paintCtx.save();
        paintCtx.globalCompositeOperation = erase ? "destination-out" : "source-over";
        paintCtx.strokeStyle = "rgba(255,255,255,1)";
        paintCtx.lineCap = "round";
        paintCtx.lineJoin = "round";
        paintCtx.lineWidth = Math.max(1, Number(brushSizeInput.value || 40));
        paintCtx.lineTo(out.x, out.y);
        paintCtx.stroke();
        paintCtx.restore();
        scheduleDraw();
    }

    canvas.addEventListener("pointerdown", (event) => {
        if (locked || !overlayGeometry) return;
        const point = canvasPoint(event);
        cursorPoint = point;

        if ((editorMode === "brush" || editorMode === "eraser") && isPointInsideViewRect(point)) {
            event.preventDefault();
            event.stopPropagation();
            if (!beginPaintAt(point, editorMode === "eraser")) return;
            canvas.setPointerCapture(event.pointerId);
            interaction = { mode: "paint", erase: editorMode === "eraser", pointerId: event.pointerId };
            return;
        }

        const mode = hitTest(point);
        if (!mode) return;
        event.preventDefault();
        event.stopPropagation();
        canvas.setPointerCapture(event.pointerId);
        interaction = {
            mode,
            pointerId: event.pointerId,
            startPoint: point,
            startState: { ...state },
            startDistance: Math.max(1, Math.hypot(point.x - overlayGeometry.cx, point.y - overlayGeometry.cy)),
            startAngle: Math.atan2(point.y - overlayGeometry.cy, point.x - overlayGeometry.cx),
        };
    });

    canvas.addEventListener("pointermove", (event) => {
        const point = canvasPoint(event);
        if (!interaction || interaction.pointerId !== event.pointerId) {
            updateCursor(point);
            scheduleDraw();
            return;
        }
        event.preventDefault();
        event.stopPropagation();

        if (interaction.mode === "paint") {
            cursorPoint = point;
            continuePaintTo(point, interaction.erase);
            return;
        }

        const g = overlayGeometry;
        if (!g) return;
        if (interaction.mode === "move") {
            state.x = interaction.startState.x + (point.x - interaction.startPoint.x) / viewRect.w;
            state.y = interaction.startState.y + (point.y - interaction.startPoint.y) / viewRect.h;
        } else if (interaction.mode === "resize") {
            const currentDistance = Math.max(1, Math.hypot(point.x - g.cx, point.y - g.cy));
            state.scale = interaction.startState.scale * currentDistance / interaction.startDistance;
        } else if (interaction.mode === "rotate") {
            const angle = Math.atan2(point.y - g.cy, point.x - g.cx);
            state.rotation = interaction.startState.rotation + (angle - interaction.startAngle) * 180 / Math.PI;
        }
        saveState();
        scheduleDraw();
    });

    function finishPointer(event) {
        if (!interaction || interaction.pointerId !== event.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        try { canvas.releasePointerCapture(event.pointerId); } catch {}
        if (interaction.mode === "paint") {
            savePaintLayer();
        } else {
            saveState();
        }
        interaction = null;
        scheduleDraw();
    }
    canvas.addEventListener("pointerup", finishPointer);
    canvas.addEventListener("pointercancel", finishPointer);
    canvas.addEventListener("pointerleave", () => {
        cursorPoint = null;
        scheduleDraw();
    });

    canvas.addEventListener("wheel", (event) => {
        if (locked || !overlayGeometry || editorMode !== "move") return;
        const point = canvasPoint(event);
        if (!isPointInsideViewRect(point)) return;
        event.preventDefault();
        event.stopPropagation();
        state.scale = state.scale * Math.exp(-event.deltaY * 0.0012);
        saveState();
        scheduleDraw();
    }, { passive: false });

    async function syncFromInputs(forceReset = false) {
        state = parseState(stateWidget?.value);
        locked = Boolean(lockWidget?.value);

        const bgOrigin = getOriginNode(node, 0);
        const productOrigin = getOriginNode(node, 1);
        const bgRef = extractRefFromUpstreamNode(bgOrigin);
        const productRef = extractRefFromUpstreamNode(productOrigin);

        if (!bgRef) {
            backgroundImage = null;
            loadedBgRefJson = "";
            currentBgSignature = "";
            setWidgetValue(node, bgRefWidget, "");
            paintCanvas = null;
            paintCtx = null;
        }
        if (!productRef) {
            overlayImage = null;
            overlayHasTransparentPixels = false;
            loadedProductRefJson = "";
            currentProductSignature = "";
            setWidgetValue(node, productRefWidget, "");
        }

        try {
            const bgRefJson = bgRef ? JSON.stringify(bgRef) : "";
            const productRefJson = productRef ? JSON.stringify(productRef) : "";
            const bgChanged = !!bgRefJson && bgRefJson !== currentBgSignature;
            const productChanged = !!productRefJson && productRefJson !== currentProductSignature;

            if (bgRefJson && bgRefJson !== loadedBgRefJson) {
                backgroundImage = await loadBrowserImageFromRef(bgRef);
                loadedBgRefJson = bgRefJson;
                currentBgSignature = bgRefJson;
                setWidgetValue(node, bgRefWidget, bgRefJson);
            }
            if (productRefJson && productRefJson !== loadedProductRefJson) {
                overlayImage = await loadBrowserImageFromRef(productRef);
                overlayHasTransparentPixels = detectTransparentPixels(overlayImage);
                loadedProductRefJson = productRefJson;
                currentProductSignature = productRefJson;
                setWidgetValue(node, productRefWidget, productRefJson);
            }

            if (backgroundImage) {
                initPaintCanvas(!(bgChanged || forceReset));
                if (forceReset) clearPaintCanvas();
            }

            updateLockUI();
            updateModeUI();
            layoutStageFromBackground();
            if (backgroundImage && overlayImage) {
                if (bgChanged || productChanged || forceReset) {
                    state = { x: 0.5, y: 0.5, scale: DEFAULT_STATE.scale, rotation: 0 };
                    requestAnimationFrame(() => resetTransform());
                }
            }
            setStatus();
            scheduleDraw();
        } catch (error) {
            console.error("[心宝❤构图] 读取输入失败", error);
            setStatus();
            scheduleDraw();
        }
    }

    refreshButton.addEventListener("click", (event) => {
        event.stopPropagation();
        syncFromInputs(true);
    });
    lockButton.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!backgroundImage || !overlayImage) return;
        locked = !locked;
        updateLockUI();
        updateModeUI();
    });
    resetButton.addEventListener("click", (event) => { event.stopPropagation(); resetTransform(); });
    fitButton.addEventListener("click", (event) => { event.stopPropagation(); applyBestFit(); });
    clearPaintButton.addEventListener("click", (event) => {
        event.stopPropagation();
        if (locked) return;
        clearPaintCanvas();
    });

    modeButtons.forEach((btn) => btn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (locked) return;
        editorMode = btn.dataset.mode;
        updateModeUI();
        scheduleDraw();
    }));

    brushSizeInput.addEventListener("input", () => {
        brushSizeValue.textContent = brushSizeInput.value;
    });

    if (outlineSizeWidget) {
        const oldCb = outlineSizeWidget.callback;
        outlineSizeWidget.callback = function () {
            oldCb?.apply(this, arguments);
            scheduleDraw();
        };
    }
    if (outlineOpacityWidget) {
        const oldCb = outlineOpacityWidget.callback;
        outlineOpacityWidget.callback = function () {
            oldCb?.apply(this, arguments);
            scheduleDraw();
        };
    }

    node.addDOMWidget("xinbao_pintu_editor", "div", root, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => editorMinHeight,
    });
    node.setSize?.([FIXED_NODE_WIDTH, 860]);

    node.__xinbaoPintuSync = syncFromInputs;
    setTimeout(syncFromInputs, 0);

    const originalConnectionsChange = node.onConnectionsChange;
    node.onConnectionsChange = function () {
        const result = originalConnectionsChange?.apply(this, arguments);
        setTimeout(() => node.__xinbaoPintuSync?.(), 0);
        return result;
    };

    const originalRemoved = node.onRemoved;
    node.onRemoved = function () {
        originalRemoved?.apply(this, arguments);
    };
}

app.registerExtension({
    name: "xinbao.pintu.editor",
    nodeCreated(node) {
        if (node.comfyClass === NODE_CLASS || node.type === NODE_CLASS) setupEditor(node);
    },
    loadedGraphNode(node) {
        if (node.comfyClass === NODE_CLASS || node.type === NODE_CLASS) {
            setupEditor(node);
            setTimeout(() => node.__xinbaoPintuSync?.(), 0);
        }
    },
});
