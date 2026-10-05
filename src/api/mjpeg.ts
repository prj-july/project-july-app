// june-local's live camera stream, GET /media/stream.mjpg (golocal/rest.go,
// serveMJPEG): multipart/x-mixed-replace, one part per new JPEG, written as
//
//   --frame\r\nContent-Type: image/jpeg\r\nContent-Length: N\r\n\r\n<N bytes>\r\n
//
// Neither image library under expo-image plays MJPEG, so the app reads the
// stream with fetch (expo/fetch streams response bodies on iOS and Android)
// and shows each JPEG as it arrives. An open stream also counts as a viewer:
// june-local keeps the camera (and the interior light) on while it is open and
// lets them lapse about 15 s after it closes.

const enc = new TextEncoder();
const dec = new TextDecoder();
const HEADER_END = enc.encode('\r\n\r\n');
const MAX_BUFFER = 12 << 20; // june-local refuses frames over 10 MiB

function indexOf(hay: Uint8Array, needle: Uint8Array, from = 0): number {
  const last = hay.length - needle.length;
  outer: for (let i = from; i <= last; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/** The boundary named in a multipart Content-Type, without the leading dashes. */
export function boundaryOf(contentType: string | null): string | null {
  const m = contentType?.match(/^\s*multipart\/x-mixed-replace\s*;.*?boundary="?([^";]+)"?/i);
  return m ? m[1].replace(/^--/, '') : null;
}

/** Splits a multipart/x-mixed-replace byte stream into its JPEG parts. */
export class MjpegParser {
  private buf = new Uint8Array(0);
  private need: number | null = null; // body bytes still to read for the current part
  private inBody = false;
  private readonly marker: Uint8Array;
  private readonly tail: Uint8Array;

  constructor(boundary: string) {
    this.marker = enc.encode(`--${boundary}`);
    this.tail = enc.encode(`\r\n--${boundary}`);
  }

  push(chunk: Uint8Array): Uint8Array[] {
    const joined = new Uint8Array(this.buf.length + chunk.length);
    joined.set(this.buf);
    joined.set(chunk, this.buf.length);
    this.buf = joined;
    const frames: Uint8Array[] = [];
    for (;;) {
      if (!this.inBody) {
        const start = indexOf(this.buf, this.marker);
        if (start < 0) break;
        const end = indexOf(this.buf, HEADER_END, start + this.marker.length);
        if (end < 0) break;
        const headers = dec.decode(this.buf.subarray(start + this.marker.length, end));
        const len = headers.match(/content-length:\s*(\d+)/i);
        this.need = len ? Number(len[1]) : null;
        this.buf = this.buf.slice(end + HEADER_END.length);
        this.inBody = true;
      }
      if (this.need !== null) {
        if (this.buf.length < this.need) break;
        frames.push(this.buf.slice(0, this.need));
        this.buf = this.buf.slice(this.need);
      } else {
        // No Content-Length: the part runs up to the next boundary.
        const next = indexOf(this.buf, this.tail);
        if (next < 0) break;
        frames.push(this.buf.slice(0, next));
        this.buf = this.buf.slice(next + 2);
      }
      this.inBody = false;
      this.need = null;
    }
    if (this.buf.length > MAX_BUFFER) {
      // Lost sync (or a broken server): drop what we have and wait for the next boundary.
      this.buf = new Uint8Array(0);
      this.inBody = false;
      this.need = null;
    }
    return frames.filter((f) => f.length >= 2 && f[0] === 0xff && f[1] === 0xd8);
  }
}

export class NotAStreamError extends Error {}

/**
 * Read an MJPEG stream until it ends or `signal` aborts, calling `onFrame` with
 * each JPEG. Resolves when the server closes the stream; rejects on network
 * errors, on an abort, and with NotAStreamError when the URL answers with
 * something other than a stream (an older june-local without /media/stream.mjpg).
 */
export async function readMjpeg(
  url: string,
  opts: { headers?: Record<string, string>; signal: AbortSignal; onFrame: (jpeg: Uint8Array) => void },
): Promise<void> {
  const res = await fetch(url, { headers: opts.headers, signal: opts.signal });
  const boundary = boundaryOf(res.headers.get('content-type'));
  if (!res.ok || !boundary || !res.body) {
    res.body?.cancel().catch(() => {});
    throw new NotAStreamError(`No camera stream (HTTP ${res.status})`);
  }
  const parser = new MjpegParser(boundary);
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      for (const frame of parser.push(value)) opts.onFrame(frame);
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}
