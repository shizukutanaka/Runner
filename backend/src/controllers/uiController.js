// UIテーマ・レイアウト・アクセシビリティ・フォント・拡大縮小・通知バッジ・ヘルプ・言語・カスタムCSS用ダミーAPI群

exports.saveLayout = (req, res) => {
  res.json({ success: true, layout: req.body.layout });
};

exports.setColorPattern = (req, res) => {
  res.json({ success: true, colors: req.body.colors });
};

exports.setAccessibility = (req, res) => {
  res.json({ success: true, accessibility: req.body });
};

exports.setFont = (req, res) => {
  res.json({ success: true, font: req.body.font });
};

exports.setZoom = (req, res) => {
  res.json({ success: true, zoom: req.body.zoom });
};

exports.setAutoDarkMode = (req, res) => {
  res.json({ success: true, enabled: req.body.enabled });
};

exports.setBadge = (req, res) => {
  res.json({ success: true, badge: req.body.badge });
};

exports.setHelp = (req, res) => {
  res.json({ success: true, help: req.body.help });
};

exports.setLanguage = (req, res) => {
  res.json({ success: true, language: req.body.language });
};

exports.setCustomCss = (req, res) => {
  res.json({ success: true, css: req.body.css });
};
