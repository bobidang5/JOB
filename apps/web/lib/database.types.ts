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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      resume_source: ResumeSource;
      analysis_status: AnalysisStatus;
      suggestion_status: SuggestionStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
