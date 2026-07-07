import type { ReactNode } from 'react';

type Tone = 'neutral' | 'green' | 'orange' | 'red' | 'blue';

const tones: Record<Tone, string> = {
  neutral: 'bg-accent-100 text-accent-700',
  green: 'bg-green-100 text-green-800',
  orange: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  blue: 'bg-sky-100 text-sky-800',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
