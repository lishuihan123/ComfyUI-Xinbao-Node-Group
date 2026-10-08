export function cropSize(state) {
    const [p, q] = state.ratio === "custom"
        ? [Number(state.custom_width), Number(state.custom_height)]
        : state.ratio.split(":").map(Number);
    if (![p, q].every(v => Number.isFinite(v) && v > 0)) return [NaN, NaN];
    const ratio = p / q;
    const useWidth = state.edge === "width" || (state.edge === "long" && ratio >= 1) || (state.edge === "short" && ratio < 1);
    const dims = useWidth ? [state.pixels, state.pixels / ratio] : [state.pixels * ratio, state.pixels];
    return dims.map(v => Math.max(state.multiple, Math.round(v / state.multiple) * state.multiple));
}

export function imageRect(state, width, height, sourceWidth, sourceHeight) {
    const scale = Math.max(width / sourceWidth, height / sourceHeight) * state.zoom;
    return {
        width: sourceWidth * scale,
        height: sourceHeight * scale,
        left: (width - sourceWidth * scale) / 2 + state.x * width,
        top: (height - sourceHeight * scale) / 2 + state.y * height,
    };
}

export function alignedPosition(state, width, height, sourceWidth, sourceHeight, column, row) {
    const rect = imageRect(state, width, height, sourceWidth, sourceHeight);
    return {
        x: (column - 1) * (width - rect.width) / (2 * width),
        y: (row - 1) * (height - rect.height) / (2 * height),
    };
}
