import { app } from "/scripts/app.js";

const CLASS = "XinbaoPerspectiveControl";

function attachPanel(node) {
    if (node._perspectivePanel) return;
    const widgets = ["rotation", "height", "distance"].map(name => node.widgets.find(w => w.name === name));
    // Migrate old saved workflows to the four explicit height labels.
    const heightWidget = widgets.find(w => w.name === "height");
    if (heightWidget?.value === "垂直") heightWidget.value = "顶";
    const frame = document.createElement("iframe");
    let contentHeight = 500;
    frame.src = new URL("./perspective_preview/index.html?v=marblewoman20261101", import.meta.url).href;
    frame.title = "心宝透视调节：石膏视角预览";
    frame.style.cssText = `width:100%;height:${contentHeight}px;border:0;border-radius:12px;background:#161d27;display:block;`;
    const fit = () => {
        frame.style.height = `${contentHeight}px`;
        node.setSize([Math.max(480, node.size[0]), node.computeSize()[1]]);
        node.graph?.setDirtyCanvas(true, true);
    };
    const send = () => frame.contentWindow?.postMessage({
        type: "xinbao-perspective-state",
        state: Object.fromEntries(widgets.map(w => [w.name, String(w.value)])),
    }, location.origin);
    const receive = event => {
        if (event.source !== frame.contentWindow || event.origin !== location.origin) return;
        if (event.data?.type === "xinbao-perspective-resize") {
            const height = Number(event.data.height);
            if (Number.isFinite(height) && height >= 300 && height <= 1000) {
                contentHeight = Math.ceil(height);
                fit();
            }
            return;
        }
        if (event.data?.type === "xinbao-perspective-ready") send();
        if (event.data?.type !== "xinbao-perspective-change") return;
        const state = event.data.state;
        for (const w of widgets) {
            if (w.options.values.includes(state?.[w.name])) {
                w.value = state[w.name];
                w.callback?.(w.value);
            }
        }
        node.graph?.setDirtyCanvas(true, true);
    };
    for (const w of widgets) {
        w.type = "converted-widget";
        w.hidden = true;
        w.computeSize = () => [0, -4];
        w.draw = () => {};
        const original = w.callback;
        w.callback = function (...args) { original?.apply(this, args); send(); };
    }
    const panel = node.addDOMWidget("perspective_preview", "iframe", frame, {
        serialize: false, hideOnZoom: false,
        getMinHeight: () => contentHeight, getMaxHeight: () => contentHeight,
    });
    panel.computeSize = width => [width, contentHeight];
    panel.serialize = false;
    window.addEventListener("message", receive);
    frame.addEventListener("load", send);
    node._perspectivePanel = {send, frame};
    const oldConfigure = node.onConfigure;
    node.onConfigure = function (...args) {
        oldConfigure?.apply(this, args);
        queueMicrotask(() => {send(); fit();});
    };
    const oldRemoved = node.onRemoved;
    node.onRemoved = function (...args) {
        window.removeEventListener("message", receive);
        frame.remove();
        oldRemoved?.apply(this, args);
    };
    fit();
}

app.registerExtension({
    name: "Xinbao.PerspectiveControl",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== CLASS) return;
        const original = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function (...args) {
            const result = original?.apply(this, args);
            attachPanel(this);
            return result;
        };
    },
    loadedGraphNode(node) { if (node.comfyClass === CLASS) attachPanel(node); },
});
