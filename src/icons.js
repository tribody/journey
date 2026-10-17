/* =====================================================================
 * 图标库（唯一数据源）
 * 同一份路径数据同时用于 DOM 里的 <symbol> 精灵 与 canvas 绘制的 3D 图标
 * ===================================================================== */

export const ICONS = {
  /* ---- 回忆 ---- */
  fireworks: {
    paths: [
      'M12 12 12 3.2', 'M12 12 18.6 5.4', 'M12 12 5.4 5.4',
      'M12 12 18.2 18.4', 'M12 12 5.8 18.4',
    ],
    circles: [[12, 12, 1.5]],
  },
  heart: {
    paths: [
      'M12 20.4C12 20.4 3.6 15 3.6 9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8.4 2.5c0 5.5-8.4 10.9-8.4 10.9Z',
    ],
  },
  mountain: {
    paths: ['M2.4 19.6 8.6 8.6l3.6 6.2 2.6-3.6 6.8 8.4Z'],
  },
  sun: {
    paths: [
      'M12 2.8v2.2', 'M12 19v2.2', 'M2.8 12h2.2', 'M19 12h2.2',
      'M5.5 5.5 7 7', 'M17 17l1.5 1.5', 'M18.5 5.5 17 7', 'M7 17l-1.5 1.5',
    ],
    circles: [[12, 12, 4.4]],
  },
  sea: {
    paths: [
      'M2 12.8c3.3-3.4 6.7-3.4 10 0s6.7 3.4 10 0',
      'M2 17.6c3.3-3.4 6.7-3.4 10 0s6.7 3.4 10 0',
    ],
  },
  cat: {
    paths: [
      'M6.6 11.8a5.4 5.4 0 0 0 10.8 0',
      'M6.9 11.6 5.6 6.2l4.3 2.7', 'M17.1 11.6 18.4 6.2l-4.3 2.7',
      'M2.6 14.6l3.7.4M2.8 17.4l3.6-.5M21.4 14.6l-3.7.4M21.2 17.4l-3.6-.5',
    ],
    circles: [[9.9, 11.4, 0.9], [14.1, 11.4, 0.9]],
  },
  ring: {
    paths: ['M8.6 10.4h6.8l-3.4 9.6Z', 'M9.2 10.4 12 6.6l2.8 3.8', 'M9.2 10.4h5.6'],
  },
  ride: {
    paths: ['M2.4 18.2c2.2-9.6 4.2-9.6 6.4 0s4.2-9.6 6.4 0 4.2-9.6 6.4 0'],
  },
  dress: {
    paths: ['M9 3.2h6l-1 4.2 4.2 12.6H5.8L10 7.4Z'],
  },
  palm: {
    paths: [
      'M12 21.2c0-6.4-.5-10.2-1.7-13',
      'M10.3 8.2C7.8 3.9 4.1 4.1 2.3 7c2.7 1.7 5.4 1.9 8 1.2',
      'M10.3 8.2C9.4 3.5 12.9 1 16.4 2.3c-.6 2.9-2.7 5.2-6.1 5.9',
      'M10.3 8.2c3.7-2.7 7.6-2 9.7 1.1-2.9 1.4-5.8 1-9.7-1.1',
    ],
  },
  plane: {
    paths: ['M21.4 3.4 2.7 11.3l6.6 2.2 2.2 7.3Z', 'M9.3 13.5 21.4 3.4'],
  },
  home: {
    paths: ['M2.8 11.2 12 3.7l9.2 7.5', 'M5.1 9.8v9.9h13.8V9.8', 'M10 19.7v-4.6h4v4.6'],
  },
  hotpot: {
    paths: [
      'M4.2 10.2h15.6v4.4a5.8 5.8 0 0 1-5.8 5.8h-4a5.8 5.8 0 0 1-5.8-5.8Z',
      'M8.9 7.2c0-1.6 1.6-1.8 1.6-3.4', 'M14.2 7.2c0-1.6-1.6-1.8-1.6-3.4',
    ],
  },
  baby: {
    paths: ['M6.4 20.6a5.6 5.6 0 0 1 11.2 0', 'M12 5.6c0-1.9 1.8-2.1 1.8-3.3'],
    circles: [[12, 11.8, 3.5]],
  },
  bbq: {
    paths: [
      'M3.4 20.6 20.6 3.4',
      'M12.6 7.2l4.2 4.2', 'M9 10.8l4.2 4.2', 'M5.4 14.4l4.2 4.2',
    ],
  },

  /* ---- 界面 ---- */
  album: {
    paths: ['M3.4 5.6h17.2v12.8H3.4Z', 'M3.4 15.6l4.6-4.2 4 3.4 3.2-2.8 4.4 4'],
    circles: [[16.6, 8.8, 1.2]],
  },
  letter: {
    paths: ['M3.4 6.4h17.2v11.2H3.4Z', 'M3.4 7 12 13.4 20.6 7'],
  },
  music: {
    paths: ['M9 17.8V5.6l9.2-2v10.6'],
    circles: [[6.6, 18, 2.4], [15.8, 14.6, 2.4]],
  },
  mute: {
    paths: [
      'M4.6 9.4h3.3L12 5.6v12.8l-4.1-3.8H4.6Z',
      'M15.4 9.6 20.2 14.4', 'M20.2 9.6 15.4 14.4',
    ],
  },
  sound: {
    paths: [
      'M4.6 9.4h3.3L12 5.6v12.8l-4.1-3.8H4.6Z',
      'M15 9.2a4.4 4.4 0 0 1 0 5.6', 'M17.6 6.6a8 8 0 0 1 0 10.8',
    ],
  },
  help: {
    paths: ['M9.6 9.4a2.6 2.6 0 1 1 3.5 3.5c-.8.6-1.1 1.2-1.1 2.2M12 18.2v.1'],
    circles: [[12, 12, 8.6]],
  },
  close: { paths: ['M5.8 5.8 18.2 18.2', 'M18.2 5.8 5.8 18.2'] },
  arrow: { paths: ['M9.2 5.6 15.6 12l-6.4 6.4'] },
  car: {
    paths: ['M2.8 15.4h18.4M6.2 15.4V12l2-4.2h7.6l2 4.2v3.4', 'M6.2 12h11.6'],
    circles: [[7.4, 16.6, 1.8], [16.6, 16.6, 1.8]],
  },
  key: {
    paths: ['M10.4 13.6 19.8 4.2', 'M16.6 7.4l2.4 2.4', 'M13.8 10.2l1.6 1.6'],
    circles: [[6.6, 17.4, 4]],
  },
  star: {
    paths: ['M12 3.4l2.5 5.4 5.9.7-4.3 4 1.1 5.8L12 16.5l-5.2 2.8 1.1-5.8-4.3-4 5.9-.7Z'],
  },
  compass: {
    paths: ['M15.4 8.6 8.6 15.4l3.4-1.2 1.2-3.4Z'],
    circles: [[12, 12, 8.6]],
  },
};

/** 生成 DOM 精灵：<svg><symbol>…</symbol></svg> */
export function iconSpriteSvg() {
  const symbols = Object.entries(ICONS).map(([name, ic]) => {
    const p = (ic.paths || []).map(d => `<path d="${d}"/>`).join('');
    const c = (ic.circles || []).map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
    const f = (ic.fills || []).map(d => `<path class="f" d="${d}"/>`).join('');
    return `<symbol id="i-${name}" viewBox="0 0 24 24">${p}${c}${f}</symbol>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="sprite" aria-hidden="true"><defs>${symbols}</defs></svg>`;
}

/** 把图标画到 canvas（用于 3D 中的 Sprite 贴图） */
export function drawIcon(ctx, name, size, color, lineWidth = 1.7, glow = 0) {
  const ic = ICONS[name];
  const s = size / 24;
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(s, s);
  ctx.translate(-12, -12);
  ctx.strokeStyle = color;
  ctx.fillStyle = 'none';
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (glow > 0) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  for (const d of ic.paths || []) ctx.stroke(new Path2D(d));
  for (const [x, y, r] of ic.circles || []) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
  for (const d of ic.fills || []) ctx.fill(new Path2D(d));
  ctx.restore();
}
