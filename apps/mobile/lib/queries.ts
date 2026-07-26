import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import * as api from './api';

/**
 * React Query 的 key 与 hook 集中在这里，避免各屏各写一套 key
 * 导致「优化完成后首页分数没刷新」这类问题。
 */

export const queryKeys = {
  home: ['home'] as const,
  records: ['records'] as const,
  profile: ['profile'] as const,
  resumes: ['resumes'] as const,
  resume: (id: string) => ['resume', id] as const,
  templates: ['templates'] as const,
};

export function useHomeSnapshot(): UseQueryResult<api.HomeSnapshot> {
  return useQuery({ queryKey: queryKeys.home, queryFn: api.getHomeSnapshot });
}

export function useRecords(): UseQueryResult<api.OptimizationRecord[]> {
  return useQuery({ queryKey: queryKeys.records, queryFn: api.getRecords });
}

export function useProfile() {
  return useQuery({ queryKey: queryKeys.profile, queryFn: api.getProfile });
}

export function useResumes() {
  return useQuery({ queryKey: queryKeys.resumes, queryFn: api.getResumes });
}

export function useResume(id: string) {
  return useQuery({
    queryKey: queryKeys.resume(id),
    queryFn: () => api.getResume(id),
    enabled: id.length > 0,
  });
}

export function useTemplates() {
  return useQuery({ queryKey: queryKeys.templates, queryFn: api.getTemplates });
}
