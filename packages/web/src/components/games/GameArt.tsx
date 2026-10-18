import type { GameId } from '@backspace/shared/src/games';
import { GAME_TINT } from './gameCatalog';

/**
 * A game's thumbnail: original vector art on the game's own gradient.
 * Decorative (the card names the game), so it is hidden from screen readers.
 */
export function GameArt({ id, className = '' }: { id: GameId; className?: string }) {
  const [a, b] = GAME_TINT[id];
  return (
    <div aria-hidden className={`relative overflow-hidden ${className}`} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}>
      <svg viewBox="0 0 160 100" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id={`glow-${id}`} cx="80%" cy="10%" r="90%">
            <stop offset="0" stopColor="#fff" stopOpacity="0.25" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="160" height="100" fill={`url(#glow-${id})`} />
        {ART[id]}
      </svg>
    </div>
  );
}

/** Letters drawn in the thumbnails: decoration, not text (the art is aria-hidden). */
const ART_LETTERS = { hangman: 'E', duel: ['STAR', 'ROCKET'] } as const;

const W = '#ffffff';
const S = { stroke: W, strokeWidth: 3, strokeLinecap: 'round' as const, fill: 'none' };

const ART: Record<GameId, React.ReactNode> = {
  tictactoe: (
    <g transform="translate(50 20)">
      <path d="M20 0v60M40 0v60M0 20h60M0 40h60" {...S} strokeOpacity={0.55} />
      <path d="M4 4l12 12M16 4L4 16M44 44l12 12M56 44L44 56" {...S} />
      <circle cx="30" cy="30" r="7" {...S} />
      <circle cx="50" cy="10" r="7" {...S} />
    </g>
  ),
  connect4: (
    <g transform="translate(40 18)">
      <rect width="80" height="66" rx="8" fill="#fff" fillOpacity="0.15" />
      {[0, 1, 2, 3, 4].map((c) => [0, 1, 2, 3].map((r) => {
        const filled = (c === 1 && r === 3) || (c === 2 && r >= 2) || (c === 3 && r >= 1) || (c === 4 && r === 3);
        const pink = (c === 2 && r === 2) || (c === 4 && r === 3);
        return <circle key={`${c}${r}`} cx={10 + c * 15} cy={12 + r * 14.5} r="5.5" fill={filled ? (pink ? '#f472b6' : '#fde047') : '#000'} fillOpacity={filled ? 1 : 0.25} />;
      }))}
    </g>
  ),
  rps: (
    <g fill="#fff">
      <circle cx="45" cy="52" r="15" fillOpacity="0.9" />
      <rect x="70" y="32" width="24" height="32" rx="4" fillOpacity="0.9" />
      <path d="M118 40l16 26M134 40l-16 26" {...S} />
      <circle cx="116" cy="68" r="5" {...S} />
      <circle cx="136" cy="68" r="5" {...S} />
    </g>
  ),
  chess: (
    <g>
      {Array.from({ length: 4 }, (_, r) => Array.from({ length: 8 }, (_, c) => (
        <rect key={`${r}${c}`} x={16 + c * 16} y={60 + r * 10} width="16" height="10" fill="#fff" fillOpacity={(r + c) % 2 ? 0.08 : 0.2} />
      )))}
      <path d="M72 58h22l-3-8h-16zM76 50c-2-10 2-18 7-22-4-4-1-9 3-9s6 4 3 9c6 3 9 12 6 22z" fill="#fff" />
      <path d="M104 58h14l-2-6h-10zM107 52l-2-12 6 3 6-3-2 12z" fill="#fff" fillOpacity="0.75" />
    </g>
  ),
  checkers: (
    <g>
      {Array.from({ length: 5 }, (_, r) => Array.from({ length: 10 }, (_, c) => (
        <rect key={`${r}${c}`} x={c * 16} y={r * 20} width="16" height="20" fill="#000" fillOpacity={(r + c) % 2 ? 0.25 : 0} />
      )))}
      <circle cx="56" cy="50" r="13" fill="#ef4444" stroke="#fff" strokeWidth="2.5" />
      <circle cx="56" cy="50" r="7" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="1.5" />
      <circle cx="96" cy="50" r="13" fill="#111827" stroke="#fff" strokeWidth="2.5" />
      <path d="M90 49l3-5 3 4 3-4 3 5v4h-12z" fill="#fde047" />
    </g>
  ),
  battleship: (
    <g>
      <path d="M0 74c20-6 40 6 60 0s40-6 60 0 30 4 40 0v26H0z" fill="#fff" fillOpacity="0.18" />
      <path d="M36 66h78l-10 12H48z" fill="#fff" />
      <rect x="62" y="54" width="22" height="12" rx="2" fill="#fff" fillOpacity="0.85" />
      <path d="M72 54V40M72 44h10" {...S} />
      <circle cx="126" cy="30" r="8" {...S} stroke="#fca5a5" />
      <path d="M126 18v24M114 30h24" {...S} stroke="#fca5a5" strokeWidth={2} />
    </g>
  ),
  memory: (
    <g>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={26 + i * 28} y={i % 2 ? 26 : 34} width="22" height="32" rx="4" fill="#fff" fillOpacity={i === 1 || i === 2 ? 1 : 0.25} transform={`rotate(${(i - 1.5) * 6} ${37 + i * 28} 50)`} />
      ))}
      <path d="M59 44l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1z" fill="#7c3aed" transform="translate(0 -2)" />
      <path d="M87 44l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1z" fill="#7c3aed" transform="translate(0 -10)" />
    </g>
  ),
  wordrace: (
    <g>
      {['#22c55e', '#eab308', '#ffffff', '#22c55e', '#22c55e'].map((c, i) => (
        <g key={i}>
          <rect x={22 + i * 24} y="34" width="20" height="24" rx="3" fill={c} fillOpacity={c === '#ffffff' ? 0.25 : 1} />
          <text x={32 + i * 24} y="51" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">{'RACES'[i]}</text>
        </g>
      ))}
      <path d="M22 70h40" {...S} strokeOpacity={0.6} />
      <path d="M22 78h70" {...S} strokeOpacity={0.35} />
    </g>
  ),
  hangman: (
    <g>
      <path d="M40 82h40M52 82V20h34v10" {...S} />
      <circle cx="86" cy="38" r="7" {...S} />
      <path d="M86 45v16M86 50l-8 6M86 50l8 6" {...S} />
      {[0, 1, 2, 3].map((i) => <path key={i} d={`M${100 + i * 14} 80h10`} {...S} />)}
      <text x="105" y="74" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">{ART_LETTERS.hangman}</text>
    </g>
  ),
  wordduel: (
    <g fontFamily="system-ui, sans-serif" fontWeight="800" fill="#fff">
      <text x="22" y="46" fontSize="20">{ART_LETTERS.duel[0]}</text>
      <text x="62" y="70" fontSize="20" fillOpacity="0.85">{ART_LETTERS.duel[1]}</text>
      <path d="M72 50c6 2 6 6 2 10" {...S} strokeWidth={2} strokeOpacity={0.6} />
    </g>
  ),
  trivia: (
    <g>
      <circle cx="80" cy="46" r="26" fill="#fff" fillOpacity="0.18" />
      <text x="80" y="58" textAnchor="middle" fontSize="36" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">?</text>
      {[0, 1, 2, 3].map((i) => <rect key={i} x={18 + i * 33} y="80" width="27" height="9" rx="4.5" fill="#fff" fillOpacity={i === 2 ? 0.95 : 0.3} />)}
    </g>
  ),
  drawing: (
    <g>
      <rect x="28" y="16" width="104" height="68" rx="6" fill="#fff" fillOpacity="0.92" />
      <path d="M44 66c8-24 22-28 30-14s20 12 28-8 18-8 18-8" fill="none" stroke="#7c3aed" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M112 74l18-26 6 4-18 26-8 3z" fill="#fde047" stroke="#1f2937" strokeWidth="1.5" />
    </g>
  ),
};
