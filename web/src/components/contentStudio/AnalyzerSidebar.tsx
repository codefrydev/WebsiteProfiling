'use client';

import SeoScoreSidebar from './SeoScoreSidebar';
import AiSuggestionsPanel from './AiSuggestionsPanel';
import type { ContentAnalyzeResult, ContentScoreResult } from '@/types/contentStudio';

interface AnalyzerSidebarProps {
  score: ContentScoreResult | null;
  scoreLoading: boolean;
  scoreError: string | null;
  keyword: string;
  analysis: ContentAnalyzeResult | null;
  analyzeLoading: boolean;
  analyzeError: string | null;
  aiVisible: boolean;
}

export default function AnalyzerSidebar({
  score,
  scoreLoading,
  scoreError,
  keyword,
  analysis,
  analyzeLoading,
  analyzeError,
  aiVisible,
}: AnalyzerSidebarProps) {
  return (
    <div className="space-y-4">
      <SeoScoreSidebar score={score} loading={scoreLoading} error={scoreError} keyword={keyword} />
      <AiSuggestionsPanel
        analysis={analysis}
        loading={analyzeLoading}
        error={analyzeError}
        visible={aiVisible}
      />
    </div>
  );
}
