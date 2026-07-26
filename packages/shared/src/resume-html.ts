import type { ResumeContent, ResumeTemplateKey } from './schemas.js';

/**
 * 简历纸渲染器 —— App 内预览（react-native-webview）与导出 PDF
 * （expo-print）共用的唯一实现。
 *
 * 版式与 CSS 逐条移植自 prototype-interactive.html 的 paperHTML() 与
 * .paper 样式块，class 名保持一致，方便对照原型核对。
 *
 * 两处必要的扩展：
 *
 * 1. **缩放**。原型的字号（9–10px）是按 375pt 手机壳内的缩略预览定的，
 *    直接拿去打印 A4 会小到不可读。所以全部尺寸走 calc(x * var(--s))，
 *    预览 --s:1（与截图逐像素一致），打印 --s:1.75 并加 @page A4 边距。
 *    一份样式表、两种输出。
 *
 * 2. **转义**。简历内容来自用户上传与模型输出，必须转义后再拼进 HTML，
 *    否则 WebView 里就是一个 XSS。原型是固定假数据所以没做。
 */

export type RenderMode = 'preview' | 'print';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/* ------------------------------------------------------------------ */
/* v3「数据成果型」的核心数据条                                        */
/* ------------------------------------------------------------------ */

/**
 * 原型把「DAU +25% · 转化 +12% · 成本 −32%」写死在模板里。真实简历不能
 * 这样——那是李婷的数据。改为从本人的工作/项目要点里抽取百分比成果，
 * 最多取 3 条；一条都没有就整块不渲染。
 */
function extractHighlights(content: ResumeContent): string[] {
  const bullets = [
    ...content.exp.flatMap((e) => e.lis),
    ...content.projects.flatMap((p) => p.lis),
  ];
  const found: string[] = [];

  for (const bullet of bullets) {
    const matches = bullet.match(/[^，,。；;、]*?[+\-−]?\d+(?:\.\d+)?%[^，,。；;、]*/g);
    if (!matches) continue;
    for (const raw of matches) {
      const text = raw.trim();
      if (text.length > 0 && text.length <= 24 && !found.includes(text)) {
        found.push(text);
      }
      if (found.length === 3) return found;
    }
  }
  return found;
}

function chartBand(content: ResumeContent): string {
  const highlights = extractHighlights(content);
  if (highlights.length === 0) return '';

  // 柱子高度只是视觉节奏，用递增的固定梯度，不谎称是真实比例。
  const heights = [10, 16, 24, 13];
  const bars = highlights
    .map((_, i) => `<i style="height:${heights[i % heights.length]}px"></i>`)
    .join('');

  return (
    '<div class="pchart">' +
    `<div class="pcb">${bars}</div>` +
    `<span><b>核心数据</b><br>${highlights.map(escapeHtml).join(' · ')}</span>` +
    '</div>'
  );
}

/* ------------------------------------------------------------------ */
/* 段落                                                                */
/* ------------------------------------------------------------------ */

const section = (title: string): string =>
  `<div class="rp-h">${escapeHtml(title)}</div>`;

const headBlock = (content: ResumeContent): string =>
  '<div class="rp-head">' +
  `<div class="rp-name">${escapeHtml(content.name)}</div>` +
  `<div class="rp-meta">${escapeHtml(content.meta)}</div>` +
  '</div>';

const summaryBlock = (content: ResumeContent): string =>
  content.summary.trim().length === 0
    ? ''
    : section('自我评价') +
      `<div class="rp-skill">${escapeHtml(content.summary)}</div>`;

const experienceBlock = (content: ResumeContent): string =>
  content.exp
    .map(
      (e) =>
        '<div class="rp-row">' +
        `<span>${escapeHtml(e.co)}</span>` +
        `<span class="rp-date">${escapeHtml(e.date)}</span>` +
        '</div>' +
        e.lis.map((l) => `<div class="rp-li">· ${escapeHtml(l)}</div>`).join(''),
    )
    .join('');

const projectsBlock = (content: ResumeContent): string =>
  content.projects.length === 0
    ? ''
    : section('项目经历') +
      content.projects
        .map(
          (p) =>
            '<div class="rp-row">' +
            `<span>${escapeHtml(p.name)}</span>` +
            `<span class="rp-date">${escapeHtml(p.date)}</span>` +
            '</div>' +
            p.lis
              .map((l) => `<div class="rp-li">· ${escapeHtml(l)}</div>`)
              .join(''),
        )
        .join('');

const educationBlock = (content: ResumeContent): string =>
  section('教育背景') +
  '<div class="rp-row">' +
  `<span>${escapeHtml(content.edu)}</span>` +
  `<span class="rp-date">${escapeHtml(content.eduDate)}</span>` +
  '</div>';

const skillsBlock = (content: ResumeContent): string =>
  section('技能') + `<div class="rp-skill">${escapeHtml(content.skills)}</div>`;

/* ------------------------------------------------------------------ */
/* 四种版式                                                            */
/* ------------------------------------------------------------------ */

