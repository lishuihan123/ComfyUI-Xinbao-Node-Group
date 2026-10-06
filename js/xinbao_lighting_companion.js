import { app } from "/scripts/app.js";

const NODE_CLASSES = new Set(["XinbaoLightingCompanion", "XinbaoLightingPromptSelector"]);
const NODE_TITLE = "心宝❤打光搭档";
const SUBJECT_FLAG = "__subject_surface__";

const TRAINED_LIGHTS = [
    ["tree_shadow", "树荫光", "加入自然、真实、方向一致的树荫光，使枝叶形状的光影可以投射在人物、地面和背景上；只添加光影，不新增树木、树枝、树叶或其他植物实体。"],
    ["striped_light", "条纹光", "加入自然的条纹光影，让方向一致的条纹阴影落在主体与场景表面。"],
    ["lens_flare", "镜头光晕", "加入克制、自然的镜头光晕。"],
    ["transparent_caustics", "透明焦散", "增强透明材质的透光感、光线传输和自然焦散，保持材质真实。"],
    ["tyndall_light", "丁达尔光", "加入强烈、清晰可见的丁达尔光，多束明亮的体积光穿过空气中的薄雾，形成鲜明的光柱与明暗分层；光束照亮人物或产品主体，并在受遮挡区域形成明显阴影，呈现强烈的空间纵深和戏剧性光照，保持光线方向与场景透视一致。"],
    ["night_lamp", "夜间开灯", "转换为夜间室内光，让台灯自然照亮桌面与场景，保持真实的夜间明暗关系。"],
];

const EXTRA_LIGHTS = [
    ["rim_light", "轮廓光", "加入明显而自然的轮廓光，使主体边缘形成清晰的高光轮廓，增强主体与背景的层次分离，保持主体结构不变。"],
    ["sunset_gold", "日落金光", "转换为温暖的日落金色光，让低角度暖光自然照射主体与场景，形成明显的金色高光和柔和长阴影。"],
    ["warm_cool_dual", "冷暖双色", "加入明显的冷暖双色打光，一侧为暖色光，另一侧为冷色光，两种光线自然作用于主体和背景，保持真实的明暗关系。"],
    ["neon_dual", "霓虹双色", "加入明显的蓝色与洋红色霓虹光，让彩色光线自然照亮主体与环境表面，呈现真实的颜色反射，不新增霓虹灯牌或其他物体。"],
    ["dramatic_spotlight", "戏剧聚光", "加入明显的戏剧性聚光灯，使聚光集中照亮主体，周围区域自然变暗，形成清晰但柔和的明暗层次。"],
    ["moonlight", "月光", "转换为自然的夜间月光效果，让冷色月光从单一方向照入，形成柔和高光与清晰阴影，不新增月亮或改变背景内容。"],
    ["stage_follow_spot", "舞台追光", "加入明显的舞台追光，使一束方向明确的光集中照亮主体，背景适度压暗，光束与空间透视保持一致。"],
    ["firelight", "火光", "加入自然跳动的暖色火光效果，让橙红色光线照亮主体和附近环境，形成真实的明暗变化，但不新增火焰、蜡烛或壁炉。"],
    ["water_ripple", "水波光影", "加入明显而自然的水波光影，让流动的波纹光投射在主体与场景表面，只添加光影，不新增水面、泳池或其他物体。"],
    ["color_projection", "彩色投影", "加入明显的彩色投影光影，使抽象色彩和渐变光线自然投射在主体与背景上，只改变光线，不新增投影设备或文字图案。"],
    ["hard_light_cut", "硬光切割", "加入方向明确的硬光，使主体和场景出现清晰的明暗切割与锐利阴影边缘，保持真实的光线方向和空间关系。"],
    ["studio_softbox", "棱晶虹光", "加入强烈、清晰的棱晶虹光：高强度白光经过画外透明棱晶的折射与色散，在人物或产品主体及周围环境表面形成错落交叠的彩色光带、半透明亮区和接近白色的高亮核心；光谱以青蓝、紫罗兰、橙金为主，光带边缘分离出鲜明色彩。光带随主体轮廓、曲面、材质和遮挡关系自然弯折或中断，暗部保持深邃，形成璀璨而具有空间层次的棱晶折射效果；避免彩虹色均匀铺满画面。只添加折射光影，不新增可见棱晶、灯具或其他物体，保持原图内容不变。"],
];

const ALL_LIGHTS = [...TRAINED_LIGHTS, ...EXTRA_LIGHTS];
const LIGHT_MAP = new Map(ALL_LIGHTS.map((item) => [item[0], item]));
const DIRECTIONS = [
    ["top_left", "左上方"], ["top", "正上方"], ["top_right", "右上方"],
    ["left", "左侧"], ["default", "默认"], ["right", "右侧"],
    ["bottom_left", "左下方"], ["bottom", "正下方"], ["bottom_right", "右下方"],
    ["front", "正前方"], ["back", "正后方"],
];
const DIRECTION_KEYS = new Set(DIRECTIONS.map(([key]) => key));
const MIN_NODE_WIDTH = 520;
const MIN_NODE_HEIGHT = 740;

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
        const parsed = JSON.parse(raw || "[]");
        const value = Array.isArray(parsed) ? parsed : parsed?.lights;
        if (!Array.isArray(value)) return [];
        return value.filter((key, index) => (LIGHT_MAP.has(key) || key === SUBJECT_FLAG) && value.indexOf(key) === index);
    } catch {
        return [];
    }
}

