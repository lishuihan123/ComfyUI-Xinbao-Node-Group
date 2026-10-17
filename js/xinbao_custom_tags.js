import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const NODE_CLASS = "XinbaoCustomTagSelector";
const NODE_TITLE = "心宝♥自定标签";
const API_PATH = "/xinbao-node-group/custom-tags";
const CONFIG_UPDATED_EVENT = "xinbao-custom-tags-updated";
const MIN_NODE_WIDTH = 520;
const MIN_NODE_HEIGHT = 420;

const CustomTagApi = {
    async load() {
        const response = await api.fetchApi(API_PATH);
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message || "读取标签失败");
        return payload.data;
    },
    async save(config) {
        const response = await api.fetchApi(API_PATH, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(config),
        });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message || "保存标签失败");
        return payload.data;
    },
};

function cloneConfig(config) {
    return JSON.parse(JSON.stringify(config || { groups: [], tags: [] }));
}

function makeId(prefix) {
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${random}`;
}

function parseSelection(raw) {
    try {
        const value = JSON.parse(raw || "[]");
        if (!Array.isArray(value)) return [];
        return value.map(String).filter((id, index, items) => id && items.indexOf(id) === index);
    } catch {
        return [];
    }
}

function stopNodeEvents(element) {
    for (const eventName of ["pointerdown", "pointerup", "click", "keydown", "keyup", "wheel"]) {
        element.addEventListener(eventName, (event) => event.stopPropagation());
    }
}

function enforceNodeSize(node) {
    node.min_size = [MIN_NODE_WIDTH, MIN_NODE_HEIGHT];
    const width = Math.max(MIN_NODE_WIDTH, Number(node.size?.[0] || 0));
    const height = Math.max(MIN_NODE_HEIGHT, Number(node.size?.[1] || 0));
    if (width !== Number(node.size?.[0]) || height !== Number(node.size?.[1])) {
        node.setSize?.([width, height]);
    }
}

function buttonStyle(active = false) {
    return [
        "min-height:38px",
        "padding:6px 8px",
        "border-radius:7px",
        `border:1px solid ${active ? "#6ed6ff" : "#555d70"}`,
        `background:${active ? "linear-gradient(180deg,#36bff1,#177daf)" : "linear-gradient(180deg,#303544,#242936)"}`,
        `color:${active ? "#fff" : "#c9cfdd"}`,
        `box-shadow:${active ? "0 0 12px rgba(67,200,255,.48),inset 0 1px rgba(255,255,255,.18)" : "none"}`,
        "font-size:13px",
        "font-weight:600",
        "white-space:nowrap",
        "overflow:hidden",
        "text-overflow:ellipsis",
        "cursor:pointer",
        "user-select:none",
    ].join(";");
}

function openEditor(ownerNode, initialConfig) {
    let draft = cloneConfig(initialConfig);
    let saving = false;

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.68);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box";
    const dialog = document.createElement("div");
    dialog.style.cssText = "width:min(980px,96vw);height:min(820px,92vh);display:flex;flex-direction:column;background:#171a23;color:#eef3ff;border:1px solid #4b566f;border-radius:12px;box-shadow:0 20px 70px rgba(0,0,0,.55);font-family:system-ui,-apple-system,'Microsoft YaHei',sans-serif;overflow:hidden";
    stopNodeEvents(dialog);

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #343b4d;background:#202431";
    const title = document.createElement("strong");
    title.textContent = "编辑自定标签";
    title.style.fontSize = "16px";
    const addGroupButton = document.createElement("button");
    addGroupButton.type = "button";
    addGroupButton.textContent = "＋ 添加分组";
    addGroupButton.style.cssText = "border:1px solid #4aaed6;background:#246e91;color:#fff;border-radius:7px;padding:7px 12px;cursor:pointer;font-weight:600";
    header.append(title, addGroupButton);

    const body = document.createElement("div");
    body.style.cssText = "flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:12px";
    const footer = document.createElement("div");
    footer.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-top:1px solid #343b4d;background:#202431";
    const message = document.createElement("div");
    message.style.cssText = "font-size:12px;color:#aeb7cb;min-height:18px";
    message.textContent = "分组顺序决定最终文本的拼接顺序。";
    const footerActions = document.createElement("div");
    footerActions.style.cssText = "display:flex;gap:8px";
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "取消";
    cancelButton.style.cssText = "border:1px solid #596279;background:#2b303e;color:#dbe2f3;border-radius:7px;padding:7px 16px;cursor:pointer";
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "保存";
    saveButton.style.cssText = "border:1px solid #5bd28e;background:#237448;color:#fff;border-radius:7px;padding:7px 18px;cursor:pointer;font-weight:700";
    footerActions.append(cancelButton, saveButton);
    footer.append(message, footerActions);
    dialog.append(header, body, footer);
    overlay.append(dialog);
    document.body.append(overlay);

    const close = () => {
        document.removeEventListener("keydown", onKeyDown, true);
        overlay.remove();
    };
    const onKeyDown = (event) => {
        if (event.key === "Escape" && !saving) close();
    };
    document.addEventListener("keydown", onKeyDown, true);
    overlay.addEventListener("pointerdown", (event) => {
        if (event.target === overlay && !saving) close();
    });
    cancelButton.addEventListener("click", close);

    function moveGroup(groupId, delta) {
        const index = draft.groups.findIndex((group) => group.id === groupId);
        const target = index + delta;
        if (index < 0 || target < 0 || target >= draft.groups.length) return;
        [draft.groups[index], draft.groups[target]] = [draft.groups[target], draft.groups[index]];
        render();
    }

    function moveTag(tagId, delta) {
        const tag = draft.tags.find((item) => item.id === tagId);
        if (!tag) return;
        const indexes = draft.tags.map((item, index) => item.group_id === tag.group_id ? index : -1).filter((index) => index >= 0);
        const position = indexes.indexOf(draft.tags.indexOf(tag));
        const targetPosition = position + delta;
        if (position < 0 || targetPosition < 0 || targetPosition >= indexes.length) return;
        const targetIndex = indexes[targetPosition];
        const currentIndex = indexes[position];
        [draft.tags[currentIndex], draft.tags[targetIndex]] = [draft.tags[targetIndex], draft.tags[currentIndex]];
        render();
    }

    function smallButton(text, color = "#596279") {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = text;
        button.style.cssText = `border:1px solid ${color};background:#2a2f3c;color:#e3e8f5;border-radius:6px;padding:5px 8px;cursor:pointer;white-space:nowrap`;
        return button;
    }

    function render() {
        body.replaceChildren();
        if (!draft.groups.length) {
            const empty = document.createElement("div");
            empty.textContent = "暂无分组，点击右上角“添加分组”开始创建。";
            empty.style.cssText = "margin:auto;color:#9fa9bd;font-size:14px";
            body.append(empty);
            return;
        }

        draft.groups.forEach((group, groupIndex) => {
            const card = document.createElement("section");
            card.style.cssText = "border:1px solid #3b4458;border-radius:9px;background:#1c202b;padding:11px";
            const groupHeader = document.createElement("div");
            groupHeader.style.cssText = "display:grid;grid-template-columns:minmax(160px,1fr) auto;gap:9px;align-items:center;margin-bottom:10px";
            const groupName = document.createElement("input");
            groupName.value = group.name;
            groupName.placeholder = "分组名称";
            groupName.style.cssText = "box-sizing:border-box;width:100%;border:1px solid #4a556c;border-radius:7px;background:#121722;color:#fff;padding:8px;font-size:14px;font-weight:700";
            groupName.addEventListener("input", () => { group.name = groupName.value; });
            stopNodeEvents(groupName);

            const controls = document.createElement("div");
            controls.style.cssText = "display:flex;gap:5px;align-items:center";
            const up = smallButton("↑");
            const down = smallButton("↓");
            up.title = "分组上移";
            down.title = "分组下移";
            up.disabled = groupIndex === 0;
            down.disabled = groupIndex === draft.groups.length - 1;
            up.addEventListener("click", () => moveGroup(group.id, -1));
            down.addEventListener("click", () => moveGroup(group.id, 1));
            const addTag = smallButton("＋ 标签", "#4aaed6");
            addTag.addEventListener("click", () => {
                draft.tags.push({ id: makeId("tag"), group_id: group.id, name: "新标签", prompt: "" });
                render();
                body.querySelector(`[data-tag-id="${draft.tags.at(-1).id}"] textarea`)?.focus();
            });
            const removeGroup = smallButton("删除分组", "#b55a67");
            removeGroup.addEventListener("click", () => {
                const count = draft.tags.filter((tag) => tag.group_id === group.id).length;
                if (count && !window.confirm(`删除分组“${group.name}”及其中 ${count} 个标签？`)) return;
                if (!count && !window.confirm(`删除分组“${group.name}”？`)) return;
                draft.groups = draft.groups.filter((item) => item.id !== group.id);
                draft.tags = draft.tags.filter((tag) => tag.group_id !== group.id);
                render();
            });
            controls.append(up, down, addTag, removeGroup);
            groupHeader.append(groupName, controls);
            card.append(groupHeader);

            const groupTags = draft.tags.filter((tag) => tag.group_id === group.id);
            if (!groupTags.length) {
                const emptyTags = document.createElement("div");
                emptyTags.textContent = "此分组还没有标签。";
                emptyTags.style.cssText = "padding:10px;color:#8791a6;text-align:center;border:1px dashed #3b4458;border-radius:7px";
                card.append(emptyTags);
            }

            groupTags.forEach((tag, tagIndex) => {
                const row = document.createElement("div");
                row.dataset.tagId = tag.id;
                row.style.cssText = "display:grid;grid-template-columns:150px minmax(240px,1fr) 150px auto;gap:8px;align-items:start;margin-top:8px;padding:8px;border-radius:8px;background:#141923";
                const nameInput = document.createElement("input");
                nameInput.value = tag.name;
                nameInput.placeholder = "标签名";
                nameInput.style.cssText = "box-sizing:border-box;width:100%;border:1px solid #465166;border-radius:6px;background:#0f141d;color:#fff;padding:7px";
                nameInput.addEventListener("input", () => { tag.name = nameInput.value; });
                stopNodeEvents(nameInput);

                const promptInput = document.createElement("textarea");
                promptInput.value = tag.prompt;
                promptInput.placeholder = "标签对应的真实提示词";
                promptInput.rows = 2;
                promptInput.style.cssText = "box-sizing:border-box;width:100%;min-height:54px;resize:vertical;border:1px solid #465166;border-radius:6px;background:#0f141d;color:#e8edf8;padding:7px;line-height:1.45";
                promptInput.addEventListener("input", () => { tag.prompt = promptInput.value; });
                stopNodeEvents(promptInput);

                const groupSelect = document.createElement("select");
                groupSelect.style.cssText = "box-sizing:border-box;width:100%;border:1px solid #465166;border-radius:6px;background:#0f141d;color:#e8edf8;padding:7px";
                for (const optionGroup of draft.groups) {
                    const option = document.createElement("option");
                    option.value = optionGroup.id;
                    option.textContent = optionGroup.name;
                    option.selected = optionGroup.id === tag.group_id;
                    groupSelect.append(option);
                }
                groupSelect.addEventListener("change", () => {
                    tag.group_id = groupSelect.value;
                    render();
                });
                stopNodeEvents(groupSelect);

                const tagControls = document.createElement("div");
                tagControls.style.cssText = "display:flex;gap:4px";
                const tagUp = smallButton("↑");
                const tagDown = smallButton("↓");
                tagUp.title = "标签上移";
                tagDown.title = "标签下移";
                tagUp.disabled = tagIndex === 0;
                tagDown.disabled = tagIndex === groupTags.length - 1;
                tagUp.addEventListener("click", () => moveTag(tag.id, -1));
                tagDown.addEventListener("click", () => moveTag(tag.id, 1));
                const removeTag = smallButton("删除", "#b55a67");
                removeTag.addEventListener("click", () => {
                    if (!window.confirm(`删除标签“${tag.name}”？`)) return;
                    draft.tags = draft.tags.filter((item) => item.id !== tag.id);
                    render();
                });
                tagControls.append(tagUp, tagDown, removeTag);
                row.append(nameInput, promptInput, groupSelect, tagControls);
                card.append(row);
            });
            body.append(card);
        });
    }

    addGroupButton.addEventListener("click", () => {
        const group = { id: makeId("group"), name: "新分组" };
        draft.groups.push(group);
        render();
        const inputs = body.querySelectorAll("section input");
        inputs[inputs.length - 1]?.select();
    });

    saveButton.addEventListener("click", async () => {
        if (saving) return;
        const groupNames = draft.groups.map((group) => group.name.trim());
        if (groupNames.some((name) => !name)) {
            message.textContent = "分组名称不能为空。";
            message.style.color = "#ff9099";
            return;
        }
        if (new Set(groupNames).size !== groupNames.length) {
            message.textContent = "分组名称不能重复。";
            message.style.color = "#ff9099";
            return;
        }
        if (draft.tags.some((tag) => !tag.name.trim() || !tag.prompt.trim())) {
            message.textContent = "每个标签都必须填写标签名和真实提示词。";
            message.style.color = "#ff9099";
            return;
        }

        saving = true;
        saveButton.disabled = true;
        cancelButton.disabled = true;
        message.textContent = "正在保存…";
        message.style.color = "#aeb7cb";
        try {
            const saved = await CustomTagApi.save(draft);
            window.dispatchEvent(new CustomEvent(CONFIG_UPDATED_EVENT, { detail: cloneConfig(saved) }));
            ownerNode.graph?.change?.();
            close();
        } catch (error) {
            message.textContent = error?.message || String(error);
            message.style.color = "#ff9099";
            saving = false;
            saveButton.disabled = false;
            cancelButton.disabled = false;
        }
    });

    render();
}

