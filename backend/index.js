// シンプルなExpressサーバー初期実装
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ヘルスチェック
app.get('/', (req, res) => {
  res.send('YouTube & Twitch Comment Manager Backend is running.');
});

// 今後: YouTube/Twitchコメント取得・AIモデレーションAPIルートを追加予定

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
