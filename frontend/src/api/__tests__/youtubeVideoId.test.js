import { describe, it, expect } from 'vitest';
import { extractYouTubeVideoId } from '../youtube';

// 利用者が貼るのは動画IDではなくブラウザのURLである。
// バックエンドは11文字の動画IDしか受け取らない（Joi max 50）ので、ここで必ず変換する
describe('extractYouTubeVideoId', () => {
  it.each([
    ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['  dQw4w9WgXcQ  ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=42', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ?feature=share', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://studio.youtube.com/video/dQw4w9WgXcQ/livestreaming', 'dQw4w9WgXcQ'],
  ])('%s → %s', (input, expected) => {
    expect(extractYouTubeVideoId(input)).toBe(expected);
  });

  it.each([
    [''],
    [null],
    ['dQw4w9WgXc'],
    ['https://example.com/watch?v=dQw4w9WgXcQ'],
    ['https://www.youtube.com/@channel/live'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ"><script>'],
  ])('取り出せない入力は null: %s', (input) => {
    expect(extractYouTubeVideoId(input)).toBeNull();
  });
});
