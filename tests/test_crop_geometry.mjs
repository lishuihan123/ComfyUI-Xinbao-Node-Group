import assert from 'node:assert/strict';
import {cropSize, imageRect, alignedPosition} from '../js/crop_geometry.js';

for (const [width, height, sw, sh] of [[1024,448,512,512],[768,1024,1146,1528],[800,800,1200,400]]) {
    for (const zoom of [0.25, 1, 2.5]) {
        for (let row=0;row<3;row++) for (let column=0;column<3;column++) {
            const state={zoom,x:0,y:0};
            const aligned=alignedPosition(state,width,height,sw,sh,column,row);
            const rect=imageRect({...state,...aligned},width,height,sw,sh);
            assert(Math.abs(rect.left-(width-rect.width)*column/2)<1e-9);
            assert(Math.abs(rect.top-(height-rect.height)*row/2)<1e-9);
        }
    }
}
assert.deepEqual(cropSize({ratio:'custom',custom_width:2.35,custom_height:1,edge:'long',pixels:1024,multiple:32}),[1024,448]);
assert.deepEqual(cropSize({ratio:'custom',custom_width:1,custom_height:2.5,edge:'long',pixels:1024,multiple:16}),[416,1024]);
console.log('Passed: custom ratios and nine-grid alignment for smaller/larger images.');
