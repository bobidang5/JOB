import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { copy } from '@zhiyou/shared';

import { useToast } from '../components/Toast';
import { useHomeSnapshot } from './queries';

/**
 * 「开始 AI 优化」的三个分支（DESIGN-SPEC §5.4）。
 *
 * 首页那个主按钮和 Dock 上的 AI 圆钮共用这一份逻辑：
 *   无简历            → 提示并引导去「新建简历」
 *   有简历但没有 JD   → 进「粘贴职位描述」
 *   简历与 JD 都有    → 直接进分析页
 */
export function useStartOptimize(): () => void {
  const router = useRouter();
  const toast = useToast();
  const { data } = useHomeSnapshot();

  return useCallback(() => {
    const hasResume = !!data?.defaultResume;
    const hasJd = (data?.jobTarget?.jdText ?? '').trim().length > 0;

    if (!hasResume) {
      toast.show(copy.home.needResumeFirst);
      router.push('/resume/new');
      return;
    }

    router.push(hasJd ? '/optimize/analyzing' : '/optimize/jd');
  }, [data, router, toast]);
}
