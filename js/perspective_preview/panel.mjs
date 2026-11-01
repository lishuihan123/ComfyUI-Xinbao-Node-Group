import * as THREE from "./vendor/three.module.mjs";
import { GLTFLoader } from "./vendor/GLTFLoader.mjs";

const labels = {"-90":"左90°","-45":"左45°","0":"0°","45":"右45°","90":"右90°"};
const heights = {"低":"低","中":"中","高":"高","顶":"顶"};
let state = {rotation:"0",height:"中",distance:"中"};
const stage = document.querySelector("#stage");
let renderer, camera, scene, group, floor, base;

function prompt() {
    const angle = Number(state.rotation);
    if (angle === 0 && state.height === "中" && state.distance === "大") {
        return "Xinbao，调整输入图像的拍摄距离。保持原有水平方位，摄像机水平看向同一个场景中心，拉远摄像机以扩大取景范围，保持焦距不变。保持场景内容、物体外观及相互位置关系一致。";
    }
    let text = "Xinbao，调整输入图像的整体透视视角。";
    if (angle) {
        const [sceneDir, cameraDir] = angle < 0 ? ["左", "右"] : ["右", "左"];
        text += `围绕同一个场景中心，将摄像机向${cameraDir}环绕${Math.abs(angle)}度，使整个场景呈现向${sceneDir}旋转${Math.abs(angle)}度的视角效果。`;
    } else {
        text += "保持原有水平方位，以同一个场景中心为观察中心。";
    }
    text += {
        "低": "摄像机位于观察中心下方，以45度仰角向上看向中心。",
        "中": "摄像机与观察中心保持等高，水平看向中心。",
        "高": "摄像机位于观察中心上方，以45度俯角向下看向中心。",
        "顶": "摄像机位于观察中心正上方，垂直向下俯拍。",
    }[state.height];
    text += state.distance === "中" ? "保持摄像机到观察中心的原有距离和焦距。" : "拉远摄像机，扩大取景范围，保持焦距不变。";
    return text + "保持场景内容、物体外观及相互位置关系一致，前景和背景随摄像机视角一起变化。";
}

function render() {
    if (!renderer) return;
    group.rotation.y = Number(state.rotation) * Math.PI / 180;
    const elevation = {"低":-45,"中":0,"高":45,"顶":90}[state.height] * Math.PI / 180;
    floor.visible = base.visible = state.height !== "低";
    const radius = state.distance === "大" ? 8.9 : 6.7;
    camera.position.set(0, Math.sin(elevation) * radius, Math.cos(elevation) * radius);
    camera.up.set(0, Math.cos(elevation), -Math.sin(elevation));
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
}

function update(next, notify = true) {
    if (next.rotation in labels) state.rotation = String(next.rotation);
    if (next.height in heights) state.height = next.height;
    if (["中", "大"].includes(next.distance)) state.distance = next.distance;
    for (const key of ["rotation","height","distance"]) {
        for (const button of document.querySelectorAll(`#${key} button`)) {
            button.setAttribute("aria-pressed", String(button.dataset.value === state[key]));
        }
    }
    document.querySelector("#prompt").textContent = prompt();
    document.querySelector("#view-label").textContent = `${labels[state.rotation]} · ${heights[state.height]} · 距离${state.distance}`;
    render();
    if (notify && parent !== window) parent.postMessage({type:"xinbao-perspective-change",state:{...state}}, location.origin);
}

for (const key of ["rotation","height","distance"]) {
    document.querySelector(`#${key}`).addEventListener("click", event => {
        const button = event.target.closest("button");
        if (button) update({[key]:button.dataset.value});
    });
}
window.addEventListener("message", event => {
    if (event.source === parent && event.origin === location.origin && event.data?.type === "xinbao-perspective-state") update(event.data.state, false);
});

try {
    renderer = new THREE.WebGLRenderer({antialias:true,alpha:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    stage.prepend(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
    group = new THREE.Group(); scene.add(group);
    scene.add(new THREE.HemisphereLight(0xfff5f1, 0xb98094, 1.3));
    const key = new THREE.DirectionalLight(0xfff3ec, 2.0);key.position.set(-3,6,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.bias=-.001;scene.add(key);
    const rim = new THREE.DirectionalLight(0xffd9df,.7);rim.position.set(4,2,-3);scene.add(rim);
    const plaster = new THREE.MeshStandardMaterial({color:0xf5f0ec,roughness:.85});
    base = new THREE.Mesh(new THREE.CylinderGeometry(.68,.76,.25,64),plaster);base.position.y=-1.28;base.receiveShadow=true;base.castShadow=true;group.add(base);
    floor = new THREE.Mesh(new THREE.PlaneGeometry(9,9),new THREE.MeshStandardMaterial({color:0xe9e3e4,roughness:.96}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.42;floor.receiveShadow=true;group.add(floor);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(9,7),new THREE.MeshStandardMaterial({color:0xce8ea1,roughness:1,side:THREE.DoubleSide}));wall.position.set(0,1.8,-3.2);wall.receiveShadow=true;group.add(wall);
    new GLTFLoader().load(new URL("./female_bust.glb",import.meta.url).href, gltf => {
        const bust = gltf.scene;
        const bounds = new THREE.Box3().setFromObject(bust);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const scale = 2.8/size.y;
        bust.scale.setScalar(scale);
        bust.position.copy(center).multiplyScalar(-scale);
        bust.traverse(object => {if (object.isMesh) {object.material=plaster;object.castShadow=true;object.receiveShadow=true;}});
        group.add(bust);
        document.querySelector("#loading").hidden=true;
        document.querySelector("#loading").style.display="none";
        render();
    }, undefined, () => {document.querySelector("#loading").textContent="石膏加载失败；角度按钮与提示词仍可使用。";});
    const observer = new ResizeObserver(() => {
        const w=stage.clientWidth,h=stage.clientHeight;
        renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();render();
    });
    observer.observe(stage);
    window.addEventListener("pagehide", () => {
        observer.disconnect();
        scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
        renderer.dispose();
    }, {once:true});
} catch (error) {
    document.querySelector("#loading").textContent="3D预览不可用；角度按钮与提示词仍可使用。";
    console.error("Xinbao perspective preview",error);
}
update(state,false);
if(parent!==window) parent.postMessage({type:"xinbao-perspective-ready"},location.origin);

// Measure the content rather than the iframe viewport, so saved tall nodes shrink too.
const contentObserver = new ResizeObserver(() => {
    if (parent !== window) parent.postMessage({
        type: "xinbao-perspective-resize",
        height: Math.ceil(document.querySelector("main").getBoundingClientRect().height),
    }, location.origin);
});
contentObserver.observe(document.querySelector("main"));
window.addEventListener("pagehide", () => contentObserver.disconnect(), {once:true});
