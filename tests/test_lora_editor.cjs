const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.events = {}; this.attributes = {}; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(name, fn) { this.events[name] = fn; }
    setAttribute(name, value) { this.attributes[name] = value; }
    fire(name, event = {}) { this.events[name]?.({ stopPropagation() {}, preventDefault() {}, ...event }); }
    focus() { this.focused = true; }
    showModal() { this.open = true; }
    close() { this.open = false; this.fire("close"); }
    remove() { this.removed = true; }
    querySelector(tag) { return this.children.find(child => child.tag === tag); }
    click() { this.fire("click"); }
}

function editor(values = ["普通.safetensors", 0.8, "[]"]) {
    let extension;
    const frames = [];
    const body = new Element("body");
    const source = fs.readFileSync(path.join(__dirname, "../js/xinbao_lora_loader.js"), "utf8");
    vm.runInNewContext(source.replace(/^import .*;\r?\n/gm, ""), {
        app: { registerExtension(value) { extension = value; } },
        document: { body, createElement(tag) { return new Element(tag); } },
        requestAnimationFrame(callback) { frames.push(callback); },
    });
    const node = {
        comfyClass: "XinbaoLoraLoader", size: [560, 320], inputs: [],
        widgets: [
            { name: "lora_name", value: values[0], options: { values: ["普通.safetensors", "心宝.safetensors", "子目录/其他.safetensors"] } },
            { name: "lora_strength", value: values[1] },
            { name: "lora_stack", value: values[2] },
        ],
        computeSize() { return [270, 30 + this.widgets.reduce((height, w) => height + (w.computeSize?.()[1] ?? 20) + 4, 0)]; },
        setSize(size) { this.size = Array.from(size); },
        addWidget(type, name, value, callback) { const w = { type, name, value, callback }; this.widgets.push(w); return w; },
        addDOMWidget(name, type, element, options) {
            this.root = element;
            const w = { name, type, element, options };
            this.widgets.push(w);
            return w;
        },
    };
    return { extension, node, body, flush() { while (frames.length) frames.shift()(); } };
}

test("first LoRA uses the same compact controls while preserving serialized widgets", () => {
    const { extension, node, flush } = editor();
    extension.nodeCreated(node); flush();
    assert.equal(node.size[0], 360);
    assert.ok(node.size[1] < 150);
    assert.equal(node.widgets[1].value, 0.8);
    assert.equal(node.root.children[0].children.length, 1);
    assert.equal(node.widgets[0].type, "xinbao_hidden");
    assert.equal(node.widgets[1].type, "xinbao_hidden");
    assert.deepEqual(node.widgets[0].options.values, ["普通.safetensors", "心宝.safetensors", "子目录/其他.safetensors"]);
    assert.equal(node.widgets[3].options.serialize, false);
});

test("add, select, change strength, save/reload, and remove", () => {
    const { extension, node, body, flush } = editor();
    extension.nodeCreated(node); flush();
    const oneHeight = node.size[1];
    node.root.children[1].children[0].fire("click"); flush();
    assert.equal(node.size[1], oneHeight + 54);
    const [select, strengthLine] = node.root.children[0].children[1].children;
    const [slider] = strengthLine.children;
    assert.equal(slider.max, "2"); assert.equal(slider.step, "0.1");
    select.fire("click");
    const dialog = body.children.at(-1);
    assert.deepEqual(dialog.children[1].children.map(o => o.textContent), ["普通.safetensors", "心宝.safetensors", "子目录/其他.safetensors"]);
    dialog.children[1].children[1].fire("click");
    assert.equal(dialog.removed, true);
    slider.value = "0.6"; slider.fire("input");
    assert.deepEqual(JSON.parse(node.widgets[2].serializeValue()), [{ lora_name: "心宝.safetensors", lora_strength: 0.6 }]);
    const restored = editor(node.widgets.slice(0, 3).map(w => w.serializeValue?.() ?? w.value));
    restored.extension.nodeCreated(restored.node);
    restored.node.onConfigure(); restored.flush();
    assert.equal(restored.node.root.children[0].children.length, 2);
    assert.equal(restored.node.root.children[0].children[1].children[1].children[0].value, 0.6);
    node.root.children[1].children[1].fire("click"); flush();
    assert.equal(node.widgets[2].value, "[]");
    assert.equal(node.size[1], oneHeight);
    assert.equal(node.root.children[1].children[1].disabled, true);
});

