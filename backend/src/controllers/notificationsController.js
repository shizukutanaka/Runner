// 通知コントローラ（ダミー実装）
exports.getNotifications = (req, res) => {
  res.json([
    { id: 1, message: 'AIモデレーション警告', read: false },
    { id: 2, message: '新しいユーザーが参加しました', read: true },
  ]);
};
exports.createNotification = (req, res) => {
  res.status(201).json({ id: 3, ...req.body });
};
