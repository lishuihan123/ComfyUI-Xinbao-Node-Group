import { app } from "/scripts/app.js";

app.registerExtension({
    name: "Xinbao.XiaohongshuOptions",
    async nodeCreated(node) {
        if (node.comfyClass !== "XiaohongshuOptions") return;

        const modeWidget = node.widgets?.find((widget) => widget.name === "用途");
        if (!modeWidget) return;

        const originalComputeSize = new WeakMap();

        function setWidgetVisible(widget, visible) {
            if (!widget) return;
            if (!originalComputeSize.has(widget)) {
                originalComputeSize.set(widget, widget.computeSize);
            }
            widget.hidden = !visible;
            widget.computeSize = visible
                ? originalComputeSize.get(widget)
                : () => [0, -4];
        }

        function updateVisibility() {
            const isStreetMode = modeWidget.value === "小红书街拍裂变";

            for (const widget of node.widgets || []) {
                if (["产品", "模特相似度"].includes(widget.name)) {
                    setWidgetVisible(widget, !isStreetMode);
                } else {
                    setWidgetVisible(widget, true);
                }
            }

            const computedSize = node.computeSize?.();
            if (Array.isArray(computedSize) && computedSize.length >= 2) {
                node.setSize?.([node.size[0], computedSize[1]]);
            }
            node.graph?.setDirtyCanvas(true, true);
        }

        const originalCallback = modeWidget.callback;
        modeWidget.callback = function (...args) {
            originalCallback?.apply(this, args);
            updateVisibility();
        };

        setTimeout(updateVisibility, 100);
    },
});
