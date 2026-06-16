import { describe, expect, it } from 'vitest';
import { isExpandedSectionTitle, stripEmojiFromTitle } from './chatSectionTitles';
import { splitInsightSections } from './ChatInsightSections';

describe('chatSectionTitles', () => {
  it('detects expanded sections', () => {
    expect(isExpandedSectionTitle('Power Insights')).toBe(true);
    expect(isExpandedSectionTitle('What the data shows')).toBe(false);
  });

  it('strips emoji and domain suffix from titles', () => {
    expect(stripEmojiFromTitle('🔎 Power Insights for codefrydev.in')).toBe('Power Insights');
  });
});

describe('splitInsightSections', () => {
  it('splits markdown into collapsible sections', () => {
    const sections = splitInsightSections(`### Power Insights
- One insight

### What the data shows
- Detail`);
    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe('Power Insights');
    expect(sections[1].title).toBe('What the data shows');
  });
});
