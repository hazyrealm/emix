import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSocialStore } from '../../stores/socialStore';
import { useAuthStore } from '../../stores/authStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { Avatar } from '../ui/Avatar';
import { PlayerName } from './gameUi';

/**
 * Choose who to invite: people in your call first, then friends (this
 * instance's accounts; the server checks every invitation again).
 */
export function InvitePicker({ selected, onChange, exclude = [], max }: { selected: string[]; onChange: (ids: string[]) => void; exclude?: string[]; max: number }) {
  const { t } = useTranslation(['games']);
  const friends = useSocialStore((s) => s.friends);
  const loadFriends = useSocialStore((s) => s.loadFriends);
  const me = useAuthStore((s) => s.user?.id);
  const callIds = useVoiceStore((s) => s.participants.filter((p) => !p.isLocal).map((p) => p.userId).join(','));
  const [query, setQuery] = useState('');
  useEffect(() => { if (friends.length === 0) void loadFriends(); }, [friends.length, loadFriends]);

  const inCall = useMemo(() => (callIds ? callIds.split(',') : []).filter((id) => id !== me && !exclude.includes(id)), [callIds, me, exclude]);
  const friendRows = useMemo(() => friends
    .filter((f) => f._instanceOrigin === '' && !inCall.includes(f.id) && !exclude.includes(f.id))
    .filter((f) => !query || (f.displayName ?? '').toLowerCase().includes(query.toLowerCase()) || f.username.toLowerCase().includes(query.toLowerCase())),
  [friends, inCall, exclude, query]);

  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else if (selected.length < max) onChange([...selected, id]);
  };

  const row = (id: string, name: React.ReactNode, avatar: string | null, extra?: string) => (
    <li key={id}>
      <label className={`flex items-center gap-3 px-2 py-1.5 rounded-lg cursor-pointer ${selected.includes(id) ? 'bg-accent-primary/15' : 'hover:bg-white/[0.05]'}`}>
        <input type="checkbox" checked={selected.includes(id)} onChange={() => toggle(id)} disabled={!selected.includes(id) && selected.length >= max} className="accent-[rgb(var(--accent-primary))] w-4 h-4" />
        <Avatar src={avatar} name={typeof name === 'string' ? name : id} size={28} userId={id} />
        <span className="flex-1 min-w-0 truncate text-[14px]">{name}</span>
        {extra && <span className="text-[11px] text-status-online">{extra}</span>}
      </label>
    </li>
  );

  return (
    <div className="flex flex-col gap-2">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('games:new.search')} aria-label={t('games:new.search')} className="input-search px-3 py-2 rounded-lg text-[14px]" />
      <ul className="flex flex-col gap-0.5 max-h-60 overflow-y-auto">
        {inCall.map((id) => row(id, <PlayerName id={id} />, null, t('games:new.inCall')))}
        {friendRows.map((f) => row(f.id, f.displayName || f.username, f.avatar))}
        {inCall.length === 0 && friendRows.length === 0 && <li className="text-[13px] text-txt-tertiary px-2 py-3">{query ? t('games:new.noMatches') : t('games:new.noFriends')}</li>}
      </ul>
      <div className="text-[12px] text-txt-tertiary">{t('games:new.selected', { count: selected.length, max })}</div>
    </div>
  );
}