function setupSelector(node) {
    node.title = NODE_TITLE;
    if (node.__xinbaoCustomTagsReady) {
        node.__xinbaoCustomTagsRestore?.();
        enforceNodeSize(node);
        return;
    }

    const stateWidget = node.widgets?.find((widget) => widget.name === "selected_tags");
    if (!stateWidget) return;
    node.__xinbaoCustomTagsReady = true;
    stateWidget.type = "converted-widget";
    stateWidget.hidden = true;
    stateWidget.draw = () => {};
    stateWidget.computeSize = () => [0, -4];

    let config = { groups: [], tags: [] };
    let configLoaded = false;
    let selected = parseSelection(stateWidget.value);
    const buttons = new Map();

    const root = document.createElement("div");
    root.style.cssText = "box-sizing:border-box;width:480px;min-width:480px;height:100%;padding:10px;overflow:auto;color:#f5f7ff;font-family:system-ui,-apple-system,'Microsoft YaHei',sans-serif;background:linear-gradient(180deg,rgba(25,28,38,.98),rgba(15,17,24,.98));border:1px solid rgba(255,255,255,.09);border-radius:8px";
    const top = document.createElement("div");
    top.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px";
    const hint = document.createElement("div");
    hint.textContent = "可多选，按分组输出文本";
    hint.style.cssText = "font-size:12px;color:#aeb6ca";
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:6px";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "编辑";
    editButton.disabled = true;
    editButton.style.opacity = ".55";
    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.textContent = "清空";
    for (const button of [editButton, clearButton]) {
        button.style.cssText = "border:1px solid #566079;background:#272c3a;color:#dbe2f3;border-radius:6px;padding:5px 11px;cursor:pointer";
        button.addEventListener("pointerdown", (event) => event.stopPropagation());
    }
    actions.append(editButton, clearButton);
    top.append(hint, actions);
    const content = document.createElement("div");
    root.append(top, content);

    function orderedTags() {
        const tags = [];
        for (const group of config.groups) {
            tags.push(...config.tags.filter((tag) => tag.group_id === group.id));
        }
        return tags;
    }

    function sync() {
        if (configLoaded) {
            const selectedSet = new Set(selected);
            selected = orderedTags().map((tag) => tag.id).filter((id) => selectedSet.has(id));
        }
        stateWidget.value = JSON.stringify(selected);
        stateWidget.callback?.(stateWidget.value);
        for (const [id, button] of buttons) button.style.cssText = buttonStyle(selected.includes(id));
        node.graph?.setDirtyCanvas?.(true, true);
    }

    function render() {
        buttons.clear();
        content.replaceChildren();
        if (!config.groups.length) {
            const empty = document.createElement("div");
            empty.textContent = configLoaded ? "暂无标签，点击“编辑”添加分组和标签。" : "正在读取标签…";
            empty.style.cssText = "padding:34px 10px;text-align:center;color:#929caf;font-size:13px";
            content.append(empty);
            return;
        }

        config.groups.forEach((group, index) => {
            const groupTags = config.tags.filter((tag) => tag.group_id === group.id);
            const heading = document.createElement("div");
            heading.textContent = group.name;
            heading.style.cssText = `margin:${index ? 12 : 6}px 0 6px;font-size:12px;font-weight:700;color:${index % 2 ? "#f4bf72" : "#72dcff"};letter-spacing:.04em`;
            content.append(heading);
            if (!groupTags.length) {
                const noTags = document.createElement("div");
                noTags.textContent = "暂无标签";
                noTags.style.cssText = "padding:7px;color:#747f94;font-size:12px";
                content.append(noTags);
                return;
            }
            const grid = document.createElement("div");
            grid.style.cssText = "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;width:100%";
            for (const tag of groupTags) {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = tag.name;
                button.title = tag.prompt;
                button.style.cssText = buttonStyle(selected.includes(tag.id));
                button.addEventListener("pointerdown", (event) => event.stopPropagation());
                button.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    selected = selected.includes(tag.id)
                        ? selected.filter((id) => id !== tag.id)
                        : [...selected, tag.id];
                    sync();
                });
                buttons.set(tag.id, button);
                grid.append(button);
            }
            content.append(grid);
        });
    }

    async function loadConfig() {
        try {
            config = await CustomTagApi.load();
            configLoaded = true;
            editButton.disabled = false;
            editButton.style.opacity = "1";
            render();
            sync();
        } catch (error) {
            configLoaded = true;
            content.replaceChildren();
            const failure = document.createElement("div");
            failure.textContent = `读取标签失败：${error?.message || error}`;
            failure.style.cssText = "padding:22px;color:#ff9099;font-size:13px";
            content.append(failure);
        }
    }

    editButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        editButton.disabled = true;
        try {
            config = await CustomTagApi.load();
            configLoaded = true;
            render();
            sync();
            openEditor(node, config);
        } catch (error) {
            window.alert(`读取标签失败：${error?.message || error}`);
        } finally {
            editButton.disabled = false;
        }
    });
    clearButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        selected = [];
        sync();
    });

    const onConfigUpdated = (event) => {
        config = cloneConfig(event.detail);
        configLoaded = true;
        editButton.disabled = false;
        editButton.style.opacity = "1";
        render();
        sync();
    };
    window.addEventListener(CONFIG_UPDATED_EVENT, onConfigUpdated);

    node.__xinbaoCustomTagsRestore = () => {
        selected = parseSelection(stateWidget.value);
        render();
        sync();
    };
    node.addDOMWidget("xinbao_custom_tags", "div", root, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => 350,
    });
    const originalConfigure = node.onConfigure;
    node.onConfigure = function () {
        const result = originalConfigure?.apply(this, arguments);
        this.__xinbaoCustomTagsRestore?.();
        setTimeout(() => enforceNodeSize(this), 0);
        return result;
    };
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
    const originalRemoved = node.onRemoved;
    node.onRemoved = function () {
        window.removeEventListener(CONFIG_UPDATED_EVENT, onConfigUpdated);
        return originalRemoved?.apply(this, arguments);
    };

    enforceNodeSize(node);
    render();
    sync();
    void loadConfig();
}

app.registerExtension({
    name: "xinbao.custom.tag.selector",
    nodeCreated(node) {
        if (node.comfyClass === NODE_CLASS || node.type === NODE_CLASS) setupSelector(node);
    },
    loadedGraphNode(node) {
        if (node.comfyClass === NODE_CLASS || node.type === NODE_CLASS) setupSelector(node);
    },
});
