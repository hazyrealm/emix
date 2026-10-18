import { and, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { getDb, schema } from '../db/index.js';

/**
 * Whether `viewerId` has a relationship with `ownerId` that lets them reach
 * each other directly: they are friends, or they share an open conversation.
 * Used for shared ringtones and game invitations.
 */
export function canReach(viewerId: string, ownerId: string): boolean {
  if (viewerId === ownerId) return true;
  const db = getDb();
  const friend = db.select({ id: schema.friends.userId }).from(schema.friends)
    .where(and(eq(schema.friends.userId, viewerId), eq(schema.friends.friendId, ownerId))).get();
  if (friend) return true;
  const other = alias(schema.dmMembers, 'other');
  const shared = db.select({ id: schema.dmMembers.dmChannelId }).from(schema.dmMembers)
    .innerJoin(other, eq(other.dmChannelId, schema.dmMembers.dmChannelId))
    .innerJoin(schema.dmChannels, eq(schema.dmChannels.id, schema.dmMembers.dmChannelId))
    .where(and(eq(schema.dmMembers.userId, viewerId), eq(other.userId, ownerId), isNull(schema.dmChannels.deletedAt)))
    .get();
  return !!shared;
}
