'use client';

interface SoundEntry {
  level: number;
  dbfs?: number | null;
  timestamp: string;
}

interface SoundChartProps {
  data: SoundEntry[];
}

export default function SoundChart({ data }: SoundChartProps) {
  const maxLevel = 100;
  const entries = [...data].reverse();

  function barStyle(level: number): React.CSSProperties {
    // Dégradé vert (120°) → jaune (60°) → rouge (0°)
    const hue = Math.max(0, 120 - (level / 100) * 120);
    return { backgroundColor: `hsl(${hue}, 75%, 50%)` };
  }

  return (
    <div>
      {/* Légende dégradé */}
      <div className="flex items-center gap-3 mb-4 text-xs text-slate-500">
        <span>0%</span>
        <div className="flex-1 h-3 rounded-sm max-w-[200px]" style={{ background: 'linear-gradient(to right, hsl(120,75%,50%), hsl(60,75%,50%), hsl(0,75%,50%))' }} />
        <span>100%</span>
      </div>

      {/* Graphique en barres CSS */}
      <div className="relative">
        {/* Lignes de grille horizontales */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" style={{ paddingBottom: '24px' }}>
          {[100, 75, 50, 25, 0].map((tick) => (
            <div key={tick} className="flex items-end gap-2 w-full">
              <span className="text-xs text-slate-300 w-7 text-right leading-none flex-shrink-0">{tick}</span>
              <div className="flex-1 border-t border-slate-100" />
            </div>
          ))}
        </div>

        {/* Barres */}
        <div
          className="flex items-end gap-px pl-9 pb-6"
          style={{ height: '200px' }}
          role="img"
          aria-label={`Graphique de ${entries.length} mesures sonores`}
        >
          {entries.map((entry, idx) => {
            const lvl = Number(entry.level);
            const heightPct = Math.max(2, (lvl / maxLevel) * 100);
            const dbfs = entry.dbfs != null ? Number(entry.dbfs) : null;
            return (
              <div
                key={idx}
                className="flex-1 relative group"
                style={{ height: '100%', display: 'flex', alignItems: 'flex-end' }}
              >
                <div
                  className="w-full rounded-t-sm transition-opacity group-hover:opacity-80"
                  style={{ height: `${heightPct}%`, ...barStyle(lvl) }}
                />
                {/* Tooltip au survol */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10 pointer-events-none">
                  <div className="bg-slate-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg">
                    <p className="font-semibold">{lvl}%{dbfs != null ? ` · ${dbfs} dBFS` : ''}</p>
                    <p className="text-slate-300">
                      {new Date(entry.timestamp).toLocaleString('fr-FR', {
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Étiquettes axe X */}
      {entries.length > 1 && (
        <div className="flex justify-between pl-9 mt-1 text-xs text-slate-400">
          <span>
            {new Date(entries[0].timestamp).toLocaleString('fr-FR', {
              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
            })}
          </span>
          <span>
            {new Date(entries[entries.length - 1].timestamp).toLocaleString('fr-FR', {
              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
            })}
          </span>
        </div>
      )}
    </div>
  );
}
