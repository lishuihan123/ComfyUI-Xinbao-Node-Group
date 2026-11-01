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
    fire(name) { this.events[name]?.({ stopPropagation() {} }); }
}

function editor(values = ["普通.safetensors", 0.8, "[]"]) {
    let extension;
    const frames = [];
    const source = fs.readFileSync(path.join(__dirname, "../js/xinbao_lora_loader.js"), "utf8");
    vm.runInNewContext(source.replace(/^import .*;\r?\n/gm, ""), {
        app: { registerExtension(value) { extension = value; } },
        document: { createElement(tag) { return new Element(tag); } },
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
    return { extension, node, flush() { while (frames.length) frames.shift()(); } };
}

test("native LoRA name and strength stay on separate convertible rows", () => {
    const { extension, node, flush } = editor();
    extension.nodeCreated(node); flush();
    assert.equal(node.size[0], 360);
    assert.ok(node.size[1] < 150);
    assert.equal(node.widgets[1].value, 0.8);
    assert.equal(node.root.children[0].children.length, 0);
    assert.notEqual(node.widgets[0].type, "xinbao_hidden");
    assert.notEqual(node.widgets[1].type, "xinbao_hidden");
    assert.deepEqual(node.widgets[0].options.values, ["普通.safetensors", "心宝.safetensors", "子目录/其他.safetensors"]);
    assert.equal(node.widgets[3].options.serialize, false);
});

test("add, select, change strength, save/reload, and remove", () => {
    const { extension, node, flush } = editor();
    extension.nodeCreated(node); flush();
    const oneHeight = node.size[1];
    node.root.children[1].children[0].fire("click"); flush();
    assert.equal(node.size[1], oneHeight + 54);
    const [select, strengthLine] = node.root.children[0].children[0].children;
    const [slider] = strengthLine.children;
    assert.deepEqual(select.children.map(o => o.value), ["", "普通.safetensors", "心宝.safetensors", "子目录/其他.safetensors"]);
    assert.equal(slider.max, "2"); assert.equal(slider.step, "0.1");
    select.value = "心宝.safetensors"; select.fire("change");
    slider.value = "0.6"; slider.fire("input");
    assert.deepEqual(JSON.parse(node.widgets[2].serializeValue()), [{ lora_name: "心宝.safetensors", lora_strength: 0.6 }]);
    const restored = editor(node.widgets.slice(0, 3).map(w => w.serializeValue?.() ?? w.value));
    restored.extension.nodeCreated(restored.node);
    restored.node.onConfigure(); restored.flush();
    assert.equal(restored.node.root.children[0].children.length, 1);
    assert.equal(restored.node.root.children[0].children[0].children[1].children[0].value, 0.6);
    node.root.children[1].children[1].fire("click"); flush();
    assert.equal(node.widgets[2].value, "[]");
    assert.equal(node.size[1], oneHeight);
    assert.equal(node.root.children[1].children[1].disabled, true);
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
    assert.equal(node.root.children[0].children.length, 0);
    node.root.children[1].children[0].fire("click"); flush();
    assert.equal(node.widgets[1].value, 0.8);
    assert.equal(node.inputs[0].link, 7);
    assert.equal(node.root.children[0].children[0].children[1].children[0].disabled, false);
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
