import { app } from "/scripts/app.js";

const NODE_CLASSES = new Set(["XinbaoLightingCompanion", "XinbaoLightingPromptSelector"]);
const NODE_TITLE = "心宝❤打光搭档";

const TRAINED_LIGHTS = [
    ["tree_shadow", "树荫光", "加入自然、真实、方向一致的树荫光，使枝叶形状的光影可以投射在人物、地面和背景上；只添加光影，不新增树木、树枝、树叶或其他植物实体。"],
    ["striped_light", "条纹光", "加入自然的条纹光影，让方向一致的条纹阴影落在主体与场景表面。"],
    ["lens_flare", "镜头光晕", "加入克制、自然的镜头光晕，不遮挡主体与文字。"],
    ["transparent_caustics", "透明焦散", "增强透明材质的透光感、光线传输和自然焦散，保持材质真实。"],
    ["tyndall_light", "丁达尔光", "加入丁达尔光，让可见光束自然穿过空气，并与主体和空间透视保持一致。"],
    ["night_lamp", "夜间开灯", "转换为夜间室内光，让台灯自然照亮桌面与场景，保持真实的夜间明暗关系。"],
];

const EXTRA_LIGHTS = [
    ["rim_light", "轮廓光", "加入明显而自然的轮廓光，使主体边缘形成清晰的高光轮廓，增强主体与背景的层次分离，保持主体结构不变。"],
    ["dramatic_spotlight", "戏剧聚光", "加入明显的戏剧性聚光灯，使聚光集中照亮主体，周围区域自然变暗，形成清晰但柔和的明暗层次。"],
    ["sunset_gold", "日落金光", "转换为温暖的日落金色光，让低角度暖光自然照射主体与场景，形成明显的金色高光和柔和长阴影。"],
    ["warm_cool_dual", "冷暖双色", "加入明显的冷暖双色打光，一侧为暖色光，另一侧为冷色光，两种光线自然作用于主体和背景，保持真实的明暗关系。"],
    ["neon_dual", "霓虹双色", "加入明显的蓝色与洋红色霓虹光，让彩色光线自然照亮主体与环境表面，呈现真实的颜色反射，不新增霓虹灯牌或其他物体。"],
    ["moonlight", "月光", "转换为自然的夜间月光效果，让冷色月光从单一方向照入，形成柔和高光与清晰阴影，不新增月亮或改变背景内容。"],
    ["stage_follow_spot", "舞台追光", "加入明显的舞台追光，使一束方向明确的光集中照亮主体，背景适度压暗，光束与空间透视保持一致。"],
    ["firelight", "火光", "加入自然跳动的暖色火光效果，让橙红色光线照亮主体和附近环境，形成真实的明暗变化，但不新增火焰、蜡烛或壁炉。"],
    ["water_ripple", "水波光影", "加入明显而自然的水波光影，让流动的波纹光投射在主体与场景表面，只添加光影，不新增水面、泳池或其他物体。"],
    ["color_projection", "彩色投影", "加入明显的彩色投影光影，使抽象色彩和渐变光线自然投射在主体与背景上，只改变光线，不新增投影设备或文字图案。"],
    ["hard_light_cut", "硬光切割", "加入方向明确的硬光，使主体和场景出现清晰的明暗切割与锐利阴影边缘，保持真实的光线方向和空间关系。"],
    ["studio_softbox", "棚拍柔光", "转换为干净自然的商业棚拍柔光，均匀照亮主体，保留柔和阴影、材质纹理和立体感，避免过曝和塑料感。"],
];

const ALL_LIGHTS = [...TRAINED_LIGHTS, ...EXTRA_LIGHTS];
const LIGHT_MAP = new Map(ALL_LIGHTS.map((item) => [item[0], item]));
const MIN_NODE_WIDTH = 520;
const MIN_NODE_HEIGHT = 440;

function enforceNodeSize(node) {
    node.min_size = [MIN_NODE_WIDTH, MIN_NODE_HEIGHT];
    const currentWidth = Number(node.size?.[0] || 0);
    const currentHeight = Number(node.size?.[1] || 0);
    const width = Math.max(MIN_NODE_WIDTH, currentWidth);
    const height = Math.max(MIN_NODE_HEIGHT, currentHeight);
    if (currentWidth !== width || currentHeight !== height) {
        node.setSize?.([width, height]);
    }
}

function parseSelection(raw) {
    try {
        const value = JSON.parse(raw || "[]");
        if (!Array.isArray(value)) return [];
        return value.filter((key, index) => LIGHT_MAP.has(key) && value.indexOf(key) === index);
    } catch {
        return [];
    }
}

