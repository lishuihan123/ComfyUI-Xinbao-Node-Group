import { app } from "../../scripts/app.js";

function setupPanel(node) {
    if (node.__xinbaoColorPanel) return;
    const color = node.widgets?.find(w => w.name === "color");
    const transparent = node.widgets?.find(w => w.name === "transparent_background");
    if (!color) return;
    for (const widget of node.widgets) {
        widget.label = {width: "面板宽度", height: "面板高度", color: "填充色 HEX"}[widget.name] || widget.label;
    }
    const root = document.createElement("div");
    root.className = "xinbao-color-panel";
    root.style.cssText = "width:100%;box-sizing:border-box;padding:4px 8px;display:flex;flex-direction:column;gap:6px;color:#ddd;font:13px sans-serif";
    const toggleLabel = document.createElement("label");
    toggleLabel.style.cssText = "display:flex;align-items:center;gap:8px;cursor:pointer";
    const toggle = document.createElement("input"); toggle.type = "checkbox";
    toggle.style.cssText = "appearance:auto;width:16px;height:16px;flex:none;accent-color:#65bfff;cursor:pointer";
    toggleLabel.append(toggle, "PNG 透明背景（勾选后填充色无效）"); root.append(toggleLabel);
    if (transparent) {
        transparent.type = "converted-widget"; transparent.hidden = true;
        transparent.computeSize = () => [0, -4];
        transparent.serializeValue = () => !!transparent.value;
    }
    const label = document.createElement("label");
    label.textContent = "点击色块打开颜色盘";
    label.style.cssText = "display:flex;align-items:center;gap:12px;cursor:pointer";
    const picker = document.createElement("input");
    picker.type = "color";
    picker.style.cssText = "width:64px;height:36px;padding:0;border:none;background:none;cursor:pointer";
    label.append(picker); root.append(label);
    const refresh = () => {
        const isTransparent = !!transparent?.value;
        toggle.checked = isTransparent;
        picker.disabled = color.disabled = isTransparent;
        label.style.opacity = isTransparent ? "0.4" : "1";
        if (isTransparent) {
            root.title = "透明 RGBA · 填充色已停用 · 保存为 PNG";
            return;
        }
        let value = String(color.value).trim().replace(/^#/, "");
        if (/^[0-9a-f]{3}$/i.test(value)) value = [...value].map(c => c+c).join("");
        const valid = /^[0-9a-f]{6}$/i.test(value);
        if (valid) picker.value = "#"+value;
        root.title = valid ? "" : "请输入 #RGB 或 #RRGGBB 色号";
    };
    toggle.addEventListener("change", () => {
        if (!transparent) return;
        transparent.value = toggle.checked;
        transparent.callback?.(transparent.value); refresh(); node.graph?.setDirtyCanvas?.(true, true);
    });
    picker.addEventListener("input", () => {
        color.value = picker.value.toUpperCase();
        color.callback?.(color.value); refresh(); node.graph?.setDirtyCanvas?.(true, true);
    });
    for (const event of ["pointerdown", "click", "keydown"]) root.addEventListener(event, e => e.stopPropagation());
    const callback = color.callback;
    color.callback = function () { callback?.apply(this, arguments); refresh(); };
    if (transparent) {
        const transparentCallback = transparent.callback;
        transparent.callback = function () { transparentCallback?.apply(this, arguments); refresh(); };
    }
    for (const name of ["width", "height", "color", "transparent_background"]) {
        const widget = node.widgets.find((item) => item.name === name);
        if (!widget) continue;
        const original = widget.callback;
        widget.callback = function () {
            const result = original?.apply(this, arguments);
            for (const target of node.graph?._nodes || []) {
                if (!target.__xinbaoPintuSync) continue;
                const backgroundLink = node.graph.links?.[target.inputs?.[0]?.link];
                if (backgroundLink?.origin_id === node.id) void target.__xinbaoPintuSync();
            }
            return result;
        };
    }
    node.addDOMWidget("xinbao_color_picker", "div", root, {serialize:false, hideOnZoom:false, getMinHeight:()=>72, getMaxHeight:()=>72});
    const compact = () => node.setSize([Math.max(360, node.size?.[0] || 360), node.computeSize()[1]]);
    compact();
    const originalConfigure = node.onConfigure;
    node.onConfigure = function () {
        const result = originalConfigure?.apply(this, arguments);
        refresh();
        compact();
        return result;
    };
    node.__xinbaoColorPanel = {refresh};
    refresh();
}

app.registerExtension({
    name: "xinbao.color.panel",
    nodeCreated(node) { if (node.comfyClass === "XinbaoColorPanel" || node.type === "XinbaoColorPanel") setupPanel(node); },
    loadedGraphNode(node) {
        if (node.comfyClass === "XinbaoColorPanel" || node.type === "XinbaoColorPanel") {
            setupPanel(node); node.__xinbaoColorPanel?.refresh();
        }
    },
});
