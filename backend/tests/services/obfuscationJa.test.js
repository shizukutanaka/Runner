// 区切り文字の挿入・異体字セレクタ・結合文字による回避を検知し、
// 同じ字面を含む通常の日本語は落とさないこと（E-55）。
//
// 難読化（文字の挿入・置換）は毒性検知を大きく劣化させるという研究
// （Korean obfuscation rules, 2025 ほか）どおり、従来の正規化は NFKC と
// ゼロ幅文字除去だけで「死 ね」「し.ね」「死*ね」のような見える区切りに無防備だった。
// 一方で「わし、ねむい」のように区切りを跨いで偶然つながる通常文は絶対に落とせない。
// そのため区切りありの照合は、語の全文字の間に区切りがあり、前後が孤立している場合に限る。
const moderationService = require('../../src/services/moderationService');

const flagged = async (text) => {
  const r = await moderationService.analyzeComment(text, 'youtube', 'u', new Date().toISOString());
  return (r.flaggedWords || []).length > 0;
};

describe('日本語の難読化（E-55）', () => {
  it.each([
    ['空白', '死 ね'],
    ['全角空白', '死　ね'],
    ['ドット', 'し.ね'],
    ['アスタリスク', '死*ね'],
    ['中黒', 'し・ね'],
    ['アンダースコア', 'し_ね'],
    ['複数の区切り', 'し . ね'],
    ['文中', 'お前 死 ね よ'],
    ['異体字セレクタ', '死️ね'],
    ['結合文字', '死́ね'],
    ['ソフトハイフン', '死­ね'],
    ['双方向制御文字', '死‮ね'],
    ['3文字の語', 'ぶ っ 殺 す']
  ])('暴言を検知する: %s', async (_label, text) => {
    expect(await flagged(text)).toBe(true);
  });

  it.each([
    ['区切りを跨いでつながる通常文', 'わし、ねむい'],
    ['読点を挟む通常文', 'これはいいし、ねこもかわいい'],
    ['空白を挟む通常文', 'たぶんわし ねむいよ'],
    ['可能形', 'やっと死 ねる'],
    ['外来語', 'シネマ 見に行こう'],
    ['無関係な英文', 'this is a test message'],
    ['普通の挨拶', 'こんにちは、配信たのしいです']
  ])('通常の日本語は落とさない: %s', async (_label, text) => {
    expect(await flagged(text)).toBe(false);
  });
});