function parseSupplement(raw) {
    try {
        const value = JSON.parse(raw || "[]");
        return typeof value?.supplement === "string" ? value.supplement : "";
    } catch {
        return "";
    }
}

function parseDirection(raw) {
    try {
        const direction = JSON.parse(raw || "[]")?.direction;
        return DIRECTION_KEYS.has(direction) ? direction : "default";
    } catch {
        return "default";
    }
}

function parseDirectionEnabled(raw) {
    try {
        return JSON.parse(raw || "[]")?.direction_enabled === true;
    } catch {
        return false;
    }
}

function setupSelector(node) {
    node.title = NODE_TITLE;
    if (node.__xinbaoLightingSelectorReady) {
        node.__xinbaoLightingRestore?.();
        enforceNodeSize(node);
        return;
    }

    const stateWidget = node.widgets?.find((widget) => widget.name === "selected_lights");
    if (!stateWidget) return;
    node.__xinbaoLightingSelectorReady = true;

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
    hint.textContent = "可多选，叠加光效";
    hint.style.cssText = "font-size:12px;color:#aeb6ca";

    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "清空";
    clear.style.cssText = "border:1px solid #566079;background:#272c3a;color:#dbe2f3;border-radius:6px;padding:4px 10px;cursor:pointer";
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:6px";
    const previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.textContent = "光效预览";
    previewButton.style.cssText = clear.style.cssText;
    previewButton.addEventListener("pointerdown", (event) => event.stopPropagation());
    previewButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const url = new URL("./lighting_preview/index.html", import.meta.url);
        const popupWidth = Math.min(1080, window.screen?.availWidth || 1080);
        const popupHeight = Math.min(820, window.screen?.availHeight || 820);
        const currentLeft = window.screenLeft ?? window.screenX ?? 0;
        const currentTop = window.screenTop ?? window.screenY ?? 0;
        const currentWidth = window.outerWidth || document.documentElement.clientWidth || popupWidth;
        const currentHeight = window.outerHeight || document.documentElement.clientHeight || popupHeight;
        const left = Math.round(currentLeft + (currentWidth - popupWidth) / 2);
        const top = Math.round(currentTop + (currentHeight - popupHeight) / 2);
        const previewWindow = window.open(
            url.href,
            "xinbao-lighting-preview",
            `popup,width=${popupWidth},height=${popupHeight},left=${left},top=${top},resizable=yes,scrollbars=yes`,
        );
        try {
            previewWindow?.moveTo(left, top);
            previewWindow?.resizeTo(popupWidth, popupHeight);
            previewWindow?.focus();
        } catch {
            // Some browsers apply the requested position but block explicit movement.
        }
    });
    actions.append(previewButton, clear);
    top.append(hint, actions);
    root.append(top);

    const initialState = parseSelection(stateWidget.value);
    let selected = initialState.filter((key) => key !== SUBJECT_FLAG);
    let subjectEnabled = initialState.includes(SUBJECT_FLAG);
    let supplement = parseSupplement(stateWidget.value);
    let direction = parseDirection(stateWidget.value);
    let directionEnabled = parseDirectionEnabled(stateWidget.value);
    const buttons = new Map();
    const directionButtons = new Map();

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
        const lights = subjectEnabled ? [...selected, SUBJECT_FLAG] : selected;
        stateWidget.value = JSON.stringify(supplement || direction !== "default" || directionEnabled ? { lights, supplement, direction, direction_enabled: directionEnabled } : lights);
        stateWidget.callback?.(stateWidget.value);
        for (const [key, button] of buttons) applyButtonStyle(button, selected.includes(key));
        for (const [key, button] of directionButtons) {
            applyButtonStyle(button, direction === key);
            if (direction === key) button.style.cssText += ";border-color:#b99be3;background:linear-gradient(180deg,#8b65b5,#624580);box-shadow:0 0 9px rgba(174,130,222,.25)";
            button.disabled = !directionEnabled;
            if (!directionEnabled) button.style.cssText += ";opacity:.45;cursor:not-allowed;box-shadow:none";
        }
        directionToggle.setAttribute("aria-checked", String(directionEnabled));
        directionToggle.style.cssText = `border:1px solid ${directionEnabled ? "#b99be3" : "#555d70"};background:${directionEnabled ? "#724c97" : "#272c3a"};color:${directionEnabled ? "#fff" : "#c9cfdd"};border-radius:12px;padding:4px 10px;font-size:12px;white-space:nowrap;cursor:pointer`;
        subjectCheckbox.checked = subjectEnabled;
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

    const directionHeader = document.createElement("div");
    directionHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin:16px 0 7px;padding-top:12px;border-top:1px solid #383044";
    const directionTitle = document.createElement("div");
    directionTitle.textContent = "光照方向（开发中，有待完善）";
    directionTitle.style.cssText = "font-size:12px;font-weight:700;color:#c5a5e8";
    const directionToggle = document.createElement("button");
    directionToggle.type = "button";
    directionToggle.textContent = "仍要体验";
    directionToggle.setAttribute("role", "switch");
    directionToggle.setAttribute("aria-label", "仍要体验");
    directionToggle.addEventListener("pointerdown", event => event.stopPropagation());
    directionToggle.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        directionEnabled = !directionEnabled;
        sync();
    });
    directionHeader.append(directionTitle, directionToggle);
    const directionPanel = document.createElement("div");
    directionPanel.setAttribute("role", "group");
    directionPanel.setAttribute("aria-label", "光照方向（单选）");
    directionPanel.style.cssText = "display:grid;grid-template-columns:3fr 1.3fr;gap:12px";
    const compass = document.createElement("div");
    compass.style.cssText = "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px";
    const depth = document.createElement("div");
    depth.style.cssText = "display:grid;grid-template-rows:repeat(2,1fr);gap:6px";
    for (const [key, title] of DIRECTIONS) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = title;
        button.dataset.directionKey = key;
        button.title = key === "default" ? "不追加方向提示词" : `光源来自${title}，以相机画面为参照`;
        button.addEventListener("pointerdown", event => event.stopPropagation());
        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            if (!directionEnabled) return;
            direction = key;
            sync();
        });
        directionButtons.set(key, button);
        (key === "front" || key === "back" ? depth : compass).append(button);
    }
    directionPanel.append(compass, depth);

    const subjectLabel = document.createElement("label");
    subjectLabel.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:16px;padding:6px 2px;font-size:13px;color:#dbe2f3;cursor:pointer;white-space:nowrap";
    subjectLabel.title = "仅对选中的树荫光、条纹光追加主体硬光与遮挡投影提示词";
    const subjectCheckbox = document.createElement("input");
    subjectCheckbox.type = "checkbox";
    subjectCheckbox.setAttribute("aria-label", "光线作用主体");
    subjectCheckbox.style.cssText = "width:18px;height:18px;margin:0;accent-color:#36bff1;cursor:pointer";
    const subjectText = document.createElement("span");
    subjectText.textContent = "光线作用主体";
    subjectLabel.append(subjectCheckbox, subjectText);
    subjectLabel.addEventListener("pointerdown", (event) => event.stopPropagation());
    subjectLabel.addEventListener("click", (event) => event.stopPropagation());
    subjectCheckbox.addEventListener("change", () => {
        subjectEnabled = subjectCheckbox.checked;
        sync();
    });
    root.append(subjectLabel);

    const supplementLabel = document.createElement("label");
    supplementLabel.style.cssText = "display:flex;flex-direction:column;gap:7px;margin-top:10px;font-size:13px;font-weight:600;color:#77e5a2";
    const supplementTitle = document.createElement("span");
    supplementTitle.textContent = "补充说明";
    const supplementInput = document.createElement("textarea");
    supplementInput.setAttribute("aria-label", "补充说明");
    supplementInput.placeholder = "输入需要追加的提示词…";
    supplementInput.value = supplement;
    supplementInput.rows = 3;
    supplementInput.style.cssText = "box-sizing:border-box;width:100%;min-height:76px;resize:vertical;border:1px solid #465267;border-radius:7px;background:#121722;color:#e3eaf5;padding:8px;font:13px/1.6 system-ui,'Microsoft YaHei',sans-serif;outline-color:#77e5a2";
    for (const eventName of ["pointerdown", "click", "keydown", "keyup"]) {
        supplementInput.addEventListener(eventName, (event) => event.stopPropagation());
    }
    supplementInput.addEventListener("input", () => {
        supplement = supplementInput.value;
        sync();
    });
    supplementLabel.append(supplementTitle, supplementInput);
    root.append(supplementLabel);
    root.append(directionHeader, directionPanel);

    node.__xinbaoLightingRestore = () => {
        const saved = parseSelection(stateWidget.value);
        selected = saved.filter((key) => key !== SUBJECT_FLAG);
        subjectEnabled = saved.includes(SUBJECT_FLAG);
        supplement = parseSupplement(stateWidget.value);
        direction = parseDirection(stateWidget.value);
        directionEnabled = parseDirectionEnabled(stateWidget.value);
        supplementInput.value = supplement;
        sync();
    };

    clear.addEventListener("pointerdown", (event) => event.stopPropagation());
    clear.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        selected = [];
        subjectEnabled = false;
        supplement = "";
        direction = "default";
        directionEnabled = false;
        supplementInput.value = "";
        sync();
    });

    node.addDOMWidget("xinbao_lighting_selector", "div", root, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => 690,
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
        this.__xinbaoLightingRestore?.();
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
