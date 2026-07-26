import { describe, expect, it } from 'vitest';

import {
  MOCK_RESUME_MINE,
  MOCK_RESUME_SAMPLE,
  MOCK_TEMPLATES,
} from './mock/index.js';
import { renderPaperBody, renderResumeDocument } from './resume-html.js';
import type { ResumeContent } from './schemas.js';

const EMPTY: ResumeContent = {
  name: '张三',
  meta: '产品经理',
  summary: '',
  exp: [],
  projects: [],
  edu: '某大学',
  eduDate: '2018 – 2022',
  skills: '沟通',
};

describe('四种版式', () => {
  it('每种都能渲染出非空内容', () => {
    for (const template of MOCK_TEMPLATES) {
      const html = renderPaperBody(MOCK_RESUME_MINE, template.key);
      expect(html.length).toBeGreaterThan(0);
      expect(html).toContain('李婷');
      expect(html).toContain('工作经历');
    }
  });

  it('v1 简洁单栏有蓝色分隔线，没有双栏结构', () => {
    const html = renderPaperBody(MOCK_RESUME_MINE, 'v1');
    expect(html).toContain('rp-rule');
    expect(html).not.toContain('pp2');
  });

  it('v2 经典双栏有左侧栏与姓名首字头像', () => {
    const html = renderPaperBody(MOCK_RESUME_MINE, 'v2');
    expect(html).toContain('class="pp2"');
    expect(html).toContain('<aside>');
    expect(html).toContain('class="pavatar2">婷<');
    // 左侧栏只取前 4 项技能（原型 slice(0,4)）
    expect(html).toContain('数据分析<br>SQL<br>A/B 测试<br>Axure');
  });

  it('v3 数据成果型从本人要点里抽百分比，而不是写死原型的示例数字', () => {
    const html = renderPaperBody(MOCK_RESUME_MINE, 'v3');
    expect(html).toContain('pchart');
    expect(html).toContain('核心数据');
    expect(html).toContain('25%');
    // 原型模板里写死的那串不该出现在别人的简历上
    expect(html).not.toContain('DAU +25% · 转化 +12% · 成本 −32%');
  });

  it('没有量化成果时 v3 整块数据带不渲染', () => {
    const html = renderPaperBody(EMPTY, 'v3');
    expect(html).not.toContain('pchart');
  });

  it('v4 与 v1 结构相同，靠 .paper.v4 的 CSS 居中抬头', () => {
    expect(renderPaperBody(MOCK_RESUME_MINE, 'v4')).toBe(
      renderPaperBody(MOCK_RESUME_MINE, 'v1'),
    );
    expect(renderResumeDocument(MOCK_RESUME_MINE, 'v4')).toContain(
      'class="paper v4"',
    );
    expect(renderResumeDocument(MOCK_RESUME_MINE, 'v4')).toContain(
      '.paper.v4 .rp-head{text-align:center}',
    );
  });
});

describe('空段落', () => {
  it('自我评价为空时不渲染该段', () => {
    expect(renderPaperBody(EMPTY, 'v1')).not.toContain('自我评价');
    expect(renderPaperBody(MOCK_RESUME_MINE, 'v1')).toContain('自我评价');
  });

  it('没有项目经历时不渲染该段', () => {
    expect(renderPaperBody(MOCK_RESUME_SAMPLE, 'v1')).not.toContain('项目经历');
    expect(renderPaperBody(MOCK_RESUME_MINE, 'v1')).toContain('项目经历');
  });
});

describe('转义', () => {
  it('简历内容里的 HTML 被转义，不会在 WebView 里执行', () => {
    const hostile: ResumeContent = {
      ...EMPTY,
      name: '<script>alert(1)</script>',
      summary: '"><img src=x onerror=alert(2)>',
      skills: 'a & b',
    };
    const html = renderResumeDocument(hostile, 'v1');

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a &amp; b');
  });

  it('工作经历要点同样被转义', () => {
    const hostile: ResumeContent = {
      ...EMPTY,
      exp: [{ co: '<b>x</b>', date: '2024', lis: ['<iframe src=evil>'] }],
    };
    const html = renderPaperBody(hostile, 'v1');
    expect(html).not.toContain('<iframe');
    expect(html).toContain('&lt;iframe');
  });
});

describe('预览与打印两种输出', () => {
  it('预览用 1 倍尺寸，与原型截图一致', () => {
    const html = renderResumeDocument(MOCK_RESUME_MINE, 'v1', 'preview');
    expect(html).toContain('--s:1');
    expect(html).not.toContain('@page');
  });

  it('打印放大到 1.75 倍并加 A4 版心', () => {
    const html = renderResumeDocument(MOCK_RESUME_MINE, 'v1', 'print');
    expect(html).toContain('--s:1.75');
    expect(html).toContain('@page{size:A4;margin:14mm}');
    expect(html).toContain('break-inside:avoid');
  });

  it('两种模式共用同一份正文，只有样式不同', () => {
    const body = renderPaperBody(MOCK_RESUME_MINE, 'v2');
    expect(renderResumeDocument(MOCK_RESUME_MINE, 'v2', 'preview')).toContain(
      body,
    );
    expect(renderResumeDocument(MOCK_RESUME_MINE, 'v2', 'print')).toContain(
      body,
    );
  });

  it('是一份自洽的 HTML 文档', () => {
    const html = renderResumeDocument(MOCK_RESUME_MINE, 'v1');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<meta charset="UTF-8">');
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });
});
