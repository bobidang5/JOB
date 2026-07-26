import {
  applySuggestions,
  computeScoreAfter,
  type AnalysisResult,
  type ResumeContent,
  type ResumeTemplateKey,
  type Suggestion,
} from '@zhiyou/shared';
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

import * as api from './api';

/**
 * 「粘贴 JD → 分析 → 匹配度 → 逐条采纳 → 完成」这一条流程的共享状态。
 *
 * 放在 context 而不是路由参数里，因为五个屏都要读写同一份分析结果，
 * 用参数传会在 push/replace 之间反复序列化。
 */

interface BeginInput {
  resumeId: string;
  resumeTitle: string;
  templateKey: ResumeTemplateKey;
  scoreBefore: number;
  content: ResumeContent;
  jdText: string;
}

interface OptimizeFlowValue {
  jdText: string;
  setJdText: (value: string) => void;

  jobTitle: string;
  company: string;

  analysis: AnalysisResult | null;
  analysisError: string | null;

  /** 点「开始分析」时立刻发起请求，不等动画 */
  beginAnalysis: (input: BeginInput) => void;
  /** 分析页用它来等结果；与最短停留时间一起决定何时跳转 */
  awaitAnalysis: () => Promise<AnalysisResult>;

  /** 当前展示到第几条建议（从 0 开始） */
  currentIndex: number;
  currentSuggestion: Suggestion | null;
  totalSuggestions: number;
  /** 采纳或跳过当前这条，返回是否还有下一条 */
  decide: (adopt: boolean) => boolean;

  adoptedCount: number;
  scoreBefore: number;
  scoreAfter: number;

  /** 采纳项写回后的简历内容。完成页的「导出 PDF」直接用它，
   *  不必等 commit 之后再回查数据库。 */
  resultContent: ResumeContent | null;
  resultTemplateKey: ResumeTemplateKey;
  resumeTitle: string;

  /** 把采纳项写回简历、更新分数、插入记录（对应完成页的「完成」） */
  commit: () => Promise<void>;

  reset: () => void;
}

const OptimizeFlowContext = createContext<OptimizeFlowValue | null>(null);

export function OptimizeFlowProvider({ children }: { children: React.ReactNode }) {
  const [jdText, setJdText] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [adopted, setAdopted] = useState<Suggestion[]>([]);
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [scoreBefore, setScoreBefore] = useState(0);
  const [resumeTitle, setResumeTitle] = useState('');
  const [templateKey, setTemplateKey] = useState<ResumeTemplateKey>('v1');
  const [baseContent, setBaseContent] = useState<ResumeContent | null>(null);

  const inputRef = useRef<BeginInput | null>(null);
  const pendingRef = useRef<Promise<AnalysisResult> | null>(null);

  const beginAnalysis = useCallback((input: BeginInput) => {
    inputRef.current = input;
    setScoreBefore(input.scoreBefore);
    setResumeTitle(input.resumeTitle);
    setTemplateKey(input.templateKey);
    setBaseContent(input.content);
    setAnalysis(null);
    setAnalysisError(null);
    setCurrentIndex(0);
    setAdopted([]);

    pendingRef.current = (async () => {
      const target = await api.createJobTarget(input.jdText);
      setJobTitle(target.title);
      setCompany(target.company);
      const result = await api.runAnalysis();
      setAnalysis(result);
      return result;
    })();

    // 这里不能让 rejection 变成 unhandled——awaitAnalysis 才是消费者。
    pendingRef.current.catch(() => undefined);
  }, []);

  const awaitAnalysis = useCallback(async () => {
    if (!pendingRef.current) {
      throw new Error('尚未发起分析');
    }
    try {
      return await pendingRef.current;
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : '分析失败');
      throw error;
    }
  }, []);

  // 不 memo 的话每次渲染都是新数组，下面的 useCallback/useMemo 依赖全失效
  const suggestions = useMemo(() => analysis?.suggestions ?? [], [analysis]);

  const decide = useCallback(
    (adopt: boolean) => {
      const suggestion = suggestions[currentIndex];
      if (adopt && suggestion) {
        setAdopted((prev) => [...prev, suggestion]);
      }
      const hasNext = currentIndex < suggestions.length - 1;
      if (hasNext) setCurrentIndex((prev) => prev + 1);
      return hasNext;
    },
    [currentIndex, suggestions],
  );

  const scoreAfter = useMemo(
    () => computeScoreAfter(scoreBefore, adopted, analysis?.max_score ?? scoreBefore),
    [adopted, analysis, scoreBefore],
  );

  const resultContent = useMemo(
    () => (baseContent ? applySuggestions(baseContent, adopted).content : null),
    [adopted, baseContent],
  );

  const commit = useCallback(async () => {
    const input = inputRef.current;
    if (!input || !resultContent) return;

    await api.applyOptimization({
      resumeId: input.resumeId,
      content: resultContent,
      scoreBefore,
      scoreAfter,
      adoptedCount: adopted.length,
    });
  }, [adopted.length, resultContent, scoreAfter, scoreBefore]);

  const reset = useCallback(() => {
    inputRef.current = null;
    pendingRef.current = null;
    setJdText('');
    setAnalysis(null);
    setAnalysisError(null);
    setCurrentIndex(0);
    setAdopted([]);
    setScoreBefore(0);
    setResumeTitle('');
    setTemplateKey('v1');
    setBaseContent(null);
  }, []);

  const value = useMemo<OptimizeFlowValue>(
    () => ({
      jdText,
      setJdText,
      jobTitle,
      company,
      analysis,
      analysisError,
      beginAnalysis,
      awaitAnalysis,
      currentIndex,
      currentSuggestion: suggestions[currentIndex] ?? null,
      totalSuggestions: suggestions.length,
      decide,
      adoptedCount: adopted.length,
      scoreBefore,
      scoreAfter,
      resultContent,
      resultTemplateKey: templateKey,
      resumeTitle,
      commit,
      reset,
    }),
    [
      adopted.length,
      analysis,
      analysisError,
      awaitAnalysis,
      beginAnalysis,
      commit,
      company,
      currentIndex,
      decide,
      jdText,
      jobTitle,
      reset,
      resultContent,
      resumeTitle,
      scoreAfter,
      scoreBefore,
      suggestions,
      templateKey,
    ],
  );

  return (
    <OptimizeFlowContext.Provider value={value}>
      {children}
    </OptimizeFlowContext.Provider>
  );
}

export function useOptimizeFlow(): OptimizeFlowValue {
  const context = useContext(OptimizeFlowContext);
  if (!context) {
    throw new Error('useOptimizeFlow 必须在 OptimizeFlowProvider 内使用');
  }
  return context;
}
