import path from 'node:path';
import { RINGTONE_ID_PATTERN } from '@backspace/shared/src/ringtones.js';
import { config } from '../config.js';

/** Outside the uploads folder, which /api/uploads serves to anyone with the link. */
export function ringtoneDir(): string {
  return path.resolve(config.uploadDir, '..', 'ringtones');
}

export function ringtoneFile(id: string): string {
  if (!RINGTONE_ID_PATTERN.test(id)) throw new Error('bad ringtone id');
  return path.join(ringtoneDir(), `${id}.ogg`);
}
