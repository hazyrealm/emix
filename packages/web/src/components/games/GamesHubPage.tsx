import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { GAMES, GAME_CATEGORIES, GAME_IDS, type GameCategory, type GameId, type GameSessionView } from '@backspace/shared/src/games';
import { api } from '../../api/client';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { GameArt } from './GameArt';
import { CATEGORY_KEYS, GAME_BLURB_KEYS, GAME_NAME_KEYS } from './gameCatalog';
import { DailyWord } from './DailyWord';
import { GameStatsView, useGameStats } from './GameStatsView';
import { GameButton, GamepadIcon, PlayerName } from './gameUi';

function SessionRow({ session, me }: { session: GameSessionView; me: string }) {
  const { t } = useTranslation(['games']);
  const open = useGameStore((s) => s.open);
  const accept = useGameStore((s) => s.accept);
  const decline = useGameStore((s) => s.decline);
  const invited = session.invited.includes(me);
  const others = (session.seats.length ? session.seats : session.players).filter((p) => p !== me);
  const status = invited ? t('games:hub.status.invited')
    : session.status === 'lobby' ? t('games:hub.status.lobby')
      : session.status === 'finished' ? t('games:hub.status.finished')
        : t('games:hub.status.playing');
  return (
    <li className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-2.5">
      <GameArt id={session.gameId} className="w-12 h-12 rounded-lg flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold truncate">{t(GAME_NAME_KEYS[session.gameId])}</div>
        <div className="text-[12px] text-txt-secondary truncate">
          {invited ? <><PlayerName id={session.hostId} /> {t('games:hub.invitedYou')}</> : others.length ? <>{t('games:stats.vs')} {others.map((o, i) => <span key={o}>{i > 0 ? ', ' : ''}<PlayerName id={o} /></span>)}</> : t('games:hub.waitingForPlayers')}
          <span className="text-txt-tertiary"> · {status}</span>
        </div>
      </div>
      {invited ? (
        <div className="flex gap-1.5">
          <GameButton kind="primary" onClick={() => void accept(session.id)}>{t('games:invite.accept')}</GameButton>
          <GameButton onClick={() => void decline(session.id)}>{t('games:invite.decline')}</GameButton>
        </div>
      ) : <GameButton kind="primary" onClick={() => open(session.id)}>{t('games:hub.open')}</GameButton>}
    </li>
  );
}

function Settings() {
  const { t } = useTranslation(['games']);
  const volume = useGameStore((s) => s.volume);
  const muted = useGameStore((s) => s.muted);
  const colorblind = useGameStore((s) => s.colorblind);
  const { setVolume, setMuted, setColorblind } = useGameStore.getState();
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <label className="flex items-center gap-3">
        <span className="w-28 text-txt-secondary">{t('games:audio.volume')}</span>
        <input type="range" min={0} max={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))} disabled={muted} className="flex-1 accent-[rgb(var(--accent-primary))]" aria-label={t('games:audio.volume')} />
        <span className="w-10 text-right tabular-nums">{volume}%</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} className="accent-[rgb(var(--accent-primary))]" />{t('games:audio.muteAll')}</label>
      <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={colorblind} onChange={(e) => setColorblind(e.target.checked)} className="accent-[rgb(var(--accent-primary))]" />{t('games:audio.colorblind')}</label>
      <p className="text-[12px] text-txt-tertiary">{t('games:audio.hint')}</p>
    </div>
  );
}

