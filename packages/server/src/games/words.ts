/**
 * Word data for Emix word games. Guesses and played words are checked against
 * the SCOWL-derived list in the `word-list` package (MIT); answers come from
 * the short lists below, chosen for Emix: common, familiar words, so a daily
 * puzzle is fair. Nothing here is ever sent to a client before it is played.
 */
import { readFileSync } from 'node:fs';
import wordListPath from 'word-list';
import type { LetterMark } from '@backspace/shared/src/games.js';

let dictionary: Set<string> | null = null;

function load(): Set<string> {
  if (dictionary) return dictionary;
  // `word-list` exports the path of its words.txt (one lowercase word per line).
  const text = readFileSync(wordListPath, 'utf8');
  dictionary = new Set(text.split('\n').map((w) => w.trim()).filter((w) => /^[a-z]+$/.test(w)));
  return dictionary;
}

/** Whether `word` (any case) is an English word in the dictionary. */
export function isWord(word: string): boolean {
  const w = word.toLowerCase();
  return /^[a-z]+$/.test(w) && load().has(w);
}

/** Lowercase a-z only, or null. */
export function cleanWord(raw: unknown, min: number, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const w = raw.trim().toLowerCase();
  return w.length >= min && w.length <= max && /^[a-z]+$/.test(w) ? w : null;
}

/** Marks for a guess against the answer, counting repeated letters correctly. */
export function markGuess(guess: string, answer: string): LetterMark[] {
  const marks: LetterMark[] = Array(guess.length).fill('absent');
  const left: Record<string, number> = {};
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) marks[i] = 'correct';
    else left[answer[i]!] = (left[answer[i]!] ?? 0) + 1;
  }
  for (let i = 0; i < guess.length; i++) {
    if (marks[i] === 'correct') continue;
    const ch = guess[i]!;
    if ((left[ch] ?? 0) > 0) { marks[i] = 'present'; left[ch]! -= 1; }
  }
  return marks;
}

/** Five-letter answers for the daily puzzle and Word Race. */
const FIVE = `
about above actor acute adapt admit adopt adult after again agent agree ahead alarm album alert alike alive allow alone along alter amber among angle angry ankle apart apple apply arena argue arise armor arrow aside asset audio avoid awake award aware badge baker basic basin beach beard beast begin being below bench berry birth black blade blame blank blast blaze blend bless blind block bloom board boast bonus boost booth brain brand brave bread break brick bride brief bring broad brook brown brush build bunch burst cabin cable camel candy canoe cargo carry catch cause cedar chain chair chalk charm chart chase cheap check cheek cheer chess chest chief child chill choir civic claim clash class clean clear clerk click cliff climb clock close cloth cloud coach coast color comet coral couch count court cover craft crane crash cream creek crisp cross crowd crown crust curve cycle daily dance dealt debut decay delay depth diary dream dress drift drink drive eager eagle early earth eight elbow elder elite empty enjoy enter entry equal error essay event every exact exist extra fable faith false fancy feast fence ferry fever fiber field fifth fifty final flame flash fleet flock flood floor flour fluid focus force forge forth forum found frame fresh front frost fruit funny ghost giant given glass globe glory glove grace grade grain grand grape grass great green greet group guard guess guest guide habit happy harsh heart heavy hedge hello hobby honey honor horse hotel house human humor ideal image index inner input issue ivory jelly jewel joint judge juice jumbo kayak knife knock label large laser later laugh layer learn lemon level light limit linen lodge logic loose lucky lunar lunch magic major maple march match mayor medal metal meter might minor mixer model money month moral motor mount mouse mouth movie music naval nerve never night noble noise north novel nurse ocean offer often olive onion opera orbit order organ other otter outer owner paint panel paper party pasta patch peace peach pearl pedal penny phase phone photo piano piece pilot pitch pixel pizza place plain plane plant plate plaza point polar porch pound power press price pride prime print prize proof proud pulse punch puppy queen quest quick quiet quilt quite quota quote radar radio raise ranch range rapid raven reach react ready realm relax reply ridge rifle right rival river roast robin robot rocky round route royal rugby ruler rural salad sauce scale scarf scene scent scope score scout shade shake shape share shark sharp sheep shelf shell shift shine shirt shock shore short shout sight silky silver skate skill skirt slate sleep slice slide slope small smart smile smoke snack snake solar solid solve sound south space spare spark speak speed spell spend spice spine spoon sport spray squad stack staff stage stair stamp stand start state steam steel steep stick still stock stone storm story stove straw strip study style sugar suite sunny super sweet swing table taste teach tease tempo thank theme thick thing think third thumb tiger toast today topic torch total touch tower track trade trail train treat trend trial tribe trick truck truly trunk trust truth tulip tutor twist ultra uncle under union unity until upper upset urban usage usual valid value vapor vault venue verse video vigor villa vinyl violin visit vital vivid vocal voice wagon waste watch water whale wheat wheel while white whole woman world worth wrist write yacht yearn young youth zebra
`.split(/\s+/).filter((w) => w.length === 5);

/** Hangman words when a player asks for a random one. */
const HANGMAN = `
adventure airplane anchor balloon bicycle blanket butterfly calendar camera candle castle chocolate compass cookie crystal diamond dinosaur dolphin dragon elephant festival firework fountain galaxy garden giraffe guitar hammock harbor helmet holiday island jacket journey kangaroo keyboard kitchen ladder lantern library lighthouse magnet marble meadow microphone mountain mushroom necklace notebook octopus orchestra painting pancake parrot penguin pepper picnic pillow planet popcorn pumpkin puzzle rainbow rocket sandwich satellite scissors shadow skeleton snowflake spider squirrel stadium strawberry submarine sunflower telescope thunder tornado treasure triangle trumpet umbrella unicorn vacation valley volcano waffle waterfall whistle window winter wizard yogurt
`.split(/\s+/).filter(Boolean);

let answersCache: string[] | null = null;
let hangmanCache: string[] | null = null;

/** The five-letter answer list (only words the dictionary also accepts). */
export function fiveLetterAnswers(): string[] {
  answersCache ??= [...new Set(FIVE)].filter(isWord);
  return answersCache;
}

export function hangmanWords(): string[] {
  hangmanCache ??= HANGMAN.filter(isWord);
  return hangmanCache;
}

/** Letters a Word Duel can start from (plenty of words begin with each). */
export const START_LETTERS = 'abcdefghlmnoprstw'.split('');

/** Word Duel points: one per letter, plus a bonus for each hard letter. */
export function duelPoints(word: string): number {
  let points = word.length;
  for (const ch of word) if ('jqxz'.includes(ch)) points += 3; else if ('kvwy'.includes(ch)) points += 1;
  return points;
}
