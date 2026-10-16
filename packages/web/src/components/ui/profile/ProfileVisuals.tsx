import React, { useMemo } from 'react';
import type {
  AvatarDecorationId,
  NameplateId,
  ProfileBackground,
  ProfileBannerFrame,
  ProfileEffectId,
  ProfileStyle,
} from '@backspace/shared/src/profileStyle';
import { backgroundFill, nameRender, profileStyleOf, uploadSrc } from '../../../utils/profileStyle';

type StyledUser = { profileStyle?: unknown } | null | undefined;

/**
 * A display name in its owner's chosen colours and effect. `roleColor` is a
 * space role's colour: where one applies it wins, so moderators and other
 * roles stay recognisable inside their space.
 */
export function StyledName({ name, user, style: nameStyle, roleColor, className = '', title }: {
  name: string;
  user?: StyledUser;
  /** A style to preview instead of the user's own. */
  style?: ProfileStyle | null;
  roleColor?: string | null;
  className?: string;
  title?: string;
}) {
  const style = nameStyle !== undefined ? nameStyle : profileStyleOf(user);
  const render = roleColor ? null : nameRender(style?.name);
  if (!render) {
    return <span className={className} style={roleColor ? { color: roleColor } : undefined} title={title}>{name}</span>;
  }
  return <span className={`${className} ${render.className}`} style={render.style} title={title}>{name}</span>;
}

/**
 * The nameplate layer behind a list row. The row needs `emx-plate-host`
 * (positioned, isolated) and rounded corners of its own; see {@link nameplateOf}.
 */
export function Nameplate({ id }: { id: NameplateId | undefined }) {
  if (!id) return null;
  return <span aria-hidden className={`emx-plate emx-plate-${id}`} />;
}

/** The user's nameplate id, for rows that render one. */
export function nameplateOf(user: StyledUser): NameplateId | undefined {
  return profileStyleOf(user)?.nameplate;
}

const GLYPHS: Partial<Record<AvatarDecorationId, { path: string; fill: string; stroke?: boolean }>> = {
  hearts: { path: 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.6 4.5c2 0 3.6 1.1 4.4 2.6.8-1.5 2.4-2.6 4.4-2.6 3.6 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z', fill: '#ff4f9a' },
  stars: { path: 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z', fill: '#ffd34d' },
  snowflakes: { path: 'M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5', fill: '#e0f2fe', stroke: true },
  sparkle: { path: 'M12 1.5c.7 5.2 2.6 7.6 8 8.5-5.4.9-7.3 3.3-8 8.5-.7-5.2-2.6-7.6-8-8.5 5.4-.9 7.3-3.3 8-8.5z', fill: '#f5d0fe' },
  leaves: { path: 'M4 20c0-9 6.5-15.5 16-16-.5 9.5-7 16-16 16zm0 0l9-9', fill: '#f59e0b' },
};

/** Where the glyphs sit on the ring (degrees, 0 = right, clockwise). */
const GLYPH_ANGLES = [-50, 155, 60];

/**
 * A decoration drawn around an avatar. Rendered inside `Avatar`, which is
 * `relative`; the decoration extends past it and never takes clicks.
 */
export function AvatarDecoration({ id }: { id: AvatarDecorationId }) {
  const glyph = GLYPHS[id];
  return (
    <span aria-hidden className={`emx-deco emx-deco-${id}`}>
      <span className="emx-deco-ring" />
      {id === 'cyber' && <span className="emx-deco-ring" />}
      {id === 'orbit' && <span className="emx-deco-sat" />}
      {glyph && GLYPH_ANGLES.map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <span
            key={deg}
            className="emx-deco-glyph"
            style={{ left: `${50 + 45 * Math.cos(rad)}%`, top: `${50 + 45 * Math.sin(rad)}%`, animationDelay: `${i * 0.6}s` }}
          >
            <svg viewBox="0 0 24 24">
              <path d={glyph.path} fill={glyph.stroke ? 'none' : glyph.fill} stroke={glyph.stroke ? glyph.fill : 'none'} strokeWidth={glyph.stroke ? 2.2 : 0} strokeLinecap="round" />
            </svg>
          </span>
        );
      })}
    </span>
  );
}

