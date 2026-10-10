const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const source = fs.readFileSync(path.join(__dirname, "../js/xinbao_pintu.js"), "utf8");

function editor() {
    const fillCalls = [];
    const panel = { comfyClass: "XinbaoColorPanel", widgets: [
        { name: "width", value: 1368 }, { name: "height", value: 2048 },
        { name: "color", value: "#ffffff" }, { name: "transparent_background", value: false },
    ] };
    const product = { widgets: [{ name: "image", value: "product.png" }] };
    const graph = { links: { 1: { origin_id: 1 }, 2: { origin_id: 2 } },
        getNodeById: (id) => id === 1 ? panel : product, setDirtyCanvas() {} };
    const context = vm.createContext({
        console, URL, URLSearchParams, app: {}, window: { location: { href: "http://localhost/" } },
        document: { createElement: () => ({ getContext: () => ({ fillRect: (...args) => fillCalls.push(args) }) }) },
        Image: class {
            naturalWidth = 531; naturalHeight = 575;
            set src(value) { this.onload(); }
        },
        node: { inputs: [{ link: 1 }, { link: 2 }], graph },
        stateWidget: { value: '{"x":0.5,"y":0.5,"scale":1,"rotation":0,"auto_fit":true}' },
        lockWidget: { value: false }, bgRefWidget: { value: "" }, productRefWidget: { value: "" },
        loadedBgRefJson: "", loadedProductRefJson: "", currentBgSignature: "", currentProductSignature: "",
        state: null, locked: false, backgroundImage: null, overlayImage: null,
        overlayHasTransparentPixels: false, syncVersion: 0, paintCanvas: null, paintCtx: null,
        initPaintCanvas() {}, clearPaintCanvas() {}, updateLockUI() {}, updateModeUI() {},
        layoutStageFromBackground() {}, setStatus() {}, scheduleDraw() {},
    });
    vm.runInContext(source.slice(0, source.indexOf("function setupEditor")).replace(/^import .*;\r?\n/gm, ""), context);
    vm.runInContext("detectTransparentPixels = () => false;", context);
    vm.runInContext(source.slice(source.indexOf("    function fitScale()"), source.indexOf("    let editorMinHeight")), context);
    vm.runInContext(source.slice(source.indexOf("    async function syncFromInputs"), source.indexOf('    refreshButton.addEventListener')), context);
    return { context, panel, product, fillCalls };
}

test("direct color panel works without an executed preview and centers at maximum size", async () => {
    const { context, fillCalls } = editor();
    await context.syncFromInputs();
    assert.equal(context.backgroundImage.naturalWidth, 1368);
    assert.equal(context.backgroundImage.naturalHeight, 2048);
    assert.equal(fillCalls.length, 1);
    assert.deepEqual(JSON.parse(context.stateWidget.value), { x: 0.5, y: 0.5, scale: 1, rotation: 0, auto_fit: true });
});

test("transparent color panel is not painted opaque", async () => {
    const { context, panel, fillCalls } = editor();
    panel.widgets[3].value = true;
    await context.syncFromInputs();
    assert.equal(fillCalls.length, 0);
    assert.equal(JSON.parse(context.bgRefWidget.value).transparent, true);
});

test("restoring the same inputs preserves manual placement", async () => {
    const { context } = editor();
    await context.syncFromInputs();
    const manual = { x: 0.3, y: 0.4, scale: 0.6, rotation: 20, auto_fit: false };
    context.stateWidget.value = JSON.stringify(manual);
    await context.syncFromInputs();
    assert.deepEqual(JSON.parse(context.stateWidget.value), manual);
});

test("restoring an old 42 percent default migrates even when source refs already exist", async () => {
    const { context } = editor();
    await context.syncFromInputs();
    context.stateWidget.value = '{"x":0.5,"y":0.5,"scale":0.42,"rotation":0}';
    await context.syncFromInputs();
    assert.equal(JSON.parse(context.stateWidget.value).scale, 1);
    assert.equal(JSON.parse(context.stateWidget.value).auto_fit, true);
    context.stateWidget.value = '{"x":0.5,"y":0.5,"scale":0.42,"rotation":0,"auto_fit":false}';
    await context.syncFromInputs();
    assert.equal(JSON.parse(context.stateWidget.value).scale, 1);
    context.stateWidget.value = '{"x":0.5,"y":0.5,"scale":0.42,"rotation":0,"auto_fit":false,"user_edited":true}';
    await context.syncFromInputs();
    assert.equal(JSON.parse(context.stateWidget.value).scale, 0.42);
});

test("fit calculation uses actual dimensions, not a stale canvas layout", () => {
    const { context } = editor();
    context.backgroundImage = { naturalWidth: 1600, naturalHeight: 800 };
    context.overlayImage = { naturalWidth: 400, naturalHeight: 800 };
    assert.equal(context.fitScale(), 0.25);
});

test("execution input previews restore editor without replacing persistent source refs", async () => {
    const { context } = editor();
    await context.syncFromInputs();
    const originalRef = context.productRefWidget.value;
    const transform = { x: 0.5, y: 0.5, scale: 0.9, rotation: 0, auto_fit: false };
    await context.syncFromInputs(false, {
        background: { filename: "background.png", type: "temp" },
        product: { filename: "new_product.png", type: "temp" }, transform,
    });
    assert.deepEqual(JSON.parse(context.stateWidget.value), { ...transform, user_edited: false });
    assert.equal(context.productRefWidget.value, originalRef);
    assert.match(source, /node.onExecuted = function/);
});
