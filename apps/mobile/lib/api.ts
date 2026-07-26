import {
  MOCK_ANALYSIS,
  MOCK_JOB_TARGET,
  MOCK_PROFILE,
  MOCK_RECORDS,
  MOCK_RESUME_BEFORE,
  MOCK_RESUME_MINE,
  MOCK_TEMPLATES,
  type AnalysisResult,
  type Profile,
  type ResumeContent,
  type ResumeTemplateKey,
  type TemplateMeta,
} from '@zhiyou/shared';

/**
 * 数据访问层。
 *
 * 现阶段全部由 packages/shared 的 mock 常量支撑，界面因此可以在没有
 * 后端的情况下按截图逐屏对齐。接 Supabase 与 Next.js API 时只改这一个
 * 文件，界面与 hook 不动——函数签名就是最终形态。
 */

export interface Resume {
  id: string;
  title: string;
  templateKey: ResumeTemplateKey;
  content: ResumeContent;
  score: number;
  isDefault: boolean;
  updatedAt: Date;
}

export interface OptimizationRecord {
  id: string;
  resumeId: string;
  resumeTitle: string;
  company: string;
  scoreBefore: number;
  scoreAfter: number;
  createdAt: Date;
}

export interface JobTarget {
  id: string;
  title: string;
  company: string;
  jdText: string;
}

/** 首页需要的全部数据（截图 01 与 02 的两种状态） */
export interface HomeSnapshot {
  profile: Profile;
  defaultResume: Resume | null;
  resumeCount: number;
  recentRecords: OptimizationRecord[];
  jobTarget: JobTarget | null;
}

/* ------------------------------------------------------------------ */
/* 内存态：mock 阶段用它承载「完成一次优化后写回首页与记录」的效果    */
/* ------------------------------------------------------------------ */

const DEMO_RESUME_ID = 'demo-resume-pm';

interface MockState {
  profile: Profile;
  resumes: Resume[];
  records: OptimizationRecord[];
  jobTarget: JobTarget | null;
  /** 新用户空状态开关，供演示与测试切换 */
  isNewUser: boolean;
}

function initialState(isNewUser: boolean): MockState {
  const now = Date.now();
  return {
    profile: { ...MOCK_PROFILE },
    resumes: isNewUser
      ? []
      : [
          {
            id: DEMO_RESUME_ID,
            title: '产品经理-李婷.pdf',
            templateKey: 'v1',
            // 存的是「优化前」的内容，这样示例 JD 跑出来的四条建议
            // 每一条都真的有地方落地
            content: MOCK_RESUME_BEFORE,
            score: 76,
            isDefault: true,
            updatedAt: new Date(now),
          },
          {
            id: 'demo-resume-ops',
            title: '运营专员-李婷.pdf',
            templateKey: 'v3',
            content: MOCK_RESUME_MINE,
            score: 71,
            isDefault: false,
            updatedAt: new Date(now - 6 * 86_400_000),
          },
        ],
    records: isNewUser
      ? []
      : MOCK_RECORDS.map((record, index) => ({
          id: `demo-record-${index}`,
          resumeId: index === 0 ? DEMO_RESUME_ID : 'demo-resume-ops',
          resumeTitle: record.title,
          company: index === 0 ? '字节跳动' : '美团',
          scoreBefore: record.scoreBefore,
          scoreAfter: record.scoreAfter,
          createdAt:
            index === 0
              ? new Date(now - 86_400_000)
              : new Date(now - 6 * 86_400_000),
        })),
    jobTarget: isNewUser
      ? null
      : {
          id: 'demo-job-target',
          title: MOCK_JOB_TARGET.title,
          company: MOCK_JOB_TARGET.company,
          jdText: '',
        },
    isNewUser,
  };
}

let state: MockState = initialState(false);

/** 供演示面板与测试重置状态（对应原型左侧的「重置演示」按钮） */
export function resetMockState(isNewUser = false): void {
  state = initialState(isNewUser);
}

/* ------------------------------------------------------------------ */
/* 读                                                                  */
/* ------------------------------------------------------------------ */

