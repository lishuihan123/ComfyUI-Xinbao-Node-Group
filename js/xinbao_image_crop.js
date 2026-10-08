import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { cropSize, imageRect, alignedPosition } from "./crop_geometry.js";

let ratioOptions = [];

function setupCrop(node) {
    if (node.__xinbaoCrop) return;
    const widget = node.widgets?.find(w => w.name === "crop_state");
    if (!widget) return;
    widget.type = "converted-widget";
    widget.hidden = true;
    widget.computeSize = () => [0, -4];
    widget.serializeValue = () => widget.value;
    const readState = () => ({custom_width: 1, custom_height: 1, ...JSON.parse(widget.value)});
    let state = readState();
    let source = null, sourceWidth = 0, sourceHeight = 0, sourceKey = "";
    let requestId = 0, geometry = null, drag = null;
    const root = document.createElement("div");
    root.className = "xinbao-crop-editor";
    root.style.cssText = "width:100%;height:100%;box-sizing:border-box;padding:10px;display:flex;flex-direction:column;gap:10px;color:#eee;background:#20232b;font:13px sans-serif;overflow:auto";
    const controls = [];
    const make = (tag, parent, text) => {
        const el = document.createElement(tag);
        if (text) el.textContent = text;
        parent.append(el);
        return el;
    };
    const row = () => {
        const el = make("div", root);
        el.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap";
        return el;
    };
    const styleControl = el => {
        el.style.cssText = "box-sizing:border-box;min-width:0;border:1px solid #596475;border-radius:5px;background:#303642;color:#fff;padding:6px";
        controls.push(el);
        return el;
    };
    const optionsRow = row();
    make("span", optionsRow, "裁切比例");
    const ratioWrap = make("div", optionsRow);
    ratioWrap.style.cssText = "position:relative";
    const ratio = styleControl(make("button", ratioWrap));
    ratio.type = "button";
    ratio.setAttribute("role", "combobox");
    ratio.setAttribute("aria-label", "裁切比例");
    ratio.setAttribute("aria-expanded", "false");
    ratio.style.cssText += ";display:flex;align-items:center;gap:10px;min-width:122px;cursor:pointer";
    const ratioText = make("span", ratio);
    const ratioIcon = make("span", ratio);
    make("span", ratio, "▾");
    const ratioMenu = make("div", ratioWrap);
    ratioMenu.setAttribute("role", "listbox");
    ratioMenu.setAttribute("aria-label", "裁切比例列表");
    ratioMenu.style.cssText = "display:none;position:absolute;left:0;top:100%;z-index:1000;width:190px;max-height:360px;overflow-y:auto;padding:6px;background:#252b36;border:1px solid #6b7c93;border-radius:6px;box-shadow:0 8px 24px #000a";
    ratioMenu.addEventListener("wheel", event => event.stopPropagation());
    const shape = (element, p, q) => {
        element.replaceChildren();
        element.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:30px;height:24px;flex:none";
        const rect = make("span", element);
        rect.style.cssText = `display:block;box-sizing:border-box;border:1.5px solid #a4dfff;background:#a4dfff18;border-radius:1px;width:${24 * p / Math.max(p, q)}px;height:${24 * q / Math.max(p, q)}px`;
    };
    function closeRatios() { ratioMenu.style.display = "none"; ratio.setAttribute("aria-expanded", "false"); }
    let lastGroup = "";
    const ratioButtons = [];
    for (const name of [...ratioOptions].sort((a, b) => {
        const [aw, ah] = a.split(":").map(Number), [bw, bh] = b.split(":").map(Number);
        return aw / ah - bw / bh;
    }).concat("custom")) {
        const [p, q] = name === "custom" ? [1, 1] : name.split(":").map(Number);
        const group = name === "custom" ? "自定义" : p < q ? "竖图 · 窄长 → 方正" : p === q ? "正方形" : "横图 · 方正 → 宽扁";
        if (group !== lastGroup) {
            make("div", ratioMenu, group).style.cssText = "padding:7px 6px 3px;color:#94a5ba;font-size:11px";
            lastGroup = group;
        }
        const option = make("button", ratioMenu);
        option.type = "button"; option.dataset.value = name;
        option.setAttribute("role", "option");
        option.setAttribute("aria-label", name === "custom" ? "自定义" : name);
        option.style.cssText = "display:flex;align-items:center;justify-content:space-between;width:100%;padding:5px 10px;color:#eee;border:0;border-radius:4px;background:transparent;cursor:pointer";
        make("span", option, name === "custom" ? "自定义" : name);
        if (name === "custom") make("span", option, "✎");
        else shape(make("span", option), p, q);
        option.addEventListener("click", () => { commit({ratio:name}); closeRatios(); ratio.focus(); });
        option.addEventListener("keydown", event => {
            const index = ratioButtons.indexOf(option);
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault(); ratioButtons[(index + (event.key === "ArrowDown" ? 1 : -1) + ratioButtons.length) % ratioButtons.length].focus();
            }
            if (event.key === "Escape") { closeRatios(); ratio.focus(); }
        });
        ratioButtons.push(option);
    }
    const openRatios = () => {
        if (state.locked) return;
        ratioMenu.style.display = "block"; ratio.setAttribute("aria-expanded", "true");
        const active = ratioButtons.find(b => b.dataset.value === state.ratio);
        active?.focus({preventScroll:true});
    };
    ratio.addEventListener("click", () => ratioMenu.style.display === "none" ? openRatios() : closeRatios());
    ratio.addEventListener("keydown", e => { if (e.key === "ArrowDown") { e.preventDefault(); openRatios(); } });
    const outsideRatio = event => { if (!ratioWrap.contains(event.target)) closeRatios(); };
    document.addEventListener("pointerdown", outsideRatio, true);
    ratioWrap.addEventListener("focusout", e => { if (!ratioWrap.contains(e.relatedTarget)) closeRatios(); });
    make("span", optionsRow, "宽高倍数");
    const multiple = styleControl(make("select", optionsRow));
    for (const n of [8, 16, 32]) make("option", multiple, String(n));
    const customRow = row();
    make("span", customRow, "自定义比例（宽 : 高）");
    const customFields = {};
    for (const key of ["custom_width", "custom_height"]) {
        if (key === "custom_height") make("span", customRow, ":");
        const input = styleControl(make("input", customRow));
        input.type = "number"; input.min = "0.001"; input.step = "any";
        input.style.width = "85px";
        input.title = key === "custom_width" ? "比例宽" : "比例高";
        customFields[key] = input;
        input.addEventListener("change", () => {
            const value = Number(input.value);
            if (!Number.isFinite(value) || value <= 0) return refresh();
            commit({[key]: value});
        });
    }
    const pixelsRow = row();
    pixelsRow.style.cssText = "display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px";
    const pixelFields = {};
    for (const [key, label] of [["long", "长边"], ["short", "短边"], ["width", "宽"], ["height", "高"]]) {
        const box = make("label", pixelsRow, label + " px");
        box.style.cssText = "display:flex;flex-direction:column;gap:5px";
        const input = styleControl(make("input", box));
        input.type = "number"; input.min = 8; input.max = 16384; input.step = 1;
        input.style.width = "100%";
        pixelFields[key] = input;
        input.addEventListener("change", () => {
            if (state.locked) return;
            const n = Number(input.value);
            if (!Number.isFinite(n) || n <= 0) return refresh();
            commit({edge: key, pixels: n});
        });
    }
    const sizeLabel = make("div", root);
    sizeLabel.style.cssText = "color:#9fb1c9;font-size:12px;min-height:16px";
    const canvas = make("canvas", root);
    canvas.width = 720; canvas.height = 460;
    canvas.style.cssText = "width:100%;height:340px;min-height:340px;display:block;background:#111318;border-radius:6px;touch-action:none;cursor:grab";
    const alignRow = row();
    make("span", alignRow, "九宫格对齐");
    const alignGrid = make("div", alignRow);
    alignGrid.setAttribute("role", "group"); alignGrid.setAttribute("aria-label", "九宫格对齐");
    alignGrid.style.cssText = "display:grid;grid-template-columns:repeat(3,30px);gap:3px";
    const alignmentButtons = [];
    const alignLabels = ["左上", "上中", "右上", "左中", "居中", "右中", "左下", "下中", "右下"];
    const arrows = ["↖", "↑", "↗", "←", "●", "→", "↙", "↓", "↘"];
    for (let index = 0; index < 9; index++) {
        const column = index % 3, rowIndex = Math.floor(index / 3);
        const button = styleControl(make("button", alignGrid, arrows[index]));
        button.type = "button"; button.title = alignLabels[index];
        button.setAttribute("aria-label", alignLabels[index]);
        button.style.cssText += ";width:30px;height:28px;padding:0;cursor:pointer";
        button.addEventListener("click", () => {
            if (!source || state.locked) return;
            const [w, h] = cropSize(state);
            commit(alignedPosition(state, w, h, sourceWidth, sourceHeight, column, rowIndex));
        });
        alignmentButtons.push({button, column, rowIndex});
    }
    make("span", alignRow, "仅移动图片，不改变缩放").style.cssText = "color:#abb6c7;font-size:12px";
    const actions = row();
    const button = (text, fn, lockable = true) => {
        const el = styleControl(make("button", actions, text));
        el.type = "button";
        el.style.cursor = "pointer";
        if (!lockable) controls.pop();
        el.addEventListener("click", e => { e.stopPropagation(); fn(); });
        return el;
    };
    button("居中铺满", () => commit({zoom: 1, x: 0, y: 0}));
    button("完整显示", () => {
        if (!source) return;
        const [w, h] = cropSize(state);
        commit({zoom: Math.min(w / sourceWidth, h / sourceHeight) / Math.max(w / sourceWidth, h / sourceHeight), x: 0, y: 0});
    });
    button("刷新图片", () => syncSource(true), false);
    const lock = button("🔓 未锁定", () => {
        state.locked = !state.locked;
        save(); refresh();
    }, false);
    const zoomRow = row();
    make("span", zoomRow, "图片缩放 %");
    const zoom = styleControl(make("input", zoomRow));
    zoom.type = "number"; zoom.min = 1; zoom.max = 2000; zoom.step = 1;
    zoom.style.width = "85px";
    zoom.addEventListener("change", () => commit({zoom: Math.min(20, Math.max(0.01, Number(zoom.value) / 100))}));
    make("span", zoomRow, "空白补色");
    const color = styleControl(make("input", zoomRow));
    color.type = "color"; color.style.cssText += ";width:42px;height:32px;padding:2px";
    const hex = styleControl(make("input", zoomRow));
    hex.type = "text"; hex.style.width = "92px"; hex.maxLength = 7;
    color.addEventListener("input", () => commit({background: color.value}));
    hex.addEventListener("change", () => {
        if (/^#[0-9a-f]{6}$/i.test(hex.value)) commit({background: hex.value});
        else refresh();
    });
    const hint = make("div", root, "拖动图片移动 · 滚轮缩放 · 白框内为输出 · 点击锁固定全部设置");
    hint.style.cssText = "font-size:12px;color:#abb6c7;line-height:1.6";
    const sourceStatus = make("div", root);
    sourceStatus.style.cssText = "font-size:12px;color:#ffcf89;min-height:16px";

    function save() {
        widget.value = JSON.stringify(state);
        node.graph?.setDirtyCanvas?.(true, true);
    }
    function commit(change) {
        if (state.locked) return;
        const next = {...state, ...change};
        const size = cropSize(next);
        if (size.some(v => !Number.isFinite(v) || v > 16384)) {
            sourceStatus.textContent = "输出单边不能超过 16384 像素，请减小输入值。";
            return refresh();
        }
        if (![next.zoom, next.x, next.y].every(Number.isFinite)) return refresh();
        state = next;
        save(); refresh();
    }
    function refresh() {
        const [w, h] = cropSize(state);
        ratioText.textContent = state.ratio === "custom" ? "自定义" : state.ratio;
        const [rw, rh] = state.ratio === "custom" ? [state.custom_width, state.custom_height] : state.ratio.split(":").map(Number);
        shape(ratioIcon, rw, rh);
        for (const option of ratioButtons) {
            const selected = option.dataset.value === state.ratio;
            option.setAttribute("aria-selected", String(selected));
            option.style.background = selected ? "#3c5878" : "transparent";
        }
        if (state.locked) closeRatios();
        multiple.value = state.multiple;
        customRow.style.display = state.ratio === "custom" ? "flex" : "none";
        for (const [key, input] of Object.entries(customFields)) input.value = state[key];
        const sizes = {width: w, height: h, long: Math.max(w, h), short: Math.min(w, h)};
        for (const [key, input] of Object.entries(pixelFields)) {
            input.value = sizes[key];
            input.style.borderColor = state.edge === key ? "#65d9ff" : "#596475";
        }
        zoom.value = +(state.zoom * 100).toFixed(2);
        color.value = hex.value = state.background;
        sizeLabel.textContent = `输出 ${w} × ${h} px · 宽高均为 ${state.multiple} 的倍数（比例取近似值）`;
        for (const c of controls) c.disabled = !!state.locked;
        for (const {button, column, rowIndex} of alignmentButtons) {
            button.disabled = !!state.locked || !source;
            const aligned = source ? alignedPosition(state, w, h, sourceWidth, sourceHeight, column, rowIndex) : null;
            const active = aligned && Math.abs(state.x - aligned.x) < 1e-7 && Math.abs(state.y - aligned.y) < 1e-7;
            button.setAttribute("aria-pressed", String(!!active));
            button.style.background = active ? "#3c5878" : "#303642";
        }
        lock.textContent = state.locked ? "🔒 已锁定 · 点击解锁" : "🔓 未锁定 · 点击锁定";
        lock.style.background = state.locked ? "#884655" : "#303642";
        canvas.style.cursor = state.locked ? "default" : "grab";
        draw();
    }
    function draw() {
        const ctx = canvas.getContext("2d");
        const cw = canvas.width, ch = canvas.height;
        const [w, h] = cropSize(state);
        const s = Math.min((cw - 100) / w, (ch - 64) / h);
        const fx = (cw - w * s) / 2, fy = (ch - h * s) / 2;
        geometry = {w, h, s, fx, fy};
        ctx.clearRect(0, 0, cw, ch);
        ctx.fillStyle = "#111318"; ctx.fillRect(0, 0, cw, ch);
        ctx.fillStyle = state.background; ctx.fillRect(fx, fy, w * s, h * s);
        if (source) {
            const r = imageRect(state, w, h, sourceWidth, sourceHeight);
            ctx.drawImage(source, fx + r.left * s, fy + r.top * s, r.width * s, r.height * s);
        }
        ctx.fillStyle = "rgba(0,0,0,.65)";
        ctx.fillRect(0, 0, cw, fy); ctx.fillRect(0, fy + h * s, cw, ch);
        ctx.fillRect(0, fy, fx, h * s); ctx.fillRect(fx + w * s, fy, cw, h * s);
        ctx.strokeStyle = state.locked ? "#ffbf70" : "white";
        ctx.lineWidth = 2; ctx.strokeRect(fx, fy, w * s, h * s);
        ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineWidth = 1;
        for (const part of [1 / 3, 2 / 3]) {
            ctx.beginPath(); ctx.moveTo(fx + w * s * part, fy); ctx.lineTo(fx + w * s * part, fy + h * s); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(fx, fy + h * s * part); ctx.lineTo(fx + w * s, fy + h * s * part); ctx.stroke();
        }
        if (!source) {
            ctx.fillStyle = "#aaa"; ctx.font = "16px sans-serif"; ctx.textAlign = "center";
            ctx.fillText("连接图像后预览，或先运行一次获取上游图片", cw / 2, ch / 2);
        }
    }
    const point = event => {
        const box = canvas.getBoundingClientRect();
        return [(event.clientX - box.left) * canvas.width / box.width, (event.clientY - box.top) * canvas.height / box.height];
    };
    canvas.addEventListener("pointerdown", event => {
        if (state.locked || !source || event.button !== 0) return;
        event.preventDefault(); event.stopPropagation();
        drag = {point: point(event), x: state.x, y: state.y};
        canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", event => {
        if (!drag || state.locked) return;
        const p = point(event);
        commit({x: drag.x + (p[0] - drag.point[0]) / (geometry.w * geometry.s), y: drag.y + (p[1] - drag.point[1]) / (geometry.h * geometry.s)});
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(name, () => { drag = null; });
    canvas.addEventListener("wheel", event => {
        event.preventDefault(); event.stopPropagation();
        if (state.locked || !source) return;
        const newZoom = Math.min(20, Math.max(0.01, state.zoom * Math.exp(-event.deltaY * 0.0015)));
        const factor = newZoom / state.zoom;
        const p = point(event);
        const px = (p[0] - geometry.fx) / (geometry.w * geometry.s) - 0.5;
        const py = (p[1] - geometry.fy) / (geometry.h * geometry.s) - 0.5;
        commit({zoom: newZoom, x: px - (px - state.x) * factor, y: py - (py - state.y) * factor});
    }, {passive: false});
    multiple.addEventListener("change", () => commit({multiple: Number(multiple.value)}));
    for (const name of ["pointerdown", "click", "dblclick", "keydown"]) root.addEventListener(name, e => e.stopPropagation());

    async function loadSource(ref, key, force) {
        if (sourceKey === key && !force) return;
        sourceKey = key;
        source = null; draw();
        const ticket = ++requestId;
        const url = api.apiURL("/view?" + new URLSearchParams({filename: ref.filename, type: ref.type || "input", subfolder: ref.subfolder || "", channel: ref.channel || "rgba", t: String(Date.now())}));
        const image = new Image();
        image.onload = () => {
            if (ticket !== requestId) return;
            source = image; sourceWidth = ref.width || image.naturalWidth; sourceHeight = ref.height || image.naturalHeight;
            sourceStatus.textContent = `输入 ${sourceWidth} × ${sourceHeight} · 批量输入使用相同裁切，预览第一张`;
            refresh();
        };
        image.onerror = () => { if (ticket === requestId) { sourceKey = ""; sourceStatus.textContent = "预览图片不可用，请运行节点后刷新预览。"; } };
        image.src = url;
    }
    function originNode() {
        const input = node.inputs?.find(i => i.name === "image");
        const link = node.graph?.links?.[input?.link];
        return link ? node.graph.getNodeById(link.origin_id) : null;
    }
    function syncSource(force = false) {
        let origin = originNode();
        const seen = new Set();
        while (origin?.type === "Reroute" && !seen.has(origin.id)) {
            seen.add(origin.id);
            const link = node.graph?.links?.[origin.inputs?.[0]?.link];
            origin = link ? node.graph.getNodeById(link.origin_id) : null;
        }
        if (!origin) {
            source = null; sourceKey = ""; requestId++;
            sourceStatus.textContent = "请连接 IMAGE 输入。"; draw(); return;
        }
        if (origin.comfyClass === "LoadImage" || origin.type === "LoadImage") {
            const path = origin.widgets?.find(w => w.name === "image")?.value;
            if (typeof path === "string" && path) {
                // LoadImage exposes RGB separately from MASK; preview that same RGB input.
                const annotated = path.match(/\s*\[(input|output|temp)\]$/);
                const filename = annotated ? path.slice(0, annotated.index) : path;
                loadSource({filename, type: annotated?.[1] || "input", channel: "rgb"}, `input:${path}`, force);
                return;
            }
        }
        const cached = node.properties?.xinbaoCropSource;
        if (cached && node.properties.xinbaoCropOrigin === originNode()?.id) {
            loadSource(cached, cached.filename, force);
        } else {
            source = null; sourceKey = ""; requestId++;
            sourceStatus.textContent = "此输入来自处理节点，请先运行一次取得真实输入预览。"; draw();
        }
    }
    const executed = node.onExecuted;
    node.onExecuted = function (message) {
        executed?.apply(this, arguments);
        const ref = message?.crop_source?.[0];
        if (ref) {
            node.properties ||= {};
            node.properties.xinbaoCropSource = ref;
            node.properties.xinbaoCropOrigin = originNode()?.id;
            loadSource(ref, ref.filename, true);
        }
    };
    const connectionChanged = node.onConnectionsChange;
    node.onConnectionsChange = function () {
        const result = connectionChanged?.apply(this, arguments);
        setTimeout(() => syncSource(), 0);
        return result;
    };
    node.addDOMWidget("xinbao_crop_editor", "div", root, {serialize: false, hideOnZoom: false, getMinHeight: () => 730});
    node.setSize([560, 870]);
    const observer = new ResizeObserver(() => {
        const box = canvas.getBoundingClientRect();
        if (box.width && box.height) { canvas.width = Math.round(box.width * 2); canvas.height = Math.round(box.height * 2); draw(); }
    });
    observer.observe(canvas);
    const timer = setInterval(() => { if (root.isConnected) syncSource(); }, 1200);
    const removed = node.onRemoved;
    node.onRemoved = function () { clearInterval(timer); observer.disconnect(); document.removeEventListener("pointerdown", outsideRatio, true); requestId++; removed?.apply(this, arguments); };
    node.__xinbaoCrop = {restore() { state = readState(); refresh(); syncSource(); }, root};
    refresh(); setTimeout(syncSource, 0);
}

app.registerExtension({
    name: "xinbao.image.crop",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === "XinbaoImageCrop") ratioOptions = nodeData.input.required.crop_state[1].xinbao_crop_ratios;
    },
    nodeCreated(node) {
        if (node.comfyClass === "XinbaoImageCrop" || node.type === "XinbaoImageCrop") setupCrop(node);
    },
    loadedGraphNode(node) {
        if (node.comfyClass === "XinbaoImageCrop" || node.type === "XinbaoImageCrop") {
            setupCrop(node); node.__xinbaoCrop?.restore();
        }
    },
});