const HEART = 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.6 4.5c2 0 3.6 1.1 4.4 2.6.8-1.5 2.4-2.6 4.4-2.6 3.6 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z';
const PARTICLE_COUNT: Record<ProfileEffectId, number> = {
  'falling-stars': 7, sparkles: 12, hearts: 10, snow: 18, 'neon-particles': 14,
  galaxy: 10, 'light-streaks': 5, glow: 0, confetti: 22, 'digital-rain': 9,
};

/**
 * A profile effect: a short burst of particles over the card when it opens.
 * Each particle's position and timing come from its index, so the layout is
 * stable across renders. It plays three cycles and stops; `playKey` replays it.
 */
export function ProfileEffect({ id, playKey }: { id: ProfileEffectId | undefined; playKey?: string | number }) {
  const particles = useMemo(() => {
    if (!id) return [];
    return Array.from({ length: PARTICLE_COUNT[id] }, (_, i) => {
      const left = (i * 37 + 11) % 100;
      const top = (i * 53 + 7) % 90;
      const delay = ((i * 0.61) % 2.4).toFixed(2);
      const duration = (2.6 + ((i * 0.43) % 2)).toFixed(2);
      const style: React.CSSProperties = { left: `${left}%`, animationDelay: `${delay}s`, animationDuration: `${duration}s` };
      if (id === 'sparkles' || id === 'galaxy') style.top = `${top}%`;
      if (id === 'light-streaks') { style.top = `${12 + ((i * 19) % 76)}%`; style.left = '-40%'; }
      if (id === 'falling-stars') style.left = `${30 + ((i * 29) % 80)}%`;
      return { key: i, style };
    });
  }, [id]);
  if (!id) return null;
  return (
    <span key={playKey} aria-hidden className={`emx-fx emx-fx-${id}`}>
      {particles.map(({ key, style }) => (
        <i key={key} style={style}>
          {id === 'hearts' && <svg viewBox="0 0 24 24"><path d={HEART} fill="currentColor" /></svg>}
          {id === 'digital-rain' && ((key * 7919) % 2 ? '10110' : '01001')}
        </i>
      ))}
    </span>
  );
}

/**
 * The background layers of a profile card: colour, optional image (framed,
 * faded, blurred) and a scrim that keeps text readable on any of them.
 */
export function ProfileBackgroundLayers({ background }: { background: ProfileBackground | undefined }) {
  const fill = backgroundFill(background);
  const image = uploadSrc(background?.image);
  if (!fill && !image) return null;
  const x = background?.x ?? 50;
  const y = background?.y ?? 50;
  return (
    <div aria-hidden className="emx-surface-bg">
      {fill && <div className={fill.animated ? 'emx-surface-animated' : undefined} style={{ background: fill.background }} />}
      {image && (
        <img
          src={image}
          alt=""
          className="emx-surface-img"
          style={{
            objectPosition: `${x}% ${y}%`,
            transform: `scale(${(background?.zoom ?? 100) / 100})`,
            transformOrigin: `${x}% ${y}%`,
            opacity: (background?.opacity ?? 100) / 100,
            filter: background?.blur ? `blur(${background.blur}px)` : undefined,
          }}
        />
      )}
      <div className="emx-surface-scrim" />
    </div>
  );
}

/**
 * A profile banner: the image framed by the owner's focus point and zoom, or
 * the colour fallback. Animated GIF banners play as uploaded.
 */
export function ProfileBanner({ src, frame, fallback, height, className = '', children }: {
  src: string | null;
  frame?: ProfileBannerFrame;
  fallback: string;
  height: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const x = frame?.x ?? 50;
  const y = frame?.y ?? 50;
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ height, background: src ? undefined : fallback }}>
      {src && (
        <img
          src={src}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover select-none"
          style={{ objectPosition: `${x}% ${y}%`, transform: `scale(${(frame?.zoom ?? 100) / 100})`, transformOrigin: `${x}% ${y}%` }}
        />
      )}
      {children}
    </div>
  );
}

/** Pronouns and links under a profile's name. */
export function ProfileExtras({ style, className = '' }: { style: ProfileStyle | null; className?: string }) {
  if (!style?.links?.length) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {style.links.map((link) => (
        <a
          key={link.url}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          title={link.url}
          className="inline-flex items-center gap-1 max-w-full rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] px-2.5 py-1 text-[12px] text-txt-secondary hover:text-txt-primary transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
            <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
          </svg>
          <span className="truncate">{link.label}</span>
        </a>
      ))}
    </div>
  );
}
