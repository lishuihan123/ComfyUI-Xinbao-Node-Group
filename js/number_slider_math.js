const UNITS = 1e6;
const rounded = (value) => Math.sign(value) * Math.round(Math.abs(value));

export function sliderState(start, end, step, value) {
    const numbers = [start, end, step, value].map(Number);
    if (!numbers.every(Number.isFinite)) throw new Error("滑条参数必须是有限数值");
    const [lo, hi, increment, raw] = numbers.map((item) => rounded(item * UNITS));
    if (lo > hi) throw new Error("起始值不能大于结束值");
    if (increment <= 0) throw new Error("步长至少为 0.000001");
    const count = Math.ceil((hi - lo) / increment);
    const clamped = Math.max(lo, Math.min(hi, raw));
    const index = clamped === hi ? count : Math.round((clamped - lo) / increment);
    const current = Math.min(hi, lo + index * increment) / UNITS;
    return { value: current, integer: rounded(current), index, count };
}

export function valueAtIndex(start, end, step, index) {
    return Math.min(rounded(Number(end) * UNITS), rounded(Number(start) * UNITS) + Number(index) * rounded(Number(step) * UNITS)) / UNITS;
}