function MyStats() {
  const { t } = useTranslation(['games']);
  const [reload, setReload] = useState(0);
  const { stats, failed } = useGameStats('@me', reload);
  const addToast = useUIStore((s) => s.addToast);
  if (failed) return <p className="text-[13px] text-txt-tertiary">{t('games:common.loadFailed')}</p>;
  if (!stats) return <p className="text-[13px] text-txt-tertiary" role="status">{t('games:common.loading')}</p>;
  return (
    <div className="flex flex-col gap-3">
      <GameStatsView stats={stats} />
      <label className="flex items-center gap-2 text-[13px] cursor-pointer">
        <input
          type="checkbox"
          checked={stats.visible}
          onChange={(e) => {
            api.games.setStatsVisible(e.target.checked).then(() => setReload((r) => r + 1)).catch(() => addToast(t('games:common.saveFailed'), 'warning'));
          }}
          className="accent-[rgb(var(--accent-primary))]"
        />
        {t('games:stats.showOnProfile')}
      </label>
    </div>
  );
}

/**
 * The Games hub: today's word puzzle, invitations, your open games, every
 * game by category, recently played games, your statistics and game settings.
 */
export function GamesHubPage() {
  const { t } = useTranslation(['games']);
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useUIStore((s) => s.isMobile);
  const me = useAuthStore((s) => s.user?.id ?? '');
  const sessions = useGameStore((s) => s.sessions);
  const openPicker = useGameStore((s) => s.openPicker);
  const [category, setCategory] = useState<GameCategory | 'all'>('all');
  const [mobileDaily, setMobileDaily] = useState(false);
  const daily = location.pathname === '/games/daily' || mobileDaily;
  const { stats } = useGameStats('@me');

  const list = useMemo(() => Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt), [sessions]);
  const invites = list.filter((s) => s.invited.includes(me));
  const mine = list.filter((s) => s.players.includes(me));
  const recent = useMemo(() => [...new Set((stats?.recent ?? []).map((r) => r.gameId))].slice(0, 6) as GameId[], [stats]);
  const games = GAME_IDS.filter((id) => category === 'all' || GAMES[id].category === category);
  const showDaily = () => (isMobile ? setMobileDaily(true) : navigate('/games/daily'));
  const hideDaily = () => (isMobile ? setMobileDaily(false) : navigate('/games'));

  if (daily) {
    return (
      <div className="flex-1 min-w-0 h-full overflow-y-auto bg-surface-chat">
        <div className="max-w-3xl mx-auto px-4 py-4 flex flex-col gap-4">
          <button type="button" onClick={hideDaily} className="self-start text-[13px] text-accent-primary hover:underline">← {t('games:hub.back')}</button>
          <DailyWord />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 h-full overflow-y-auto bg-surface-chat">
      <div className="max-w-6xl mx-auto px-4 desktop:px-6 py-5 flex flex-col gap-7">
        <header className="flex flex-wrap items-end gap-3 justify-between">
          <div>
            <h1 className="text-[24px] font-extrabold flex items-center gap-2"><span className="text-accent-primary"><GamepadIcon size={26} /></span>{t('games:hub.title')}</h1>
            <p className="text-[14px] text-txt-secondary mt-0.5">{t('games:hub.subtitle')}</p>
          </div>
          <GameButton kind="primary" onClick={() => openPicker({})}>{t('games:hub.startGame')}</GameButton>
        </header>

        <section className="rounded-2xl overflow-hidden relative" style={{ background: 'linear-gradient(120deg, #065f46, #0e7490 55%, #4338ca)' }}>
          <div className="relative z-10 flex flex-wrap items-center gap-4 p-5">
            <div className="flex gap-1.5" aria-hidden>
              {['#16a34a', '#ca8a04', '#3f3f46', '#16a34a', '#16a34a'].map((c, i) => (
                <span key={i} className="w-9 h-9 rounded-md flex items-center justify-center font-extrabold text-white" style={{ background: c }}>{'DAILY'[i]}</span>
              ))}
            </div>
            <div className="flex-1 min-w-[12rem] text-white">
              <div className="text-[18px] font-bold">{t('games:daily.cardTitle')}</div>
              <div className="text-[13px] opacity-85">{stats ? t('games:daily.cardStreak', { count: stats.daily.currentStreak }) : t('games:daily.cardSubtitle')}</div>
            </div>
            <button type="button" onClick={showDaily} className="px-4 py-2 rounded-lg bg-white text-[#065f46] text-[14px] font-bold hover:bg-white/90">{t('games:daily.play')}</button>
          </div>
        </section>

        {invites.length > 0 && (
          <section>
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-txt-tertiary mb-2">{t('games:hub.invites')}</h2>
            <ul className="grid gap-2 desktop:grid-cols-2">{invites.map((s) => <SessionRow key={s.id} session={s} me={me} />)}</ul>
          </section>
        )}

        {mine.length > 0 && (
          <section>
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-txt-tertiary mb-2">{t('games:hub.yourGames')}</h2>
            <ul className="grid gap-2 desktop:grid-cols-2">{mine.map((s) => <SessionRow key={s.id} session={s} me={me} />)}</ul>
          </section>
        )}

        {recent.length > 0 && (
          <section>
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-txt-tertiary mb-2">{t('games:hub.recent')}</h2>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {recent.map((id) => (
                <button key={id} type="button" onClick={() => openPicker({ gameId: id })} className="flex items-center gap-2 rounded-full bg-white/[0.05] hover:bg-white/[0.1] pl-1 pr-3 py-1 flex-shrink-0">
                  <GameArt id={id} className="w-7 h-7 rounded-full" />
                  <span className="text-[13px] font-medium">{t(GAME_NAME_KEYS[id])}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-txt-tertiary mr-2">{t('games:hub.allGames')}</h2>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('games:hub.categoriesLabel')}>
              {(['all', ...GAME_CATEGORIES] as const).map((c) => (
                <button key={c} type="button" role="tab" aria-selected={category === c} onClick={() => setCategory(c)}
                  className={`px-3 py-1 rounded-full text-[13px] transition-colors ${category === c ? 'bg-accent-primary text-on-accent' : 'bg-white/[0.06] text-txt-secondary hover:bg-white/[0.12]'}`}>
                  {c === 'all' ? t('games:hub.categories.all') : t(CATEGORY_KEYS[c])}
                </button>
              ))}
            </div>
          </div>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {games.map((id) => {
              const meta = GAMES[id];
              return (
                <li key={id} className="group rounded-2xl overflow-hidden bg-surface-channel ring-1 ring-white/[0.06] hover:ring-accent-primary/50 transition-shadow flex flex-col">
                  <GameArt id={id} className="h-28 transition-transform duration-300 group-hover:scale-[1.03]" />
                  <div className="p-3 flex flex-col gap-1 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-[15px] font-bold">{t(GAME_NAME_KEYS[id])}</h3>
                      <span className="text-[11px] text-txt-tertiary">{t(CATEGORY_KEYS[meta.category])}</span>
                    </div>
                    <p className="text-[13px] text-txt-secondary flex-1">{t(GAME_BLURB_KEYS[id])}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[12px] text-txt-tertiary">
                        {meta.minPlayers === meta.maxPlayers ? t('games:hub.playersExact', { count: meta.maxPlayers }) : t('games:hub.playersRange', { min: meta.minPlayers, max: meta.maxPlayers })}
                        {' · '}{t('games:hub.minutes', { count: meta.minutes })}
                      </span>
                      <GameButton kind="primary" className="!py-1.5" onClick={() => openPicker({ gameId: id })}>{t('games:hub.play')}</GameButton>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="grid gap-6 desktop:grid-cols-[2fr_1fr]">
          <section className="rounded-2xl bg-white/[0.03] p-4">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-txt-tertiary mb-3">{t('games:stats.title')}</h2>
            <MyStats />
          </section>
          <section className="rounded-2xl bg-white/[0.03] p-4">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-txt-tertiary mb-3">{t('games:audio.title')}</h2>
            <Settings />
          </section>
        </div>
        <p className="text-[12px] text-txt-tertiary text-center pb-4">{t('games:hub.free')}</p>
      </div>
    </div>
  );
}
