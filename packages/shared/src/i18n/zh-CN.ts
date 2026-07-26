/**
 * 全部界面文案。
 *
 * 组件一律从这里取字符串，不硬编码 —— 界面文案与本土化示例（深圳、
 * 字节跳动、138 手机号）强绑定在中文语境里，将来出英文版应该是加一个
 * 平行的 en-US.ts，而不是回头改每个组件。
 *
 * 文案逐字对照 prototype-interactive.html 与 16 张截图。
 */

export const copy = {
  app: {
    name: '职优 AI',
  },

  common: {
    cancel: '取消',
    save: '保存',
    done: '完成',
    export: '导出',
    back: '返回',
    retry: '重试',
  },

  auth: {
    // 原型没有登录页，这一屏按原型的视觉语言新增。
    tagline: '三步让简历更贴合目标职位',
    continueWithApple: '通过 Apple 继续',
    continueWithGoogle: '通过 Google 继续',
    continueWithLinkedIn: '通过 LinkedIn 继续',
    continueWithFacebook: '通过 Facebook 继续',
    legal: '登录即表示你同意《服务条款》与《隐私政策》',
    failed: '登录未完成，请再试一次',
    cancelled: '已取消登录',
  },

  tabs: {
    home: '首页',
    records: '记录',
    me: '我的',
  },

  home: {
    greeting: (name: string) => `你好，${name}`,
    subtitleWithResume: '三步让简历更贴合目标职位',
    subtitleEmpty: '从一份像样的简历开始',
    scoreLabel: '简历分',
    scoreDenominator: '/100',
    scoreHintFresh: '刚优化过，状态很好',
    scoreHintImprovable: (count: number) => `还有 ${count} 处可以提升`,
    newResume: '新建简历',
    newResumeSub: '上传已有，或从模版开始',
    pasteJd: '粘贴职位描述',
    pasteJdSub: '看匹配度，缺什么一目了然',
    startOptimize: '开始 AI 优化',
    recentRecords: '最近记录',
    emptyTitle: '先来创建你的第一份简历',
    emptyBody: '选一个成熟模版，AI 帮你把内容填进去\n三分钟就能拥有一份像样的简历',
    emptyPrimary: '从模版开始',
    emptySecondary: '上传已有简历',
    needResumeFirst: '先创建一份简历吧',
  },

  records: {
    title: '记录',
    summary: (count: number, avgGain: number) =>
      `共优化 ${count} 次 · 平均每次 +${avgGain} 分`,
    summaryEmpty: '你的每一次优化都会记录在这里',
    empty: '还没有优化记录\n完成一次 AI 优化后会出现在这里',
    delta: (before: number, after: number) => `${before} → ${after}`,
  },

  me: {
    title: '我的',
    profileSub: (intent: string, years: number | null, city: string) =>
      [intent, years === null ? '' : `${years} 年经验`, city]
        .filter((part) => part.length > 0)
        .join(' · '),
    myResumes: '我的简历',
    myResumesCount: (count: number) => `${count} 份`,
    myResumesEmpty: '还没有简历',
    jobTarget: '目标职位',
    jobTargetEmpty: '还没有设置',
    settings: '设置',
    settingsSub: '通知、隐私、账号',
  },

  profile: {
    title: '个人资料',
    avatarHint: '点击更换头像',
    fieldName: '姓名',
    fieldJobIntent: '求职意向',
    fieldYears: '工作年限',
    fieldCity: '所在城市',
    fieldPhone: '手机号',
    fieldEmail: '邮箱',
    yearsValue: (years: number) => `${years} 年`,
    footnote: '资料会用于生成简历基本信息栏',
    saved: '资料已保存',
    unset: '未填写',
  },

  avatarSheet: {
    title: '更换头像',
    camera: '拍照',
    album: '从相册选择',
    processing: '正在处理照片…',
    uploading: '正在上传头像…',
    updated: '头像已更新',
    permissionDenied: '需要相机或相册权限才能更换头像',
  },

  newResume: {
    title: '新建简历',
    lead: '选择一种方式开始',
    upload: '上传已有简历',
    uploadSub: '支持 PDF / Word / 图片\nAI 自动识别内容与排版',
    fromTemplate: '从模版新建',
    fromTemplateBadge: '新手推荐',
    fromTemplateSub: '选一个成熟模版\nAI 帮你把内容填进去',
    myResumes: (count: number) => `我的简历（${count} 份）`,
    parsing: (filename: string) => `正在解析：${filename}…`,
    parsed: '已导入并解析完成',
    parseFailed: '这份文件没能解析出来，换一份或从模版新建',
    unsupportedType: '暂时只支持 PDF / Word / 图片',
  },

  templates: {
    title: '简历模版',
    recommended: '推荐',
    swipeHint: '左右滑动切换模版',
    segmentSample: '示例内容',
    segmentMine: '我的内容',
    apply: '就用这个模版',
    applying: 'AI 正在把你的内容填入模版…',
    applied: (name: string) => `已套用「${name}」`,
  },

  jd: {
    title: '粘贴职位描述',
    placeholder:
      '把招聘软件里的职位描述（JD）整段复制进来，AI 会分析你的简历和它的匹配度…',
    charCount: (count: number) => `${count} 字`,
    tooShort: '职位描述太短了，至少 50 字才能准确分析',
    pasteDemo: '粘贴示例 JD',
    analyze: '开始分析',
    pastedDemo: '已粘贴示例职位描述',
  },

  analyzing: {
    title: 'AI 正在分析',
    step1: '读取简历要点',
    step2: '对比职位要求',
    step3: '计算匹配度与差距',
    failed: '分析没能完成，请再试一次',
  },

  match: {
    title: '匹配度',
    jobLine: (jobTitle: string, company: string) =>
      company.length > 0 ? `${jobTitle} · ${company}` : jobTitle,
    gaugeCaption: '匹配度',
    verdict: (satisfied: number, missing: number) =>
      `已满足 ${satisfied} 项职位要求\n补上下面 ${missing} 项，会更有竞争力`,
    verdictNoGap: (satisfied: number) =>
      `已满足 ${satisfied} 项职位要求\n这份简历已经很贴合了`,
    keywordCount: (count: number) => `职位中出现 ${count} 次`,
    optimize: '一键优化简历',
  },

  suggestions: {
    title: '优化建议',
    progress: (current: number, total: number) => `${current} / ${total}`,
    labelOld: '原文',
    labelNew: '建议改为',
    adopt: '采纳这条建议',
    skip: '跳过',
  },

  done: {
    title: '优化完成',
    summary: (adopted: number, jobTitle: string, company: string) =>
      `已采纳 ${adopted} 条建议\n简历与「${jobTitle} · ${company}」更匹配了`,
    summaryNoneAdopted: '这次没有采纳建议\n简历保持原样',
    gain: (delta: number) => `+${delta} 分`,
    exportPdf: '导出 PDF',
    previewResume: '预览简历',
    saved: '已保存，可在「记录」中查看',
  },

  resume: {
    title: '我的简历',
    exported: '已导出 PDF',
    exportFailed: '导出失败，请再试一次',
    sharingUnavailable: '这台设备无法分享文件',
  },

  settings: {
    title: '设置',
    notifications: '通知',
    privacy: '隐私',
    account: '账号',
    signOut: '退出登录',
    signOutConfirm: '确定要退出登录吗？',
  },

  errors: {
    network: '网络不太顺畅，请检查连接后重试',
    generic: '出了点问题，请再试一次',
  },
} as const;

export type Copy = typeof copy;
