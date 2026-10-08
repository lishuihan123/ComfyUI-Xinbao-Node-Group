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
    root.style.cssText = "width:100%;height:100%;box-sizing:border-box;padding:8px;display:flex;flex-direction:column;gap:8px;color:#ddd;font:13px sans-serif";
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
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.style.cssText = "width:100%;flex:1;min-height:90px;border:1px solid #666;border-radius:6px;cursor:pointer";
    swatch.title = "点击选择填充色";
    root.append(swatch);
    const status = document.createElement("div"); root.append(status);
    const refresh = () => {
        const isTransparent = !!transparent?.value;
        toggle.checked = isTransparent;
        picker.disabled = swatch.disabled = color.disabled = isTransparent;
        label.style.opacity = isTransparent ? "0.4" : "1";
        if (isTransparent) {
            swatch.style.background = "repeating-conic-gradient(#999 0% 25%, #ddd 0% 50%) 0 0 / 20px 20px";
            swatch.title = "全透明背景；连接保存图像输出 PNG";
            status.textContent = "透明 RGBA · 填充色已停用 · 保存为 PNG";
            return;
        }
        swatch.style.backgroundImage = "none";
        swatch.title = "点击选择填充色";
        let value = String(color.value).trim().replace(/^#/, "");
        if (/^[0-9a-f]{3}$/i.test(value)) value = [...value].map(c => c+c).join("");
        const valid = /^[0-9a-f]{6}$/i.test(value);
        if (valid) { picker.value = "#"+value; swatch.style.backgroundColor = "#"+value; }
        status.textContent = valid ? `填充色 #${value.toUpperCase()}` : "请输入 #RGB 或 #RRGGBB 色号";
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
    swatch.addEventListener("click", () => picker.click());
    for (const event of ["pointerdown", "click", "keydown"]) root.addEventListener(event, e => e.stopPropagation());
    const callback = color.callback;
    color.callback = function () { callback?.apply(this, arguments); refresh(); };
    if (transparent) {
        const transparentCallback = transparent.callback;
        transparent.callback = function () { transparentCallback?.apply(this, arguments); refresh(); };
    }
    node.addDOMWidget("xinbao_color_picker", "div", root, {serialize:false, hideOnZoom:false, getMinHeight:()=>215});
    node.setSize([360, 400]);
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
