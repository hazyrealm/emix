import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GAMES, GAME_IDS, type GameId, type GameOptions } from '@backspace/shared/src/games';
import { useGameStore, type GamePickerRequest } from '../../stores/gameStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { GameArt } from './GameArt';
import { GAME_BLURB_KEYS, GAME_NAME_KEYS } from './gameCatalog';
import { GameOptionsForm } from './GameOptionsForm';
import { InvitePicker } from './InvitePicker';
import { GameButton, GamepadIcon } from './gameUi';

/**
 * Start a game: pick it, set its options, invite people. From a call, the
 * other people in the call are invited by default; from a conversation, the
 * people in it.
 */
export function NewGameDialog({ request }: { request: GamePickerRequest }) {
  const { t } = useTranslation(['games']);
  const close = useGameStore((s) => s.closePicker);
  const create = useGameStore((s) => s.create);
  const callPeople = useVoiceStore((s) => s.participants.filter((p) => !p.isLocal).map((p) => p.userId).join(','));
  const [gameId, setGameId] = useState<GameId | null>(request.gameId ?? null);
  const [options, setOptions] = useState<GameOptions>({});
  const [invite, setInvite] = useState<string[]>(() => {
    if (request.invite) return request.invite;
    if (request.context?.kind === 'voice' && callPeople) return callPeople.split(',');
    return [];
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const meta = gameId ? GAMES[gameId] : null;
  const max = meta ? meta.maxPlayers - 1 : 7;
  const tooMany = invite.length > max;

  const submit = async () => {
    if (!gameId) return;
    setBusy(true);
    const session = await create({ gameId, options, context: request.context ?? { kind: 'direct' }, invite: invite.slice(0, max) });
    setBusy(false);
    if (session) close();
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-end desktop:items-center justify-center" role="dialog" aria-modal="true" aria-label={request.context?.kind === 'voice' ? t('games:nav.playTogether') : t('games:new.title')}>
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div className="relative w-full desktop:max-w-2xl max-h-[calc(92*var(--app-vh))] desktop:max-h-[calc(85*var(--app-vh))] flex flex-col rounded-t-2xl desktop:rounded-2xl glass-modal animate-slide-up overflow-hidden">
        <header className="flex items-center gap-2 px-5 py-4 border-b border-white/[0.06]">
          <span className="text-accent-primary"><GamepadIcon /></span>
          <h2 className="flex-1 text-[17px] font-bold">{request.context?.kind === 'voice' ? t('games:nav.playTogether') : t('games:new.title')}</h2>
          <button type="button" onClick={close} aria-label={t('games:common.close')} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/[0.08] text-txt-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          <section>
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-txt-tertiary mb-2">{t('games:new.pickGame')}</h3>
            <div className="grid grid-cols-2 desktop:grid-cols-3 gap-2.5">
              {GAME_IDS.map((id) => (
                <button key={id} type="button" onClick={() => { setGameId(id); setOptions({}); }} aria-pressed={gameId === id}
                  className={`text-left rounded-xl overflow-hidden ring-2 transition-all ${gameId === id ? 'ring-accent-primary' : 'ring-transparent hover:ring-white/20'}`}>
                  <GameArt id={id} className="h-16" />
                  <div className="px-2.5 py-2 bg-white/[0.04]">
                    <div className="text-[13px] font-semibold truncate">{t(GAME_NAME_KEYS[id])}</div>
                    <div className="text-[11px] text-txt-tertiary truncate">{t(GAME_BLURB_KEYS[id])}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
          {gameId && (
            <section className="flex flex-col gap-3">
              <GameOptionsForm gameId={gameId} value={options} onChange={setOptions} />
            </section>
          )}
          <section>
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-txt-tertiary mb-2">{t('games:new.invite')}</h3>
            <InvitePicker selected={invite} onChange={setInvite} max={max} />
            {tooMany && <p className="text-[12px] text-accent-amber mt-1">{t('games:new.tooMany', { max })}</p>}
            <p className="text-[12px] text-txt-tertiary mt-1">{t('games:new.inviteHint')}</p>
          </section>
        </div>
        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/[0.06]">
          <GameButton kind="ghost" onClick={close}>{t('games:common.cancel')}</GameButton>
          <GameButton kind="primary" disabled={!gameId || busy} onClick={() => void submit()}>{busy ? t('games:new.creating') : t('games:new.create')}</GameButton>
        </footer>
      </div>
    </div>
  );
}