export async function getHomeSnapshot(): Promise<HomeSnapshot> {
  const defaultResume =
    state.resumes.find((r) => r.isDefault) ?? state.resumes[0] ?? null;
  return {
    profile: state.profile,
    defaultResume,
    resumeCount: state.resumes.length,
    recentRecords: state.records.slice(0, 2),
    jobTarget: state.jobTarget,
  };
}

export async function getRecords(): Promise<OptimizationRecord[]> {
  return state.records;
}

export async function getProfile(): Promise<Profile> {
  return state.profile;
}

export async function updateProfile(patch: Partial<Profile>): Promise<Profile> {
  state.profile = { ...state.profile, ...patch };
  return state.profile;
}

export async function getResumes(): Promise<Resume[]> {
  return state.resumes;
}

export async function getResume(id: string): Promise<Resume | null> {
  return state.resumes.find((r) => r.id === id) ?? null;
}

export async function getTemplates(): Promise<readonly TemplateMeta[]> {
  return MOCK_TEMPLATES;
}

/* ------------------------------------------------------------------ */
/* 写                                                                  */
/* ------------------------------------------------------------------ */

export async function setResumeTemplate(
  resumeId: string,
  templateKey: ResumeTemplateKey,
): Promise<void> {
  const resume = state.resumes.find((r) => r.id === resumeId);
  if (resume) {
    resume.templateKey = templateKey;
    resume.updatedAt = new Date();
  }
}

export async function createJobTarget(jdText: string): Promise<JobTarget> {
  state.jobTarget = {
    id: `job-${Date.now()}`,
    title: MOCK_JOB_TARGET.title,
    company: MOCK_JOB_TARGET.company,
    jdText,
  };
  return state.jobTarget;
}

/** 分析结果。真实实现会打 /api/analyses 并轮询状态。 */
export async function runAnalysis(): Promise<AnalysisResult> {
  return MOCK_ANALYSIS;
}

/**
 * 采纳落地：写回简历内容、更新分数、插入一条记录。
 * 真实实现在服务端做同样的事（见 /api/analyses/[id]/apply）。
 */
export async function applyOptimization(input: {
  resumeId: string;
  content: ResumeContent;
  scoreBefore: number;
  scoreAfter: number;
  adoptedCount: number;
}): Promise<OptimizationRecord> {
  const resume = state.resumes.find((r) => r.id === input.resumeId);
  if (resume) {
    resume.content = input.content;
    resume.score = input.scoreAfter;
    resume.updatedAt = new Date();
  }

  const record: OptimizationRecord = {
    id: `record-${Date.now()}`,
    resumeId: input.resumeId,
    resumeTitle: resume?.title ?? '简历.pdf',
    company: state.jobTarget?.company ?? '',
    scoreBefore: input.scoreBefore,
    scoreAfter: input.scoreAfter,
    createdAt: new Date(),
  };
  state.records = [record, ...state.records];
  return record;
}

/** 上传解析（截图 07 的「上传已有简历」）。真实实现走 /api/resumes/parse。 */
export async function importResume(title: string): Promise<Resume> {
  const resume: Resume = {
    id: `resume-${Date.now()}`,
    title,
    templateKey: 'v1',
    content: MOCK_RESUME_BEFORE,
    score: 76,
    isDefault: state.resumes.length === 0,
    updatedAt: new Date(),
  };
  state.resumes = [resume, ...state.resumes.map((r) => ({ ...r, isDefault: false }))];
  resume.isDefault = true;
  return resume;
}

/** 从模版新建（截图 09 的「就用这个模版」）。 */
export async function createResumeFromTemplate(
  templateKey: ResumeTemplateKey,
): Promise<Resume> {
  const existing = state.resumes.find((r) => r.isDefault) ?? state.resumes[0];
  if (existing) {
    existing.templateKey = templateKey;
    existing.updatedAt = new Date();
    return existing;
  }

  const resume: Resume = {
    id: `resume-${Date.now()}`,
    title: `${state.profile.job_intent || '我的简历'}-${state.profile.full_name}.pdf`,
    templateKey,
    content: MOCK_RESUME_BEFORE,
    score: 76,
    isDefault: true,
    updatedAt: new Date(),
  };
  state.resumes = [resume];
  return resume;
}
