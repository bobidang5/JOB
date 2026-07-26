import { describe, expect, it } from 'vitest';

import { PLATFORMS, PLATFORM_IDS, getPlatform, protocolOf } from './catalog';

/**
 * 目录是后台表单的数据源，也是 ai_providers.platform 的取值来源。
 * 这里守两件事：
 *
 *   1. 每条记录都齐整——协议必填，openai_compatible 的必须带得出默认端点，
 *      否则新建接入时用户面对一个空输入框，只能去翻各家文档。
 *   2. Anthropic 的型号清单逐个对上。它是需求方给定的，不是从别处推导出来的，
 *      改动只能来自需求方；顺手「更新一下」会让线上直接调到不存在的型号。
 */

const ANTHROPIC_MODELS = [
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-fable-5',
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
];

/** 这两个平台没有固定端点：Anthropic 走 SDK 默认，custom 由用户自己填 */
const NO_DEFAULT_BASE_URL = new Set(['anthropic', 'custom']);

describe('平台目录的完整性', () => {
  it('PLATFORMS 与 PLATFORM_IDS 一一对应且不重复', () => {
    expect(PLATFORMS.map((p) => p.id)).toEqual([...PLATFORM_IDS]);
    expect(new Set(PLATFORM_IDS).size).toBe(PLATFORM_IDS.length);
  });

  it.each(PLATFORMS)('$id 有显示名和协议', (platform) => {
    expect(platform.label.length).toBeGreaterThan(0);
    expect(['anthropic', 'openai_compatible']).toContain(platform.protocol);
  });

  it.each(PLATFORMS)('$id 的默认端点符合预期', (platform) => {
    if (NO_DEFAULT_BASE_URL.has(platform.id)) {
      expect(platform.defaultBaseUrl).toBe('');
      return;
    }

    expect(platform.defaultBaseUrl).toMatch(/^https:\/\//);
    // 适配器会自己接 /chat/completions，这里带尾斜杠会拼出双斜杠
    expect(platform.defaultBaseUrl.endsWith('/')).toBe(false);
  });

  it('只有 anthropic 走原生协议，其余都是 OpenAI 兼容', () => {
    const native = PLATFORMS.filter((p) => p.protocol === 'anthropic');

    expect(native.map((p) => p.id)).toEqual(['anthropic']);
  });

  it.each(PLATFORMS.filter((p) => p.id !== 'custom'))(
    '$id 给了建议型号',
    (platform) => {
      expect(platform.suggestedModels.length).toBeGreaterThan(0);
      for (const model of platform.suggestedModels) {
        expect(model.trim()).toBe(model);
        expect(model.length).toBeGreaterThan(0);
      }
    },
  );
});

describe('Anthropic 的型号清单', () => {
  it('逐个对上需求方给定的那一组', () => {
    expect(getPlatform('anthropic')?.suggestedModels).toEqual(ANTHROPIC_MODELS);
  });
});

describe('查找', () => {
  it('getPlatform 命中已知平台', () => {
    expect(getPlatform('deepseek')?.label).toBe('DeepSeek 深度求索');
  });

  it('getPlatform 对未知 id 返回 undefined', () => {
    expect(getPlatform('nonexistent')).toBeUndefined();
  });

  it('protocolOf 对未知 id 按 OpenAI 兼容处理', () => {
    // 历史行的 platform 可能已经从目录里删了，猜错的代价只是一次连接错误
    expect(protocolOf('some-removed-platform')).toBe('openai_compatible');
    expect(protocolOf('anthropic')).toBe('anthropic');
  });
});
