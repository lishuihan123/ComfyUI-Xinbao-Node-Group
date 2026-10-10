import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import vm from "node:vm";

test("compact color controls keep color, transparency and composition sync", () => {
    let extension;
    let syncs = 0;
    const element = (tag) => ({ tag, style: {}, children: [], events: {},
        append(...items) { this.children.push(...items); },
        addEventListener(name, fn) { this.events[name] = fn; },
    });
    const source = fs.readFileSync(new URL("../js/xinbao_color_panel.js", import.meta.url), "utf8");
    vm.runInNewContext(source.replace(/^import .*;\r?\n/gm, ""), {
        document: { createElement: element },
        app: { registerExtension(value) { extension = value; } },
    });
    const node = {
        id: 1, comfyClass: "XinbaoColorPanel", size: [360, 400],
        widgets: [["width",512],["height",512],["color","#7f7f7f"],["transparent_background",false]].map(([name,value]) => ({name,value})),
        addDOMWidget(name, type, root, options) { this.root = root; this.domOptions = options; },
        computeSize() { return [360, 185 + this.domOptions.getMinHeight()]; },
        setSize(value) { this.size = value; },
        graph: { setDirtyCanvas() {}, links: { 7: {origin_id:1} }, _nodes: [
            { inputs: [{link:7}], __xinbaoPintuSync() { syncs++; } },
        ] },
    };
    extension.nodeCreated(node);
    assert.equal(node.root.children.length, 2, "no large swatch or duplicate color status");
    const toggle = node.root.children[0].children[0];
    const picker = node.root.children[1].children[0];
    assert.equal(picker.type, "color");
    assert.equal(picker.value, "#7f7f7f");
    picker.value = "#ff0000";
    picker.events.input();
    assert.equal(node.widgets[2].value, "#FF0000");
    assert.equal(syncs, 1);
    toggle.checked = true;
    toggle.events.change();
    assert.equal(node.widgets[3].serializeValue(), true);
    assert.equal(picker.disabled, true);
    assert.equal(syncs, 2);
    toggle.checked = false;
    toggle.events.change();
    assert.equal(picker.disabled, false);
    assert.equal(picker.value, "#FF0000");
    node.size = [440, 700];
    node.onConfigure();
    assert.equal(node.size[0], 440);
    assert.ok(node.size[1] < 400, "old workflow height is compacted");
    node.widgets[2].value = "invalid";
    node.widgets[2].callback();
    assert.match(node.root.title, /色号/);
    node.widgets[2].value = "#abc";
    node.widgets[2].callback();
    assert.equal(picker.value, "#aabbcc");
    assert.equal(node.root.title, "");
    extension.loadedGraphNode(node);
    assert.equal(node.root.children.length, 2);
});
