import { app } from "../../scripts/app.js";

const NODE_TYPE = "XinbaoLoraLoader";
const SHARE_LABEL = "点击查看更多分享";
const SHARE_URL = "https://space.bilibili.com/470042957";
const COMPACT_WIDTH = 300;

function applyCompactSize(node) {
    const size = node.computeSize();
    node.setSize([Math.max(COMPACT_WIDTH, size[0]), size[1]]);
    node.setDirtyCanvas?.(true, true);
}

function scheduleCompactSize(node) {
    applyCompactSize(node);
    requestAnimationFrame(() => applyCompactSize(node));
}

function installCompactSizeHook(node) {
    if (node.__xinbaoLoraCompactSizeHook) return;
    node.__xinbaoLoraCompactSizeHook = true;

    const originalConfigure = node.onConfigure;
    node.onConfigure = function () {
        const result = originalConfigure?.apply(this, arguments);
        scheduleCompactSize(this);
        return result;
    };

    const originalAdded = node.onAdded;
    node.onAdded = function () {
        const result = originalAdded?.apply(this, arguments);
        scheduleCompactSize(this);
        return result;
    };
}

function updateWidgets(node) {
    const nameWidget = node.widgets?.find((widget) => widget.name === "lora_name");
    const strengthWidget = node.widgets?.find((widget) => widget.name === "lora_strength");

    if (nameWidget) nameWidget.label = "LoRA名称";
    if (strengthWidget) strengthWidget.label = "LoRA强度";

    if (!node.widgets?.some((widget) => widget.name === SHARE_LABEL)) {
        const shareWidget = node.addWidget("button", SHARE_LABEL, null, () => {
            window.open(SHARE_URL, "_blank", "noopener,noreferrer");
        });
        shareWidget.options ??= {};
        shareWidget.options.serialize = false;
    }

    installCompactSizeHook(node);
    scheduleCompactSize(node);
}

app.registerExtension({
    name: "xinbao.lora.loader",
    nodeCreated(node) {
        if (node.comfyClass !== NODE_TYPE && node.type !== NODE_TYPE) return;
        updateWidgets(node);
    },
    loadedGraphNode(node) {
        if (node.comfyClass !== NODE_TYPE && node.type !== NODE_TYPE) return;
        updateWidgets(node);
    },
});
