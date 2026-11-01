import { app } from "../../scripts/app.js";

const NODE_TYPE = "XinbaoLoraLoader";
const SHARE_URL = "https://space.bilibili.com/470042957";
const WIDTH = 360;

function setup(node) {
    if (node.__xinbaoLoras) {
        node.__xinbaoLoras.refresh();
        return;
    }
    const name = node.widgets?.find(w => w.name === "lora_name");
    const strength = node.widgets?.find(w => w.name === "lora_strength");
    if (!name || !strength) return;
    const stack = node.widgets.find(w => w.name === "lora_stack")
        ?? node.addWidget("text", "lora_stack", "[]", () => {}, {});
    for (const widget of [stack]) {
        widget.hidden = true;
        widget.type = "xinbao_hidden";
        widget.computeSize = () => [0, -4];
        widget.serializeValue = () => widget.value;
        if (widget.inputEl) widget.inputEl.style.display = "none";
    }

    const root = document.createElement("div");
    root.style.cssText = "width:100%;box-sizing:border-box;padding:4px 6px;display:flex;flex-direction:column;gap:5px;color:#ddd;font:12px sans-serif";
    const rowsElement = document.createElement("div");
    rowsElement.style.cssText = "display:flex;flex-direction:column;gap:5px";
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:6px;height:25px";
    function button(label, callback) {
        const element = document.createElement("button");
        element.type = "button";
        element.textContent = label;
        element.style.cssText = "flex:1;min-width:0;background:#282828;border:1px solid #555;border-radius:4px;color:inherit;font:inherit;cursor:pointer";
        element.addEventListener("click", callback);
        return element;
    }
    let rows = [];
    function commit() {
        name.value = rows[0].lora_name;
        strength.value = rows[0].lora_strength;
        stack.value = JSON.stringify(rows.slice(1));
        node.setDirtyCanvas?.(true, true);
    }
    const add = button("＋ 增加", () => {
        rows.push({ lora_name: "", lora_strength: 1 });
        commit();
        refresh();
    });
    const remove = button("－ 减少", () => {
        if (rows.length <= 1) return;
        rows.pop();
        commit();
        refresh();
    });
    actions.append(add, remove);
    const share = document.createElement("a");
    share.textContent = "点击查看更多分享";
    share.href = SHARE_URL;
    share.target = "_blank";
    share.rel = "noopener noreferrer";
    share.style.cssText = "height:20px;line-height:20px;text-align:center;color:#ccc;text-decoration:underline;font:inherit";
    root.append(rowsElement, actions, share);
    for (const event of ["pointerdown", "click", "keydown"]) {
        root.addEventListener(event, e => e.stopPropagation());
    }

    const height = () => (rows.length - 1) * 54 + 58;
    const domWidget = node.addDOMWidget("xinbao_loras", "div", root, {
        serialize: false, hideOnZoom: false,
        getMinHeight: height, getMaxHeight: height,
    });
    domWidget.computeSize = () => [WIDTH, height()];
    function compact() {
        const size = node.computeSize();
        node.setSize([WIDTH, size[1]]);
        node.setDirtyCanvas?.(true, true);
    }
    function linked(widgetName) {
        return node.inputs?.some(input =>
            (input.widget?.name === widgetName || input.name === widgetName) && input.link != null);
    }
    function fillOptions(select, current, allowEmpty) {
        select.replaceChildren();
        const values = name.options?.values;
        const names = typeof values === "function" ? values() : values ?? [];
        const choices = [...names];
        if (current && !choices.includes(current)) choices.unshift(current);
        if (allowEmpty || !current) choices.unshift("");
        for (const value of choices) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value || "选择 LoRA";
            select.append(option);
        }
        select.value = current;
        select.title = current || "选择 LoRA";
    }
    function refresh() {
        let extra = [];
        root.title = "";
        try {
            extra = stack.value ? JSON.parse(stack.value) : [];
            if (!Array.isArray(extra) || extra.some(row => !row || typeof row.lora_name !== "string" || !Number.isFinite(row.lora_strength))) throw new Error();
        } catch {
            extra = [];
            root.title = "LoRA 列表格式无效，请重新添加加载项。";
        }
        rows = [{ lora_name: name.value || "", lora_strength: Number(strength.value ?? 1) }, ...extra];
        rowsElement.replaceChildren();
        rows.forEach((row, index) => {
            if (index === 0) return; // Native widgets stay visible and convertible to input sockets.
            const line = document.createElement("div");
            line.style.cssText = "display:flex;flex-direction:column;gap:5px;height:49px";
            const select = document.createElement("select");
            select.setAttribute("aria-label", "LoRA " + (index + 1));
            select.style.cssText = "width:100%;min-width:0;height:24px;background:#222;color:#ddd;border:1px solid #555;border-radius:4px;font:inherit;text-overflow:ellipsis";
            fillOptions(select, row.lora_name, index > 0);
            select.disabled = index === 0 && linked("lora_name");
            select.addEventListener("pointerdown", () => fillOptions(select, row.lora_name, index > 0));
            select.addEventListener("change", () => {
                row.lora_name = select.value;
                select.title = select.value;
                commit();
            });
            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = "0";
            slider.max = "2";
            slider.step = "0.1";
            slider.value = row.lora_strength;
            slider.style.cssText = "width:100%;min-width:0;margin:0;accent-color:#87a8bb;cursor:pointer";
            slider.setAttribute("aria-label", "LoRA " + (index + 1) + " 强度");
            const number = document.createElement("input");
            number.type = "number";
            number.min = "0";
            number.max = "2";
            number.step = "0.1";
            number.value = Number(row.lora_strength).toFixed(1);
            number.style.cssText = "width:100%;min-width:0;box-sizing:border-box;height:24px;background:#222;color:#ddd;border:1px solid #555;border-radius:3px;font:inherit;text-align:center;padding:0;appearance:textfield";
            number.setAttribute("aria-label", "LoRA " + (index + 1) + " 强度数值");
            slider.disabled = number.disabled = index === 0 && linked("lora_strength");
            if (slider.disabled) slider.title = number.title = "使用连接的浮点输入";
            function change(value) {
                const parsed = Number(value);
                if (value === "" || !Number.isFinite(parsed)) return;
                row.lora_strength = Math.round(Math.max(0, Math.min(2, parsed)) * 10) / 10;
                slider.value = row.lora_strength;
                number.value = row.lora_strength.toFixed(1);
                commit();
            }
            slider.addEventListener("input", () => change(slider.value));
            number.addEventListener("change", () => change(number.value));
            const strengthLine = document.createElement("div");
            strengthLine.style.cssText = "display:grid;grid-template-columns:minmax(0,1fr) 40px;gap:5px;align-items:center;height:24px";
            strengthLine.append(slider, number);
            line.append(select, strengthLine);
            rowsElement.append(line);
        });
        remove.disabled = rows.length <= 1;
        remove.style.opacity = remove.disabled ? "0.4" : "1";
        compact();
        requestAnimationFrame(compact);
    }
    for (const event of ["onConfigure", "onAdded", "onConnectionsChange"]) {
        const original = node[event];
        node[event] = function () {
            const result = original?.apply(this, arguments);
            refresh();
            return result;
        };
    }
    for (const widget of [name, strength, stack]) {
        const original = widget.callback;
        widget.callback = function () {
            const result = original?.apply(this, arguments);
            refresh();
            return result;
        };
    }
    node.__xinbaoLoras = { refresh };
    refresh();
}

app.registerExtension({
    name: "xinbao.lora.loader",
    nodeCreated(node) {
        if ((node.comfyClass || node.type) === NODE_TYPE) setup(node);
    },
    loadedGraphNode(node) {
        if ((node.comfyClass || node.type) === NODE_TYPE) setup(node);
    },
});
