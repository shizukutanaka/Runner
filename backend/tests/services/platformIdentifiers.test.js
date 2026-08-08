// R-20: モデレーション判断をプラットフォームへ書き戻す（YouTubeの
// liveChatMessages.delete / liveChatBans.insert）には、対象メッセージIDと
// 著者チャンネルIDが必須。従来は取込時に捨てていたため書き戻しが構造的に
// 不可能だった。その永続化の回帰テスト。
const db = require('../../src/db');
const commentsController = require('../../src/controllers/commentsController');

const dbGet = (sql, p = []) => new Promise((resolve, reject) => {
  db.get(sql, p, (e, row) => (e ? reject(e) : resolve(row)));
});

describe('プラットフォーム識別子の永続化（R-20・書き戻しの前提）', () => {
  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 1000)); // スキーマ初期化待ち
  });

  it('取込経路が渡したメッセージID/著者チャンネルIDをcommentsに保存する', async () => {
    const user = `ytid_${Date.now()}`;
    const messageId = 'LCC.TestMessageId_abc123';
    const channelId = 'UCTestAuthorChannel_xyz789';

    await commentsController.ingestComment({
      content: '配信たのしい',
      user,
      platform: 'youtube',
      timestamp: new Date().toISOString(),
      platformMessageId: messageId,
      authorChannelId: channelId
    }, {});

    const row = await dbGet(
      'SELECT platform_message_id, author_channel_id FROM comments WHERE user = ? ORDER BY rowid DESC LIMIT 1',
      [user]
    );
    expect(row).toBeDefined();
    expect(row.platform_message_id).toBe(messageId);
    expect(row.author_channel_id).toBe(channelId);
  });

  it('識別子を持たない経路（HTTP投稿など）でもNULLで保存され壊れない', async () => {
    const user = `noid_${Date.now()}`;
    await commentsController.ingestComment({
      content: 'ありがとう',
      user,
      platform: 'youtube',
      timestamp: new Date().toISOString()
    }, {});

    const row = await dbGet(
      'SELECT platform_message_id, author_channel_id FROM comments WHERE user = ? ORDER BY rowid DESC LIMIT 1',
      [user]
    );
    expect(row).toBeDefined();
    expect(row.platform_message_id).toBeNull();
    expect(row.author_channel_id).toBeNull();
  });
});
