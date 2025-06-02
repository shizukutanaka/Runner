// 各種UIテーマ・レイアウト・アクセシビリティ・フォント・拡大縮小・通知バッジ・ヘルプ・言語・カスタムCSS設定用API呼び出し関数群

export async function saveLayout(layout) {
  // API例: /api/ui/layout
  return fetch('/api/ui/layout', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ layout }),
  }).then(r => r.json());
}

export async function setColorPattern(colors) {
  return fetch('/api/ui/colors', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ colors }),
  }).then(r => r.json());
}

export async function setAccessibility(options) {
  return fetch('/api/ui/accessibility', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  }).then(r => r.json());
}

export async function setFont(font) {
  return fetch('/api/ui/font', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ font }),
  }).then(r => r.json());
}

export async function setZoom(zoom) {
  return fetch('/api/ui/zoom', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zoom }),
  }).then(r => r.json());
}

export async function setAutoDarkMode(enabled) {
  return fetch('/api/ui/auto-dark', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  }).then(r => r.json());
}

export async function setBadge(badge) {
  return fetch('/api/ui/badge', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ badge }),
  }).then(r => r.json());
}

export async function setHelp(help) {
  return fetch('/api/ui/help', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ help }),
  }).then(r => r.json());
}

export async function setLanguage(language) {
  return fetch('/api/ui/language', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language }),
  }).then(r => r.json());
}

export async function setCustomCss(css) {
  return fetch('/api/ui/custom-css', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ css }),
  }).then(r => r.json());
}
