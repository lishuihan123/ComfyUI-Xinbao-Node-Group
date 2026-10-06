// The file is also discovered by ComfyUI's extension loader; only run in our gallery.
(() => {
    const gallery = document.getElementById('gallery');
    if (!gallery || document.title !== '心宝打光搭档 · 光效预览') return;
    const cacheToken = Date.now().toString();
    const make = (tag, className, text) => {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text) element.textContent = text;
        return element;
    };
    function card(item) {
        const article = make('article', 'card');
        article.dataset.lightKey = item.key;
        article.append(make('h2', '', item.title));
        if (!item.before || !item.after) {
            const empty = make('div', 'frame empty');
            empty.append(make('span', '', '暂无案例'), make('small', '', '后续补充'));
            article.append(empty);
            return article;
        }
        const frame = make('div', 'frame');
        const after = make('img', 'after');
        after.src = `${item.after}?v=${cacheToken}`;
        after.alt = item.title + '效果图';
        after.loading = 'lazy';
        const before = make('img', 'before');
        before.src = `${item.before}?v=${cacheToken}`;
        before.alt = item.title + '原图';
        before.loading = 'lazy';
        const divider = make('div', 'divider');
        frame.append(before, after, divider, make('span', 'tag effect-label', '效果图'), make('span', 'tag original-label', '原图'));
        const controls = make('div', 'controls');
        const range = make('input');
        range.type = 'range'; range.min = '0'; range.max = '100'; range.value = '0';
        range.setAttribute('aria-label', item.title + '效果图显示比例');
        controls.append(make('span', '', '对比'), range);
        const reveal = value => {
            const percent = Math.max(0, Math.min(100, Number(value)));
            after.style.clipPath = `inset(0 ${100-percent}% 0 0)`;
            divider.style.left = percent + '%';
            frame.classList.toggle('comparing', percent > 0);
            range.value = String(percent);
        };
        frame.addEventListener('pointerenter', () => reveal(50));
        frame.addEventListener('pointermove', event => {
            const box = frame.getBoundingClientRect();
            reveal((event.clientX-box.left)/box.width*100);
        });
        frame.addEventListener('pointerleave', () => reveal(0));
        frame.addEventListener('pointerdown', event => {
            if (event.pointerType !== 'mouse') reveal(100);
        });
        frame.addEventListener('pointerup', event => {
            if (event.pointerType !== 'mouse') reveal(0);
        });
        range.addEventListener('input', () => reveal(range.value));
        for (const img of [before, after]) img.addEventListener('error', () => {
            frame.replaceChildren(make('div', 'frame empty', '图片加载失败，请刷新重试'));
            range.disabled = true;
        });
        article.append(frame, controls);
        return article;
    }
    fetch(`./cases.json?v=${cacheToken}`, { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error('无法加载案例');
        return response.json();
    }).then(cases => gallery.replaceChildren(...cases.map(card))).catch(() => {
        document.getElementById('status').textContent = '案例暂时无法加载，请刷新重试。';
    });
})();
