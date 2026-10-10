import { app } from "../../scripts/app.js";
import { sliderState, valueAtIndex } from "./number_slider_math.js";

function setupSlider(node) {
    if (node.__xinbaoNumberSlider) return;
    const widgets = Object.fromEntries(["start", "end", "step", "value"].map((name) => [name, node.widgets?.find((widget) => widget.name === name)]));
    if (Object.values(widgets).some((widget) => !widget)) return;
    for (const widget of Object.values(widgets)) {
        widget.type = "xinbao_hidden";
        widget.hidden = true;
        widget.computeSize = () => [0, -4];
        widget.serializeValue = () => widget.value;
    }

    const root = document.createElement("div");
    root.style.cssText = "width:100%;padding:4px 8px;box-sizing:border-box;display:flex;flex-direction:column;gap:6px;color:var(--fg-color,#ddd);font:12px sans-serif";
    const settings = document.createElement("div");
    settings.style.cssText = "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px";
    const controls = {};
    for (const [name, text] of Object.entries({ start: "起始", end: "结束", step: "步长" })) {
        const label = document.createElement("label");
        label.style.cssText = "display:flex;align-items:center;gap:3px;white-space:nowrap";
        label.textContent = text;
        const input = document.createElement("input");
        input.type = "number";
        input.step = "any";
        input.setAttribute("aria-label", text);
        input.style.cssText = "width:100%;min-width:0;height:24px;box-sizing:border-box;padding:2px;background:#222;color:#eee;border:1px solid #555;border-radius:4px";
        input.addEventListener("change", () => {
            if (input.value !== "") widgets[name].value = Number(input.value);
            refresh();
        });
        controls[name] = input;
        label.append(input);
        settings.append(label);
    }
    const valueRow = document.createElement("div");
    valueRow.style.cssText = "display:flex;align-items:center;gap:8px;height:24px";
    const number = document.createElement("input");
    number.type = "number";
    number.step = "any";
    number.setAttribute("aria-label", "当前数值");
    number.style.cssText = "width:76px;min-width:0;box-sizing:border-box;padding:2px;text-align:right;background:transparent;color:inherit;border:0;font:inherit";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.step = "1";
    slider.setAttribute("aria-label", "数值滑条");
    slider.style.cssText = "flex:1;min-width:0;accent-color:#65bfff;cursor:pointer";
    valueRow.append(slider, number);
    root.append(settings, valueRow);

    function refresh() {
        for (const [name, input] of Object.entries(controls)) input.value = String(widgets[name].value);
        try {
            const state = sliderState(widgets.start.value, widgets.end.value, widgets.step.value, widgets.value.value);
            widgets.value.value = state.value;
            slider.max = String(state.count);
            slider.value = String(state.index);
            slider.disabled = state.count === 0;
            number.disabled = false;
            number.min = widgets.start.value;
            number.max = widgets.end.value;
            number.value = String(state.value);
            root.title = "";
            number.title = String(state.value);
            number.style.color = "inherit";
            // Also expose local values to linked live controls such as the color panel.
            // nodeCreated runs before LiteGraph attaches the node to a graph.
            if (node.graph) {
                node.setOutputData?.(0, state.value);
                node.setOutputData?.(1, state.integer);
                node.graph.setDirtyCanvas?.(true, true);
            }
        } catch (error) {
            slider.disabled = true;
            number.disabled = true;
            root.title = number.title = error.message;
            number.style.color = "#ff8888";
        }
    }
    slider.addEventListener("input", () => {
        widgets.value.value = valueAtIndex(widgets.start.value, widgets.end.value, widgets.step.value, slider.value);
        refresh();
    });
    number.addEventListener("change", () => {
        if (number.value !== "") widgets.value.value = Number(number.value);
        refresh();
    });
    for (const widget of Object.values(widgets)) {
        const original = widget.callback;
        widget.callback = function () { const result = original?.apply(this, arguments); refresh(); return result; };
    }
    for (const event of ["pointerdown", "click", "keydown"]) root.addEventListener(event, (event) => event.stopPropagation());
    node.addDOMWidget("xinbao_number_slider", "div", root, { serialize: false, hideOnZoom: false, getMinHeight: () => 62, getMaxHeight: () => 62 });
    node.setSize?.([340, 150]);
    node.__xinbaoNumberSlider = { refresh };
    const originalConfigure = node.onConfigure;
    node.onConfigure = function () {
        const result = originalConfigure?.apply(this, arguments);
        refresh();
        node.setSize?.([Math.max(340, node.size?.[0] || 340), 150]);
        return result;
    };
    const originalAdded = node.onAdded;
    node.onAdded = function () { const result = originalAdded?.apply(this, arguments); refresh(); return result; };
    refresh();
}

app.registerExtension({
    name: "xinbao.number.slider",
    nodeCreated(node) { if ((node.comfyClass || node.type) === "XinbaoNumberSlider") setupSlider(node); },
    loadedGraphNode(node) {
        if ((node.comfyClass || node.type) !== "XinbaoNumberSlider") return;
        setupSlider(node);
        node.__xinbaoNumberSlider?.refresh();
    },
});
