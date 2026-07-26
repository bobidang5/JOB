/**
 * 数据库类型。
 *
 * 正常应该用 `supabase gen types typescript --local` 生成，但那需要能拉起
 * 本地 Supabase 栈；本项目的开发容器拉不到镜像（registry 被策略封禁），
 * 所以先按 supabase/migrations/20260726000100_init.sql 手写一份。
 *
 * 它不是装饰：客户端带上这个类型之后，写错列名、少写必填字段、把枚举写成
 * 别的字符串，都会在 tsc 阶段报错，而不是等到运行时数据库拒绝。
 *
 * 改迁移时记得同步这里。CI 上能跑 Supabase 之后应该换成生成的版本。
 */

export type ResumeSource = 'upload' | 'template';
export type AiProtocol = 'anthropic' | 'openai_compatible';
export type AiCallKind = 'parse' | 'analyze' | 'draft';
export type AiCallStatus = 'ok' | 'refusal' | 'contract' | 'error';
export type AiEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type AdminAction =
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'password_changed'
  | 'provider_created'
  | 'provider_updated'
  | 'provider_deleted'
  | 'provider_activated'
  | 'provider_tested';
export type AnalysisStatus = 'pending' | 'running' | 'succeeded' | 'failed';
export type SuggestionStatus = 'pending' | 'adopted' | 'skipped';

export type MissingKeywordJson = {
  keyword: string;
  count: number;
};

type ProfilesRow = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  job_intent: string;
  years_experience: number | null;
  city: string;
  phone: string;
  email: string;
  created_at: string;
  updated_at: string;
};

type ResumeTemplatesRow = {
  key: string;
  name: string;
  categories: string[];
  usage_label: string;
  is_recommended: boolean;
  sort_order: number;
};

