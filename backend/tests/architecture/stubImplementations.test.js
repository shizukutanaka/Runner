// 「成功を返すが、何もしていない」実装を機械的に検出する。
//
// ---------------------------------------------------------------------------
// なぜ必要か
// ---------------------------------------------------------------------------
// E-29 は「呼ばれるか」、E-30 は「落ちないか」、E-31 は「画面が受け取るか」を
// 問うた。その次の問いが **「200 を返しているが、実際に何かしたのか？」** である。
//
// E-32 で見つかった実例:
//
//   PUT /api/moderation/settings  → moderationController.updateSettings
//     → moderationService.updateSettings の本体は
//
//         // DBに保存する処理（省略）
//         return true;
//
//   これだけである。admin が閾値や禁止語を送ると 200 と "Settings updated" が
//   返るが、**何一つ保存されていない**。モデレーション製品において
//   「設定したつもりで効いていない」は最も高くつく種類の嘘である。
//   ルートも Joi スキーマもテストも揃っていたため、どの既存ガードも通過していた。
//
// ---------------------------------------------------------------------------
// 規則
// ---------------------------------------------------------------------------
// **src の公開エクスポート関数は、本体が「定数を返すだけ」であってはならない。**
//
// 定数を返すだけの公開関数は、呼び出し側から見て「実装済み」と区別がつかない。
// 本当に定数でよいもの（設定値を返すアクセサ等）は ALLOWED に理由つきで
// 明記すること。明記させること自体が目的である——嘘を暗黙にせず、
// 誰かが必ず一度は「これは本当に何もしなくてよいのか」を判断する。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SCAN_DIRS = ['src/services', 'src/controllers'];

// 定数を返すだけでよいと判断済みのもの。形式: 'ファイル::関数名' => 理由
const ALLOWED = {
  // 現在は無し。追加するときは必ず理由を書くこと。
};

const collect = (dir, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') collect(p, acc);
    } else if (entry.name.endsWith('.js')) {
      acc.push(p);
    }
  }
  return acc;
};

// 文字列・テンプレートリテラルを跨がずに対応する '}' を探す
const matchBrace = (src, open) => {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
};

// exports.name = (...) => { ... }  /  exports.name = async function (...) { ... }
const exportedFunctionBodies = (src) => {
  const found = [];
  const decl = /exports\.([A-Za-z0-9_]+)\s*=\s*(?:async\s+)?(?:function\s*)?(?:\([^)]*\)|[A-Za-z0-9_]+)\s*(?:=>\s*)?\{/g;
  let m;
  while ((m = decl.exec(src))) {
    const open = src.indexOf('{', m.index + m[0].length - 1);
    if (open === -1) continue;
    const close = matchBrace(src, open);
    if (close === -1) continue;
    found.push({ name: m[1], body: src.slice(open + 1, close) });
  }
  return found;
};

// コメントを落として実行される行だけを残す
const executableLines = (body) =>
  body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

const CONSTANT_RETURN = /^return\s+(true|false|null|undefined|\{\s*\}|\[\s*\]|-?\d+(\.\d+)?|'[^']*'|"[^"]*")\s*;?$/;

describe('公開エクスポートに「定数を返すだけ」の実装が無いこと', () => {
  const files = SCAN_DIRS.flatMap((d) => collect(path.join(ROOT, d)));

  test('走査対象のファイルが存在する（ガードが空振りしていないこと）', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  test('定数を返すだけの公開関数は ALLOWED に理由つきで登録されていること', () => {
    const offenders = [];

    for (const file of files) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      const src = fs.readFileSync(file, 'utf8');

      for (const { name, body } of exportedFunctionBodies(src)) {
        const lines = executableLines(body);
        // 本体が実質1文で、それが定数 return のもの
        if (lines.length > 2) continue;
        if (!lines.some((l) => CONSTANT_RETURN.test(l))) continue;

        const key = `${rel}::${name}`;
        if (ALLOWED[key]) continue;
        offenders.push(`${key}  ->  ${lines.join(' | ')}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
