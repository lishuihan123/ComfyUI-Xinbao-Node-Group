const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function editor() {
    let extension;
    const frames = [];
    const source = fs.readFileSync(path.join(__dirname, "../js/xinbao_lora_loader.js"), "utf8");
    vm.runInNewContext(source.replace(/^import .*;\r?\n/gm, ""), {
        app: { registerExtension(value) { extension = value; } },
        requestAnimationFrame(callback) { frames.push(callback); },
    });
    const node = {
        comfyClass: "XinbaoLoraLoader", size: [560, 320],
        widgets: [{ name: "lora_name", value: "心宝.safetensors" }, { name: "lora_strength", value: 0.8 }],
        computeSize() { return [270, 34 + this.widgets.length * 24]; },
        setSize(size) { this.size = Array.from(size); },
        addWidget(type, name, value, callback) {
            const widget = { type, name, value, callback };
            this.widgets.push(widget);
            return widget;
        },
    };
    return { extension, node, flush() { while (frames.length) frames.shift()(); } };
}

test("new LoRA node uses content height and keeps the user's strength", () => {
    const { extension, node, flush } = editor();
    extension.nodeCreated(node);
    flush();
    assert.deepEqual(node.size, [300, 106]);
    assert.equal(node.widgets[1].value, 0.8);
    assert.equal(node.widgets[2].options.serialize, false);
});

test("loading an oversized saved node resets its size without duplicating widgets", () => {
    const { extension, node, flush } = editor();
    extension.nodeCreated(node);
    node.size = [800, 600];
    node.onConfigure();
    extension.loadedGraphNode(node);
    flush();
    assert.deepEqual(node.size, [300, 106]);
    assert.equal(node.widgets.length, 3);
});

test("other node types are untouched", () => {
    const { extension, node, flush } = editor();
    node.comfyClass = "LoraLoaderModelOnly";
    extension.nodeCreated(node);
    extension.loadedGraphNode(node);
    flush();
    assert.deepEqual(node.size, [560, 320]);
    assert.equal(node.widgets.length, 2);
});