type ResumesRow = {
  id: string;
  user_id: string;
  title: string;
  template_key: string;
  content: unknown;
  score: number;
  source: ResumeSource;
  source_file_path: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

type ResumeVersionsRow = {
  id: string;
  resume_id: string;
  user_id: string;
  content: unknown;
  score: number;
  created_at: string;
};

type JobTargetsRow = {
  id: string;
  user_id: string;
  title: string;
  company: string;
  jd_text: string;
  created_at: string;
};

type AnalysesRow = {
  id: string;
  user_id: string;
  resume_id: string;
  job_target_id: string;
  status: AnalysisStatus;
  match_score: number | null;
  satisfied_count: number | null;
  missing_keywords: MissingKeywordJson[];
  base_score: number;
  max_score: number | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

type SuggestionsRow = {
  id: string;
  analysis_id: string;
  position: number;
  tag: string;
  original_text: string;
  suggested_text: string;
  emphasis: string[];
  rationale: string;
  score_delta: number;
  field_path: string;
  status: SuggestionStatus;
};

type OptimizationsRow = {
  id: string;
  user_id: string;
  analysis_id: string;
  resume_id: string;
  resume_version_id: string | null;
  adopted_count: number;
  score_before: number;
  score_after: number;
  created_at: string;
};

/**
 * 把交叉类型摊平成单一对象类型。
 *
 * supabase-js 用 `Schema extends GenericSchema ? … : never` 做分支，而
 * GenericTable 把每个字段都声明成 `Record<string, unknown>`。TS 只给对象
 * 字面量类型和映射类型隐式索引签名，交叉类型拿不到，匹配就会失败——一旦
 * 失败，Schema 变成 never，每张表的行类型跟着退化成 never，于是所有
 * `.select()` 结果的字段访问都报「does not exist on type 'never'」。
 *
 * 同理，上面各 Row 必须是 type 别名而不是 interface：interface 可以被声明
 * 合并，所以 TS 同样不给它隐式索引签名。改成 interface 会静默把整个
 * schema 打回 never。
 */
type Flatten<T> = { [K in keyof T]: T[K] };

/** 建表时有默认值或由数据库生成的字段，插入时可省略 */
type Insertable<Row, Optional extends keyof Row> = Flatten<
  Omit<Row, Optional> & Partial<Pick<Row, Optional>>
>;

/**
 * 外键。只有声明了它，`select('…, job_targets(title, company)')` 这种嵌套
 * 查询才能被 supabase-js 的查询解析器解析出结果类型；缺了就会得到
 * SelectQueryError，展开时报 TS2698。
 *
 * 这里只列 public schema 内部的外键——指向 auth.users 的那些跨 schema 引用
 * 无法用于嵌套查询，写了也没有用处。
 */
type Relationship<
  Name extends string,
  Column extends string,
  Referenced extends string,
  ReferencedColumn extends string,
> = {
  foreignKeyName: Name;
  columns: [Column];
  isOneToOne: false;
  referencedRelation: Referenced;
  referencedColumns: [ReferencedColumn];
};

type Table<
  Row,
  Optional extends keyof Row,
  Relationships extends Relationship<string, string, string, string>[] = [],
> = {
  Row: Row;
  Insert: Insertable<Row, Optional>;
  Update: Partial<Row>;
  Relationships: Relationships;
};

/* ---------- 运营后台（20260726000200_admin_console.sql）----------
 * 这几张表只有 service_role 能访问（启用了 RLS 但不给任何策略），
 * 唯一例外是 ai_usage 的插入。详见迁移文件顶部的说明。
 */

type AdminUsersRow = {
  id: string;
  username: string;
  password_hash: string;
  is_default_password: boolean;
  token_version: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

type AiProvidersRow = {
  id: string;
  label: string;
  platform: string;
  protocol: AiProtocol;
  model: string;
  base_url: string | null;
  /** AES-256-GCM 密文，永远不回传给浏览器 */
  api_key_cipher: string;
  api_key_last4: string;
  effort: AiEffort;
  is_active: boolean;
  last_tested_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
  created_at: string;
  updated_at: string;
};

type AiUsageRow = {
  id: string;
  user_id: string | null;
  kind: AiCallKind;
  platform: string;
  model: string;
  status: AiCallStatus;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  latency_ms: number;
  error_code: string | null;
  created_at: string;
};

type AdminAuditLogRow = {
  id: string;
  admin_user_id: string | null;
  username: string;
  action: AdminAction;
  detail: Record<string, unknown>;
  ip: string | null;
  created_at: string;
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<
        ProfilesRow,
        | 'full_name'
        | 'avatar_url'
        | 'job_intent'
        | 'years_experience'
        | 'city'
        | 'phone'
        | 'email'
        | 'created_at'
        | 'updated_at'
      >;
      resume_templates: Table<
        ResumeTemplatesRow,
        'categories' | 'is_recommended' | 'sort_order'
      >;
      resumes: Table<
        ResumesRow,
        | 'id'
        | 'template_key'
        | 'score'
        | 'source_file_path'
        | 'is_default'
        | 'created_at'
        | 'updated_at',
        [Relationship<'resumes_template_key_fkey', 'template_key', 'resume_templates', 'key'>]
      >;
      resume_versions: Table<
        ResumeVersionsRow,
        'id' | 'created_at',
        [Relationship<'resume_versions_resume_id_fkey', 'resume_id', 'resumes', 'id'>]
      >;
      job_targets: Table<JobTargetsRow, 'id' | 'title' | 'company' | 'created_at'>;
      analyses: Table<
        AnalysesRow,
        | 'id'
        | 'status'
        | 'match_score'
        | 'satisfied_count'
        | 'missing_keywords'
        | 'max_score'
        | 'error'
        | 'created_at'
        | 'completed_at',
        [
          Relationship<'analyses_resume_id_fkey', 'resume_id', 'resumes', 'id'>,
          Relationship<'analyses_job_target_id_fkey', 'job_target_id', 'job_targets', 'id'>,
        ]
      >;
      suggestions: Table<
        SuggestionsRow,
        'id' | 'emphasis' | 'score_delta' | 'status',
        [Relationship<'suggestions_analysis_id_fkey', 'analysis_id', 'analyses', 'id'>]
      >;
      optimizations: Table<
        OptimizationsRow,
        'id' | 'resume_version_id' | 'adopted_count' | 'created_at',
        [
          Relationship<'optimizations_analysis_id_fkey', 'analysis_id', 'analyses', 'id'>,
          Relationship<'optimizations_resume_id_fkey', 'resume_id', 'resumes', 'id'>,
          Relationship<
            'optimizations_resume_version_id_fkey',
            'resume_version_id',
            'resume_versions',
            'id'
          >,
        ]
      >;
      admin_users: Table<
        AdminUsersRow,
        | 'id'
        | 'is_default_password'
        | 'token_version'
        | 'last_login_at'
        | 'created_at'
        | 'updated_at'
      >;
      ai_providers: Table<
        AiProvidersRow,
        | 'id'
        | 'base_url'
        | 'effort'
        | 'is_active'
        | 'last_tested_at'
        | 'last_test_ok'
        | 'last_test_error'
        | 'created_at'
        | 'updated_at'
      >;
      ai_usage: Table<
        AiUsageRow,
        | 'id'
        | 'user_id'
        | 'input_tokens'
        | 'output_tokens'
        | 'cache_read_tokens'
        | 'latency_ms'
        | 'error_code'
        | 'created_at'
      >;
      admin_audit_log: Table<
        AdminAuditLogRow,
        'id' | 'admin_user_id' | 'detail' | 'ip' | 'created_at'
      >;
    };
    Views: Record<string, never>;
    Functions: {
      /** 注册用户计数。security definer，只回计数不回用户行 */
      admin_user_stats: {
        Args: Record<PropertyKey, never>;
        Returns: {
          total: number;
          new_today: number;
          new_7d: number;
          new_30d: number;
          confirmed: number;
        }[];
      };
      /** 按日注册趋势 */
      admin_signup_trend: {
        Args: { days?: number };
        Returns: { day: string; signups: number }[];
      };
    };
    Enums: {
      resume_source: ResumeSource;
      analysis_status: AnalysisStatus;
      suggestion_status: SuggestionStatus;
      ai_protocol: AiProtocol;
      ai_call_kind: AiCallKind;
      ai_call_status: AiCallStatus;
      admin_action: AdminAction;
    };
    CompositeTypes: Record<string, never>;
  };
}