test("every extra row has searchable choices, cancellation, and fresh options", () => {
    const { extension, node, body, flush } = editor();
    extension.nodeCreated(node); flush();
    for (let i = 0; i < 3; i++) node.root.children[1].children[0].fire("click");
    node.widgets[0].options.values.push("New/STYLE.safetensors");
    for (let index = 0; index < 3; index++) {
        const trigger = node.root.children[0].children[index + 1].children[0];
        trigger.fire("click");
        const dialog = body.children.at(-1);
        const [search, list] = dialog.children;
        assert.equal(search.focused, true);
        search.value = "子目录"; search.fire("input");
        assert.deepEqual(list.children.map(o => o.textContent), ["子目录/其他.safetensors"]);
        search.value = "style"; search.fire("input");
        assert.deepEqual(list.children.map(o => o.textContent), ["New/STYLE.safetensors"]);
        search.fire("keydown", { key: "Enter" });
        assert.equal(JSON.parse(node.widgets[2].value)[index].lora_name, "New/STYLE.safetensors");
        assert.equal(node.widgets[1].value, 0.8);
        trigger.fire("click");
        const cancelDialog = body.children.at(-1);
        cancelDialog.children[0].value = "不存在";
        cancelDialog.children[0].fire("input");
        assert.equal(cancelDialog.children[1].children[0].textContent, "没有匹配的 LoRA");
        cancelDialog.children[2].children[1].fire("click");
        assert.equal(JSON.parse(node.widgets[2].value)[index].lora_name, "New/STYLE.safetensors");
    }
    const trigger = node.root.children[0].children[1].children[0];
    trigger.fire("click");
    body.children.at(-1).children[2].children[0].fire("click");
    assert.equal(JSON.parse(node.widgets[2].value)[0].lora_name, "");
    trigger.fire("click");
    node.onRemoved();
    assert.equal(body.children.at(-1).removed, true);
});

test("legacy null and oversized node restore without duplicate UI", () => {
    const { extension, node, flush } = editor(["心宝.safetensors", 1, null]);
    extension.nodeCreated(node);
    node.size = [800, 600];
    node.onConfigure();
    extension.loadedGraphNode(node); flush();
    assert.equal(node.widgets.length, 4);
    assert.equal(node.size[0], 360); assert.ok(node.size[1] < 150);
});

test("linked first strength stays connected and is not overwritten by extra rows", () => {
    const { extension, node, flush } = editor();
    node.inputs = [{ name: "lora_strength", link: 7 }];
    extension.nodeCreated(node); flush();
    assert.equal(node.root.children[0].children.length, 1);
    node.root.children[1].children[0].fire("click"); flush();
    assert.equal(node.widgets[1].value, 0.8);
    assert.equal(node.inputs[0].link, 7);
    assert.equal(node.root.children[0].children[0].children[1].children[0].disabled, true);
    assert.equal(node.root.children[0].children[1].children[1].children[0].disabled, false);
});

test("first and subsequent rows have identical styles and first-row edits persist", () => {
    const { extension, node, body, flush } = editor();
    extension.nodeCreated(node); flush();
    node.root.children[1].children[0].fire("click"); flush();
    const [first, second] = node.root.children[0].children;
    assert.equal(first.style.cssText, second.style.cssText);
    assert.equal(first.children[0].style.cssText, second.children[0].style.cssText);
    assert.equal(first.children[1].style.cssText, second.children[1].style.cssText);
    for (let i = 0; i < 2; i++) assert.equal(first.children[1].children[i].style.cssText, second.children[1].children[i].style.cssText);
    first.children[0].fire("click");
    const dialog = body.children.at(-1);
    assert.equal(dialog.children[2].children.length, 1); // Required first LoRA cannot be cleared.
    dialog.children[0].value = "心宝"; dialog.children[0].fire("input");
    dialog.children[1].children[0].fire("click");
    const slider = first.children[1].children[0];
    slider.value = "1.3"; slider.fire("input");
    assert.equal(node.widgets[0].serializeValue(), "心宝.safetensors");
    assert.equal(node.widgets[1].serializeValue(), 1.3);
    node.onConfigure(); flush();
    assert.equal(node.root.children[0].children[0].children[1].children[1].value, "1.3");
});

test("malformed saved JSON is preserved for backend validation without UI crash", () => {
    const { extension, node, flush } = editor(["普通.safetensors", 1, "{}"]);
    extension.nodeCreated(node); flush();
    assert.equal(node.widgets[2].value, "{}");
    assert.ok(node.root.title);
});

test("other node types are untouched", () => {
    const { extension, node, flush } = editor();
    node.comfyClass = "LoraLoaderModelOnly";
    extension.nodeCreated(node); extension.loadedGraphNode(node); flush();
    assert.deepEqual(node.size, [560, 320]); assert.equal(node.widgets.length, 3);
});
