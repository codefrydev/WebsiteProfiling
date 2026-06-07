declare module '*.css';

declare module '@/patchConsole';

declare module 'react-syntax-highlighter' {
  import type { ComponentType } from 'react';

  export interface SyntaxHighlighterProps {
    language?: string;
    style?: Record<string, Record<string, string>>;
    customStyle?: Record<string, string | number>;
    children?: string;
  }

  export const Prism: ComponentType<SyntaxHighlighterProps>;
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism' {
  export const oneDark: Record<string, Record<string, string>>;
}

declare module 'react-chartjs-2' {
  import type { ChartProps } from 'react-chartjs-2/dist/types';
  import type { ChartData, ChartOptions, DefaultDataPoint } from 'chart.js';
  import type { ComponentType } from 'react';

  type ChartComponentProps<TType extends 'bar' | 'line' | 'doughnut' | 'pie' | 'scatter' | 'bubble' | 'radar' | 'polarArea'> =
    ChartProps<TType, DefaultDataPoint<TType>, unknown>;

  export const Bar: ComponentType<ChartComponentProps<'bar'>>;
  export const Line: ComponentType<ChartComponentProps<'line'>>;
  export const Doughnut: ComponentType<ChartComponentProps<'doughnut'>>;
  export const Pie: ComponentType<ChartComponentProps<'pie'>>;
  export const Scatter: ComponentType<ChartComponentProps<'scatter'>>;
  export const Bubble: ComponentType<ChartComponentProps<'bubble'>>;
  export const Radar: ComponentType<ChartComponentProps<'radar'>>;
  export const PolarArea: ComponentType<ChartComponentProps<'polarArea'>>;
}