function setupSelector(node) {
    node.title = NODE_TITLE;
    if (node.__xinbaoLightingSelectorReady) {
        enforceNodeSize(node);
        return;
    }
    node.__xinbaoLightingSelectorReady = true;

    const stateWidget = node.widgets?.find((widget) => widget.name === "selected_lights");
    if (!stateWidget) return;

    stateWidget.type = "converted-widget";
    stateWidget.hidden = true;
    stateWidget.draw = () => {};
    stateWidget.computeSize = () => [0, -4];

    const root = document.createElement("div");
    root.className = "xinbao-lighting-selector";
    root.style.cssText = [
        "box-sizing:border-box",
        "width:480px",
        "min-width:480px",
        "height:100%",
        "padding:10px",
        "overflow:auto",
        "color:#f5f7ff",
        "font-family:system-ui,-apple-system,'Microsoft YaHei',sans-serif",
        "background:linear-gradient(180deg,rgba(25,28,38,.98),rgba(15,17,24,.98))",
        "border:1px solid rgba(255,255,255,.09)",
        "border-radius:8px",
    ].join(";");

    const top = document.createElement("div");
    top.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px";

    const hint = document.createElement("div");
    hint.textContent = "可多选 · 再点一次取消";
    hint.style.cssText = "font-size:12px;color:#aeb6ca";

    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "清空";
    clear.style.cssText = "border:1px solid #566079;background:#272c3a;color:#dbe2f3;border-radius:6px;padding:4px 10px;cursor:pointer";
    top.append(hint, clear);
    root.append(top);

    let selected = parseSelection(stateWidget.value);
    const buttons = new Map();

    function applyButtonStyle(button, active) {
        button.style.cssText = [
            "min-height:34px",
            "padding:5px 7px",
            "border-radius:7px",
            `border:1px solid ${active ? "#6ed6ff" : "#555d70"}`,
            `background:${active ? "linear-gradient(180deg,#36bff1,#177daf)" : "linear-gradient(180deg,#303544,#242936)"}`,
            `color:${active ? "#ffffff" : "#c9cfdd"}`,
            `box-shadow:${active ? "0 0 12px rgba(67,200,255,.48), inset 0 1px rgba(255,255,255,.18)" : "none"}`,
            "font-size:13px",
            "font-weight:600",
            "white-space:nowrap",
            "overflow:hidden",
            "text-overflow:ellipsis",
            "cursor:pointer",
            "user-select:none",
            "transition:all .12s ease",
        ].join(";");
        button.setAttribute("aria-pressed", active ? "true" : "false");
    }

    function sync() {
        selected = selected.filter((key, index) => LIGHT_MAP.has(key) && selected.indexOf(key) === index);
        stateWidget.value = JSON.stringify(selected);
        stateWidget.callback?.(stateWidget.value);
        for (const [key, button] of buttons) applyButtonStyle(button, selected.includes(key));
        node.graph?.setDirtyCanvas(true, true);
    }

    function addSection(title, lights, accent) {
        const label = document.createElement("div");
        label.textContent = title;
        label.style.cssText = `margin:8px 0 6px;font-size:12px;font-weight:700;color:${accent};letter-spacing:.04em`;
        root.append(label);

        const grid = document.createElement("div");
        grid.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:7px;width:100%";
        for (const [key, shortTitle] of lights) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = shortTitle;
            button.dataset.lightKey = key;
            button.addEventListener("pointerdown", (event) => event.stopPropagation());
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                selected = selected.includes(key)
                    ? selected.filter((item) => item !== key)
                    : [...selected, key];
                sync();
            });
            buttons.set(key, button);
            grid.append(button);
        }
        root.append(grid);
    }

    addSection("常用光效", TRAINED_LIGHTS, "#72dcff");
    addSection("扩展光效", EXTRA_LIGHTS, "#f4bf72");

    clear.addEventListener("pointerdown", (event) => event.stopPropagation());
    clear.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        selected = [];
        sync();
    });

    node.addDOMWidget("xinbao_lighting_selector", "div", root, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => 350,
    });
    const originalResize = node.onResize;
    node.onResize = function (size) {
        if (Array.isArray(size)) {
            size[0] = Math.max(MIN_NODE_WIDTH, Number(size[0] || 0));
            size[1] = Math.max(MIN_NODE_HEIGHT, Number(size[1] || 0));
        }
        const result = originalResize?.apply(this, arguments);
        enforceNodeSize(this);
        return result;
    };

    const originalConfigure = node.onConfigure;
    node.onConfigure = function () {
        const result = originalConfigure?.apply(this, arguments);
        setTimeout(() => enforceNodeSize(this), 0);
        return result;
    };

    enforceNodeSize(node);
    setTimeout(() => enforceNodeSize(node), 0);
    setTimeout(() => enforceNodeSize(node), 100);
    sync();
}

app.registerExtension({
    name: "xinbao.lighting.prompt.selector",
    nodeCreated(node) {
        if (NODE_CLASSES.has(node.comfyClass) || NODE_CLASSES.has(node.type)) setupSelector(node);
    },
    loadedGraphNode(node) {
        if (NODE_CLASSES.has(node.comfyClass) || NODE_CLASSES.has(node.type)) {
            setupSelector(node);
            setTimeout(() => enforceNodeSize(node), 0);
            setTimeout(() => enforceNodeSize(node), 100);
        }
    },
});
