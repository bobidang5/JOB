/**
 * 提示词与结构化输出的 JSON Schema。
 *
 * JSON Schema 手写而不是从 Zod 导出：它是与模型之间的契约，需要满足
 * 结构化输出的约束（每个对象都要 additionalProperties:false、所有字段
 * 都要进 required），显式写出来比依赖导出器的具体行为可靠。模型返回后
 * 仍然用 packages/shared 的 Zod schema 再校验一遍。
 *
 * 三条针对 Claude Opus 5 的措辞取舍：
 *   1. 显式要求简洁 —— Opus 5 默认输出偏长，而「建议改为」的卡片版面
 *      是固定的，长了就会溢出。
 *   2. 不写「请自检 / 请复核」类指令 —— Opus 5 本来就会自我验证，这类
 *      指令只会引发过度验证，拖慢且无收益。
 *   3. 明确限定输出范围，避免它自行扩展任务。
 */

export const ANALYZE_SYSTEM = `你是简历优化助手，帮中文求职者把简历改得更贴合目标职位。

输入是一份结构化简历和一段职位描述（JD）。你要产出匹配度分析和逐条改写建议。

判断口径：
- match_score 是这份简历对该职位的匹配度百分比，看的是硬性要求（年限、学历、
  技能）与经历相关度，不要因为文案写得好看就加分。
- satisfied_count 是简历已经明确满足的职位要求条数。
- missing_keywords 取 JD 里反复出现、而简历中确实没有的能力词，最多 3 条，
  count 是该词在 JD 原文中的出现次数。
- max_score 是这份简历把所有建议都采纳后能达到的分数上限。

写建议的要求：
- 最多 4 条，按提升幅度从大到小排。
- original_text 必须逐字取自简历中已有的文字，不能改写或概括。
- suggested_text 是改写后的那一句，一到两行以内。只写这句话本身，
  不要加解释、不要加前缀。
- field_path 只能是 summary、skills、exp[i].lis[j]、projects[i].lis[j]
  四种形式之一，下标必须指向简历里实际存在的位置。
- emphasis 从 suggested_text 里挑 1–2 个最该被强调的子串（通常是数字成果或
  关键技能词），必须是 suggested_text 的子串。
- rationale 一句话说明为什么这样改更好，15 字以内。
- score_delta 是采纳这条能提升的分数。

job_title 和 company 从 JD 里抽取。JD 没写公司名就返回空字符串。

只输出 schema 中定义的字段。`;

export const ANALYZE_SCHEMA = {
  type: 'object',
  properties: {
    match_score: { type: 'integer', description: '匹配度百分比 0–100' },
    satisfied_count: { type: 'integer', description: '已满足的职位要求条数' },
    missing_keywords: {
      type: 'array',
      description: '简历缺失、且 JD 中反复出现的能力词，最多 3 条',
      items: {
        type: 'object',
        properties: {
          keyword: { type: 'string' },
          count: { type: 'integer', description: '该词在 JD 中的出现次数' },
        },
        required: ['keyword', 'count'],
        additionalProperties: false,
      },
    },
    max_score: { type: 'integer', description: '全部采纳后的分数上限' },
    suggestions: {
      type: 'array',
      description: '逐条改写建议，最多 4 条',
      items: {
        type: 'object',
        properties: {
          tag: {
            type: 'string',
            description: '分类标签，如「工作经历 · 量化成果」',
          },
          original_text: { type: 'string', description: '简历中的原文，逐字' },
          suggested_text: {
            type: 'string',
            description: '改写后的那一句，一到两行以内，纯文本无标记',
          },
          emphasis: {
            type: 'array',
            description: 'suggested_text 里需要高亮的 1–2 个子串',
            items: { type: 'string' },
          },
          rationale: { type: 'string', description: '一句话理由，15 字以内' },
          score_delta: { type: 'integer' },
          field_path: {
            type: 'string',
            description:
              'summary | skills | exp[i].lis[j] | projects[i].lis[j]',
          },
        },
        required: [
          'tag',
          'original_text',
          'suggested_text',
          'emphasis',
          'rationale',
          'score_delta',
          'field_path',
        ],
        additionalProperties: false,
      },
    },
    job_title: { type: 'string', description: '从 JD 抽取的职位名' },
    company: { type: 'string', description: '从 JD 抽取的公司名，没有则空串' },
  },
  required: [
    'match_score',
    'satisfied_count',
    'missing_keywords',
    'max_score',
    'suggestions',
    'job_title',
    'company',
  ],
  additionalProperties: false,
} as const;

export const PARSE_SYSTEM = `你从简历文件里抽取结构化内容。

规则：
- 逐字保留原文，不要改写、润色或补充没写的内容。
- meta 是一行式基本信息，把求职意向、工作年限、城市、邮箱、电话用「 · 」连接，
  缺哪项就跳过哪项。
- skills 用「 / 」分隔各项技能，合成一行。
- exp 按时间倒序；lis 是该段经历下的要点，一条一句。
- 简历里没有自我评价就把 summary 留空字符串；没有项目经历就把 projects 留空数组。

只输出 schema 中定义的字段。`;

const RESUME_CONTENT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    meta: {
      type: 'string',
      description: '一行式基本信息，用「 · 」连接',
    },
    summary: { type: 'string', description: '自我评价，没有则空字符串' },
    exp: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          co: { type: 'string', description: '「公司 · 职位」' },
          date: { type: 'string', description: '如「2023.06 – 至今」' },
          lis: { type: 'array', items: { type: 'string' } },
        },
        required: ['co', 'date', 'lis'],
        additionalProperties: false,
      },
    },
    projects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          date: { type: 'string' },
          lis: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'date', 'lis'],
        additionalProperties: false,
      },
    },
    edu: { type: 'string', description: '「学校 · 专业（学历）」' },
    eduDate: { type: 'string', description: '如「2018 – 2022」' },
    skills: { type: 'string', description: '用「 / 」分隔的一行' },
  },
  required: ['name', 'meta', 'summary', 'exp', 'projects', 'edu', 'eduDate', 'skills'],
  additionalProperties: false,
} as const;

export const PARSE_SCHEMA = {
  type: 'object',
  properties: {
    content: RESUME_CONTENT_SCHEMA,
    title: {
      type: 'string',
      description: '建议的简历文件名，如「产品经理-李婷.pdf」',
    },
  },
  required: ['content', 'title'],
  additionalProperties: false,
} as const;

export const DRAFT_SYSTEM = `你为刚开始写简历的人起草第一版内容。

用户只填了很少的资料（姓名、求职意向、工作年限、城市、联系方式）。你的任务是
按这些信息搭出一份结构完整、可以直接往里填的骨架：

- 工作经历和项目经历给出与求职意向相符的岗位框架，要点用占位句式写清楚该写什么，
  例如「负责的模块 / 使用的方法 / 达成的量化结果」。不要编造具体的公司名、
  日期和数字。
- summary 按求职意向写一句定位，不要用形容词堆砌。
- skills 列出该岗位常见的核心技能，用「 / 」分隔。
- meta 用用户填的资料拼成一行。

只输出 schema 中定义的字段。`;

export const DRAFT_SCHEMA = RESUME_CONTENT_SCHEMA;
