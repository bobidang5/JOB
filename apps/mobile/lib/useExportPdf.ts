import {
  copy,
  renderResumeDocument,
  type ResumeContent,
  type ResumeTemplateKey,
} from '@zhiyou/shared';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useCallback } from 'react';

import { useToast } from '../components/Toast';

/**
 * 导出 PDF（完成页与简历预览页共用）。
 *
 * 用的是 packages/shared 的 renderResumeDocument —— 和 App 内 WebView
 * 预览同一份 HTML，只是换成 print 模式（A4 版心、字号放大到可读）。
 * 一份模板两个出口，预览和导出不可能对不上。
 */
export function useExportPdf(): (input: {
  content: ResumeContent;
  templateKey: ResumeTemplateKey;
  title: string;
}) => Promise<void> {
  const toast = useToast();

  return useCallback(
    async ({ content, templateKey, title }) => {
      try {
        const html = renderResumeDocument(content, templateKey, 'print');
        const { uri } = await Print.printToFileAsync({ html });

        if (!(await Sharing.isAvailableAsync())) {
          toast.show(copy.resume.sharingUnavailable);
          return;
        }

        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: title,
        });
        toast.show(copy.resume.exported);
      } catch {
        toast.show(copy.resume.exportFailed);
      }
    },
    [toast],
  );
}
