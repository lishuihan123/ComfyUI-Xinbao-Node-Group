import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { sliderState, valueAtIndex } from "../js/number_slider_math.js";

test("steps, negatives, endpoints and integer rounding", () => {
    for (const [start, end, step, value, expected, integer] of [
        [0,1,.1,.26,.3,0], [0,1,.3,1,1,1], [-2,2,.5,-1.5,-1.5,-2],
        [5,5,1,99,5,5], [10,20,2,15,16,16], [0,1,.000001,.000003,.000003,0],
        [-1e9,1e9,.000001,1e9,1e9,1000000000],
    ]) {
        const state = sliderState(start, end, step, value);
        assert.equal(state.value, expected);
        assert.equal(state.integer, integer);
        assert.equal(valueAtIndex(start, end, step, state.index), expected);
    }
    assert.throws(() => sliderState(2,1,.1,1));
    assert.throws(() => sliderState(0,1,0,0));
});

test("slider and numeric input update persisted value, configuration restores", () => {
    let extension;
    const element = () => ({ style: {}, events: {}, children: [],
        setAttribute() {}, append(...items) { this.children.push(...items); },
        addEventListener(name, fn) { this.events[name] = fn; },
    });
    const context = {
        sliderState, valueAtIndex,
        document: { createElement: element },
        app: { registerExtension: (value) => { extension = value; } },
    };
    const source = fs.readFileSync(new URL("../js/xinbao_number_slider.js", import.meta.url), "utf8");
    vm.runInNewContext(source.replace(/^import .*;\r?\n/gm, ""), context);
    const node = { comfyClass: "XinbaoNumberSlider", outputs: [],
        widgets: [ ["start",0], ["end",1], ["step",.1], ["value",.5] ].map(([name,value]) => ({ name, value })),
        addDOMWidget(name,type,root) { this.root = root; }, setSize(size) { this.size = size; },
        setOutputData(index, value) {
            assert.ok(this.graph, "cannot publish outputs before graph attachment");
            this.outputs[index] = value;
        },
    };
    extension.nodeCreated(node);
    assert.equal(node.root.children.length, 2);
    const [settings,valueRow] = node.root.children;
    const [slider,number] = valueRow.children;
    assert.equal(settings.children.length, 3);
    assert.equal(node.root.title, "");
    assert.equal(number.value, "0.5");
    assert.equal(slider.disabled, false);
    assert.deepEqual(node.outputs, []);
    assert.ok(node.widgets.every(widget => widget.hidden));
    node.graph = { setDirtyCanvas() {} };
    node.onAdded();
    assert.deepEqual(node.outputs, [.5, 1]);
    slider.value = "7"; slider.events.input();
    assert.equal(node.widgets[3].serializeValue(), .7);
    assert.deepEqual(node.outputs, [.7, 1]);
    number.value = ".23"; number.events.change();
    assert.equal(node.widgets[3].value, .2);
    node.widgets[1].value = 10; node.widgets[2].value = .5; node.widgets[3].value = 3.5;
    node.onConfigure();
    assert.equal(number.value, "3.5");
    assert.equal(slider.value, "7");
    assert.equal(settings.children[1].children[0].value, "10");
    assert.equal(node.size[1], 150);
    assert.deepEqual(node.outputs, [3.5, 4]);
    const step = settings.children[2].children[0];
    step.value = "0.25"; step.events.change();
    assert.equal(node.widgets[2].serializeValue(), .25);
    assert.equal(slider.value, "14");
    node.widgets[2].value = 0; node.widgets[2].callback();
    assert.equal(slider.disabled, true);
    assert.match(node.root.title, /步长/);
    node.widgets[2].value = .5; node.widgets[2].callback();
    assert.equal(node.root.title, "");
    assert.equal(slider.disabled, false);
});
