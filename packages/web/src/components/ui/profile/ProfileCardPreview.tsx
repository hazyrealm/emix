import { useTranslation } from 'react-i18next';
import type { User } from '@backspace/shared';
import type { ProfileStyle } from '@backspace/shared/src/profileStyle';
import { Avatar } from '../Avatar';
import { getAvatarGradient, adjustColor, mutedGradient } from '../../../utils/gradients';
import { uploadSrc } from '../../../utils/profileStyle';
import { replaceEmojiShortcodes } from '../../../utils/emojiShortcodes';
import { ProfileBackgroundLayers, ProfileBanner, ProfileEffect, ProfileExtras, StyledName, Nameplate } from './ProfileVisuals';

/** The banner colour when a profile has no banner image, as the profile card draws it. */
export function bannerFallbackFor(user: Pick<User, 'id' | 'homeUserId' | 'accentColor' | 'avatarColor'>, displayName: string): string {
  if (user.accentColor) return mutedGradient(user.accentColor, adjustColor(user.accentColor, -40));
  const g = getAvatarGradient(user.homeUserId ?? user.id, displayName, user.avatarColor);
  return mutedGradient(g.from, g.to);
}

/**
 * The profile card as others will see it, drawn from `user` with `style` in
 * place of the saved one. Matches UserProfilePopout's layout.
 */
export function ProfileCardPreview({ user, style, playKey }: { user: User; style: ProfileStyle | null; playKey: number }) {
  const { t } = useTranslation(['settings', 'social']);
  const displayName = user.displayName || user.username;
  const glass = style?.glass || !!style?.background;
  return (
    <div className="relative w-full max-w-[340px] rounded-[12px] overflow-hidden glass-modal emx-surface shadow-xl">
      <ProfileBackgroundLayers background={style?.background} />
      <ProfileEffect id={style?.effect} playKey={`${style?.effect ?? ''}-${playKey}`} />
      <ProfileBanner src={uploadSrc(user.banner)} frame={style?.banner} fallback={bannerFallbackFor(user, displayName)} height={132} />
      <div className="px-4 pb-4 relative">
        <Avatar
          src={user.avatar}
          name={displayName}
          size={80}
          status="online"
          userId={user.homeUserId ?? user.id}
          user={user}
          decoration={style?.decoration ?? null}
          ring={{ width: 4, color: 'rgba(20,20,26,0.85)' }}
          className="mt-[-44px] mb-3"
        />
        <div className={glass ? 'emx-glass rounded-[10px] p-3 -mx-1' : undefined}>
          <StyledName name={displayName} style={style} className="text-[17px] font-semibold leading-tight" />
          <div className="text-[13px] text-txt-tertiary">
            @{user.username}
            {style?.pronouns && <span className="text-txt-secondary"> · {style.pronouns}</span>}
          </div>
          {user.customStatus && (
            <div className="text-[13px] text-txt-secondary italic mt-1">{replaceEmojiShortcodes(user.customStatus)}</div>
          )}
          <ProfileExtras style={style} className="mt-2" />
          {user.bio && (
            <>
              <div className="border-t border-white/[0.06] my-3" />
              <span className="text-[11px] uppercase tracking-wide font-semibold text-txt-tertiary">{t('social:profile.aboutMe')}</span>
              <div className="text-[13px] text-txt-secondary whitespace-pre-wrap break-words mt-1">{user.bio}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** How the name looks in a member list, with the nameplate behind it. */
export function MemberRowPreview({ user, style }: { user: User; style: ProfileStyle | null }) {
  const displayName = user.displayName || user.username;
  return (
    <div className="emx-plate-host flex items-center gap-2.5 px-2 py-1.5 rounded-[6px] bg-surface-channel/60 w-full max-w-[240px]">
      <Nameplate id={style?.nameplate} />
      <Avatar src={user.avatar} name={displayName} size={32} status="online" userId={user.homeUserId ?? user.id} user={user} decoration={style?.decoration ?? null} />
      <StyledName name={displayName} style={style} className="inline-block max-w-full truncate text-[13.5px] font-medium text-txt-primary" />
    </div>
  );
}
