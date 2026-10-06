import { pathOf } from '../zoom/levels';

/**
 * A Share link carries its Program in the URL fragment, which browsers never send to a server (ADR 0004): `#code=`,
 * then the Program's UTF-8 bytes, compressed with deflate and written in base64url.
 */
const PREFIX = '#code=';

/**
 * The most a Share link's Program can unpack into. A 20-line Program needs far less. Deflate can shrink repeated text
 * about 1,000 times, so a link of a megabyte could unpack into a gigabyte, which would freeze the page.
 */
const MOST_BYTES = 1_000_000;

async function compressed(code: string) {
  const stream = new Blob([code]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** `bytes` decompressed, or null once they pass `MOST_BYTES`, where decompressing stops. */
async function decompressed(bytes: Uint8Array) {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.length;
    if (size > MOST_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(chunk.value);
  }
  return new Uint8Array(await new Blob(chunks as BlobPart[]).arrayBuffer());
}

function base64url(bytes: Uint8Array) {
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const fromBase64url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** A link to zoom level 1 of this site, carrying `code`. `here` is the page's address. */
export async function shareLinkFor(code: string, here: string) {
  return new URL(pathOf(1) + PREFIX + base64url(await compressed(code)), here).href;
}

/** Whether `fragment` is a Share link's, whose Program goes once the editor holds another. */
export const isShareFragment = (fragment: string) => fragment.startsWith(PREFIX);

/** A Share link's Program couldn't be opened: the link is `broken`, or carries more than `MOST_BYTES`. */
export type UnreadLink = { kind: 'broken' } | { kind: 'tooLarge' };

/** What a URL fragment carries: a Share link's Program, a link that couldn't be read, or null for any other fragment. */
export type InLink = { kind: 'program'; code: string } | UnreadLink | null;

/**
 * What `fragment` carries. A Share link cut short when it was copied, or changed by hand, no longer decompresses into
 * UTF-8 text, and is broken. Windows line endings become plain newlines, as the editor holds them.
 */
export async function programInLink(fragment: string): Promise<InLink> {
  if (!isShareFragment(fragment)) return null;
  try {
    const bytes = fromBase64url(fragment.slice(PREFIX.length));
    if (bytes.length === 0) return { kind: 'broken' };
    const unpacked = await decompressed(bytes);
    if (!unpacked) return { kind: 'tooLarge' };
    return { kind: 'program', code: new TextDecoder('utf-8', { fatal: true }).decode(unpacked).replace(/\r\n?/g, '\n') };
  } catch {
    return { kind: 'broken' };
  }
}

/** What the editor says when a link's Program couldn't be opened, and the editor keeps what it had. */
export const unreadLinkNote = ({ kind }: UnreadLink) =>
  kind === 'tooLarge'
    ? `This link carries more than ${MOST_BYTES / 1_000_000} MB of code, far more than a program here can have, so it wasn’t opened.`
    : 'This link’s program couldn’t be read. Part of the link may have been lost when it was copied.';

/** What the zoom view says while the editor holds a Share link's Program, before its Run. `shows` names what it shows. */
export const waitingNote = (shows: string) =>
  `This program came from a Share link. Nothing from a link runs until you click Run, so the zoom view and the Terminal still show ${shows}.`;

/** What the editor says after Share: `copied` is whether the link went onto the clipboard. */
export const sharedNote = (copied: boolean) =>
  `${copied ? 'Copied a link to your program.' : 'Copy this link to share your program.'} Whoever opens it sees your code, and it runs only when they click Run.`;
