import { Check } from 'lucide-react';

export function Stepper({ etapes, courante }: { etapes: string[]; courante: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Progression">
      {etapes.map((etape, i) => {
        const fait = i < courante;
        const actif = i === courante;
        return (
          <li key={etape} className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                fait
                  ? 'bg-green-600 text-white'
                  : actif
                    ? 'bg-accent-700 text-white'
                    : 'bg-accent-200 text-accent-600'
              }`}
            >
              {fait ? <Check size={14} /> : i + 1}
            </span>
            <span
              className={`hidden text-xs sm:block ${actif ? 'font-semibold text-accent-900' : 'text-accent-500'}`}
            >
              {etape}
            </span>
            {i < etapes.length - 1 && <span className="h-px w-4 bg-accent-300 sm:w-6" />}
          </li>
        );
      })}
    </ol>
  );
}
