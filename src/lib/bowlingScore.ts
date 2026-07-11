/** 1フレーム分の投球（ピン数）。10フレーム目は最大3投。 */
export type FrameRolls = number[];

export type FrameMark = "strike" | "spare" | "open" | "incomplete";

export function emptyFrames(): FrameRolls[] {
  return Array.from({ length: 10 }, () => []);
}

export function cloneFrames(frames: FrameRolls[]): FrameRolls[] {
  return frames.map((f) => [...f]);
}

export function isStrike(frame: FrameRolls, frameIndex: number): boolean {
  if (frameIndex < 9) return frame[0] === 10;
  return frame[0] === 10;
}

export function isSpare(frame: FrameRolls, frameIndex: number): boolean {
  if (frameIndex < 9) {
    return frame.length >= 2 && frame[0] !== 10 && frame[0] + frame[1] === 10;
  }
  if (frame[0] === 10) return false;
  return frame.length >= 2 && frame[0] + frame[1] === 10;
}

/** 標準ルールでゲーム合計を計算。未完了は途中までの確定分。 */
export function scoreGameFromFrames(frames: FrameRolls[]): number | null {
  if (!frames.length) return null;
  let total = 0;

  for (let i = 0; i < 10; i++) {
    const f = frames[i] ?? [];
    if (i < 9) {
      if (f[0] === 10) {
        const bonus = nextRolls(frames, i, 2);
        if (bonus == null) return total || null;
        total += 10 + bonus;
      } else if (f.length >= 2 && f[0] + f[1] === 10) {
        const bonus = nextRolls(frames, i, 1);
        if (bonus == null) return total || null;
        total += 10 + bonus;
      } else if (f.length >= 2) {
        total += f[0] + f[1];
      } else {
        return total || null;
      }
    } else {
      if (f.length < 2) return total || null;
      if (f[0] === 10 || f[0] + f[1] === 10) {
        if (f.length < 3) return total || null;
        total += f[0] + f[1] + f[2];
      } else {
        total += f[0] + f[1];
      }
    }
  }
  return total;
}

function nextRolls(frames: FrameRolls[], frameIndex: number, count: number): number | null {
  const rolls: number[] = [];
  for (let i = frameIndex + 1; i < frames.length && rolls.length < count; i++) {
    for (const r of frames[i] ?? []) {
      rolls.push(r);
      if (rolls.length >= count) break;
    }
  }
  if (rolls.length < count) return null;
  return rolls.slice(0, count).reduce((a, b) => a + b, 0);
}

export function frameMark(frame: FrameRolls, frameIndex: number): FrameMark {
  if (frameIndex < 9) {
    if (frame[0] === 10) return "strike";
    if (frame.length < 2) return "incomplete";
    if (frame[0] + frame[1] === 10) return "spare";
    return "open";
  }
  if (!frame.length) return "incomplete";
  if (frame[0] === 10) {
    if (frame.length < 3) return "incomplete";
    return "strike";
  }
  if (frame.length < 2) return "incomplete";
  if (frame[0] + frame[1] === 10) {
    if (frame.length < 3) return "incomplete";
    return "spare";
  }
  return "open";
}

export function summarizeFrames(framesList: FrameRolls[][]): {
  strikes: number;
  spares: number;
  opens: number;
  framesCounted: number;
} {
  let strikes = 0;
  let spares = 0;
  let opens = 0;
  let framesCounted = 0;
  for (const frames of framesList) {
    for (let i = 0; i < 10; i++) {
      const mark = frameMark(frames[i] ?? [], i);
      if (mark === "incomplete") continue;
      framesCounted += 1;
      if (mark === "strike") strikes += 1;
      else if (mark === "spare") spares += 1;
      else opens += 1;
    }
  }
  return { strikes, spares, opens, framesCounted };
}

export function formatFrameDisplay(frame: FrameRolls, frameIndex: number): string {
  if (!frame.length) return "";
  if (frameIndex < 9) {
    if (frame[0] === 10) return "X";
    const a = frame[0] ?? "";
    if (frame.length < 2) return String(a);
    const b = frame[0] + frame[1] === 10 ? "/" : frame[1] === 0 ? "-" : String(frame[1]);
    return `${a === 0 ? "-" : a}${b}`;
  }
  const parts: string[] = [];
  for (let i = 0; i < frame.length; i++) {
    const r = frame[i];
    if (r === 10) parts.push("X");
    else if (i > 0 && frame[i - 1] !== 10 && frame[i - 1] + r === 10) parts.push("/");
    else if (r === 0) parts.push("-");
    else parts.push(String(r));
  }
  return parts.join("");
}

/** 入力文字列をピン数に変換。X=10, /=残り, -=0 */
export function parseRollInput(
  raw: string,
  previousInFrame: number | null,
): number | null {
  const t = raw.trim().toUpperCase();
  if (!t) return null;
  if (t === "X") return 10;
  if (t === "-") return 0;
  if (t === "/") {
    if (previousInFrame == null || previousInFrame >= 10) return null;
    return 10 - previousInFrame;
  }
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0 || n > 10) return null;
  return n;
}

export function maxSecondRoll(first: number): number {
  return first >= 10 ? 10 : 10 - first;
}