/** 简历纸主体，不含 <html> 外壳。对应原型的 paperHTML(d, v)。 */
export function renderPaperBody(
  content: ResumeContent,
  template: ResumeTemplateKey,
): string {
  const head = headBlock(content);
  const experience = section('工作经历') + experienceBlock(content);

  // v2 经典双栏：左侧栏放头像首字 + 技能 + 教育，右侧主栏放工作经历。
  if (template === 'v2') {
    const initial = content.name.slice(-1);
    const skillLines = content.skills
      .split(' / ')
      .slice(0, 4)
      .map(escapeHtml)
      .join('<br>');
    return (
      head +
      '<div class="pp2">' +
      '<aside>' +
      `<div class="pavatar2">${escapeHtml(initial)}</div>` +
      section('技能') +
      `<div class="rp-skill">${skillLines}</div>` +
      section('教育') +
      `<div class="rp-skill">${escapeHtml(content.edu)}</div>` +
      '</aside>' +
      `<main>${summaryBlock(content)}${experience}${projectsBlock(content)}</main>` +
      '</div>'
    );
  }

  // v3 数据成果型：抬头下方一条核心数据带。
  if (template === 'v3') {
    return (
      head +
      chartBand(content) +
      summaryBlock(content) +
      experience +
      projectsBlock(content) +
      educationBlock(content) +
      skillsBlock(content)
    );
  }

  // v1 简洁单栏 / v4 应届通用 —— 结构相同，v4 由 .paper.v4 的 CSS 居中抬头。
  return (
    head +
    '<div class="rp-rule"></div>' +
    summaryBlock(content) +
    experience +
    projectsBlock(content) +
    educationBlock(content) +
    skillsBlock(content)
  );
}

/* ------------------------------------------------------------------ */
/* 样式                                                                */
/* ------------------------------------------------------------------ */

const PAPER_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#F7F7FA;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}
body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif;color:#111114}
.paper{background:#fff;border:1px solid #ECECF1;border-radius:calc(14px * var(--s));padding:calc(17px * var(--s)) calc(16px * var(--s));box-shadow:0 8px 22px rgba(17,17,26,.07)}
.rp-name{font-size:calc(16px * var(--s));font-weight:800}
.rp-meta{font-size:calc(9.5px * var(--s));color:#8E8E93;margin-top:calc(3px * var(--s))}
.rp-rule{height:calc(2px * var(--s));background:#007AFF;border-radius:1px;margin:calc(9px * var(--s)) 0 calc(2px * var(--s))}
.rp-h{font-size:calc(10px * var(--s));font-weight:800;color:#007AFF;margin:calc(9px * var(--s)) 0 calc(2px * var(--s));letter-spacing:calc(1.5px * var(--s))}
.rp-row{display:flex;justify-content:space-between;align-items:baseline;font-size:calc(10px * var(--s));font-weight:700;margin-top:calc(4px * var(--s));gap:calc(8px * var(--s))}
.rp-date{color:#AEAEB2;font-weight:500;font-size:calc(8.5px * var(--s));white-space:nowrap}
.rp-li{font-size:calc(9px * var(--s));color:#48484A;line-height:1.6;margin-top:calc(2px * var(--s))}
.rp-skill{font-size:calc(9.5px * var(--s));color:#48484A;line-height:1.6;margin-top:calc(2px * var(--s))}
.pp2{display:flex;gap:calc(10px * var(--s));margin-top:calc(8px * var(--s))}
.pp2 aside{width:33%;background:#F4F6F9;border-radius:calc(8px * var(--s));padding:calc(9px * var(--s)) calc(8px * var(--s));text-align:center}
.pp2 .pavatar2{width:calc(30px * var(--s));height:calc(30px * var(--s));border-radius:50%;background:#D9E4F5;color:#2F6BFF;font-size:calc(12px * var(--s));font-weight:800;display:flex;align-items:center;justify-content:center;margin:0 auto calc(6px * var(--s))}
.pp2 aside .rp-h{text-align:left}
.pp2 aside .rp-skill{font-size:calc(8.5px * var(--s));text-align:left}
.pp2 main{flex:1;min-width:0}
.pchart{display:flex;gap:calc(10px * var(--s));align-items:center;background:#F4F8FF;border-radius:calc(8px * var(--s));padding:calc(8px * var(--s)) calc(10px * var(--s));margin-top:calc(8px * var(--s))}
.pchart .pcb{display:flex;gap:calc(4px * var(--s));align-items:flex-end;height:calc(26px * var(--s))}
.pchart .pcb i{width:calc(9px * var(--s));border-radius:2px;background:#9CC5FF;display:block}
.pchart span{font-size:calc(8.5px * var(--s));color:#5E80B3;line-height:1.5}
.paper.v4 .rp-head{text-align:center}
`.trim();

const PREVIEW_CSS = `
:root{--s:1}
html,body{height:100%}
body{padding:0}
.paper{min-height:100%;border-radius:calc(14px * var(--s))}
`.trim();

const PRINT_CSS = `
:root{--s:1.75}
@page{size:A4;margin:14mm}
html,body{background:#fff}
.paper{border:0;border-radius:0;box-shadow:none;padding:0}
.rp-row,.rp-li{break-inside:avoid}
.rp-h{break-after:avoid}
`.trim();

/**
 * 完整的 HTML 文档。
 *
 * - mode 'preview'：喂给 react-native-webview，尺寸与原型截图一致
 * - mode 'print'：喂给 expo-print 的 printToFileAsync({ html })，A4 版心
 *
 * 中文字体两边都走 iOS 系统的 PingFang SC，无需内嵌字体文件。
 */
export function renderResumeDocument(
  content: ResumeContent,
  template: ResumeTemplateKey,
  mode: RenderMode = 'preview',
): string {
  const modeCss = mode === 'print' ? PRINT_CSS : PREVIEW_CSS;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>${escapeHtml(content.name)}</title>
<style>${PAPER_CSS}
${modeCss}</style>
</head>
<body>
<div class="paper ${template}">${renderPaperBody(content, template)}</div>
</body>
</html>`;
}
