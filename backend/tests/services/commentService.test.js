// コメントサービス自動テスト
const commentService = require('../../src/services/commentService');

describe('CommentService', () => {
  let testCommentId;

  const testCommentData = {
    platform: 'youtube',
    user: 'testuser',
    content: 'テストコメント本文',
    status: 'active'
  };

  describe('createComment', () => {
    it('正常系: コメント作成成功', async () => {
      const comment = await commentService.createComment(testCommentData);

      expect(comment).toBeDefined();
      expect(comment.id).toBeDefined();
      expect(comment.platform).toBe(testCommentData.platform);
      expect(comment.user).toBe(testCommentData.user);
      expect(comment.content).toBe(testCommentData.content);
      expect(comment.status).toBe(testCommentData.status || 'active');

      testCommentId = comment.id;
    });

    it('異常系: 無効なプラットフォーム', async () => {
      const invalidData = { ...testCommentData, platform: 'invalid' };

      await expect(commentService.createComment(invalidData)).rejects.toThrow('Platform must be either youtube or twitch');
    });

    it('異常系: 必須フィールド欠如', async () => {
      const invalidData = { ...testCommentData };
      delete invalidData.content;

      await expect(commentService.createComment(invalidData)).rejects.toThrow('Validation failed');
    });

    it('異常系: コンテンツが長すぎる', async () => {
      const invalidData = { ...testCommentData, content: 'a'.repeat(2001) };

      await expect(commentService.createComment(invalidData)).rejects.toThrow('Content must not exceed 2000 characters');
    });
  });

  describe('getCommentById', () => {
    it('正常系: コメント取得成功', async () => {
      const comment = await commentService.getCommentById(testCommentId);

      expect(comment).toBeDefined();
      expect(comment.id).toBe(testCommentId);
      expect(comment.platform).toBe(testCommentData.platform);
      expect(comment.user).toBe(testCommentData.user);
    });

    it('異常系: 存在しないコメントID', async () => {
      await expect(commentService.getCommentById('nonexistent-id')).rejects.toThrow('Comment not found');
    });
  });

  describe('getComments', () => {
    it('正常系: フィルターなしで全コメント取得', async () => {
      const comments = await commentService.getComments();

      expect(Array.isArray(comments)).toBe(true);
      expect(comments.length).toBeGreaterThan(0);
      expect(comments[0]).toHaveProperty('id');
      expect(comments[0]).toHaveProperty('platform');
      expect(comments[0]).toHaveProperty('user');
      expect(comments[0]).toHaveProperty('content');
    });

    it('正常系: プラットフォームフィルター', async () => {
      const comments = await commentService.getComments({ platform: 'youtube' });

      expect(Array.isArray(comments)).toBe(true);
      comments.forEach(comment => {
        expect(comment.platform).toBe('youtube');
      });
    });

    it('正常系: ステータスフィルター', async () => {
      const comments = await commentService.getComments({ status: 'active' });

      expect(Array.isArray(comments)).toBe(true);
      comments.forEach(comment => {
        expect(comment.status).toBe('active');
      });
    });

    it('正常系: リミット指定', async () => {
      const comments = await commentService.getComments({ limit: 5 });

      expect(Array.isArray(comments)).toBe(true);
      expect(comments.length).toBeLessThanOrEqual(5);
    });
  });

  describe('updateComment', () => {
    it('正常系: コメント内容更新', async () => {
      const updateData = {
        content: '更新されたコメント内容',
        editorId: 'test-editor'
      };

      const updatedComment = await commentService.updateComment(testCommentId, updateData);

      expect(updatedComment.content).toBe(updateData.content);
      expect(updatedComment.id).toBe(testCommentId);
    });

    it('正常系: コメントプロパティ更新', async () => {
      const updateData = {
        highlight: true,
        backgroundColor: '#ff0000'
      };

      const updatedComment = await commentService.updateComment(testCommentId, updateData);

      expect(updatedComment.highlight).toBe(true);
      expect(updatedComment.backgroundColor).toBe(updateData.backgroundColor);
    });

    it('異常系: 存在しないコメント更新', async () => {
      const updateData = { content: '更新内容' };

      await expect(commentService.updateComment('nonexistent-id', updateData)).rejects.toThrow('Comment not found');
    });

    it('正常系: 編集履歴記録', async () => {
      const originalComment = await commentService.getCommentById(testCommentId);
      const originalContent = originalComment.content;

      const updateData = {
        content: 'さらに編集された内容',
        editorId: 'test-editor-2'
      };

      await commentService.updateComment(testCommentId, updateData);

      const history = await commentService.getCommentEditHistory(testCommentId);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].previous_content).toBe(originalContent);
      expect(history[0].editor_id).toBe(updateData.editorId);
    });
  });

  describe('setCommentProperty', () => {
    it('正常系: アバターURL設定', async () => {
      const avatarUrl = 'https://example.com/avatar.jpg';

      const updatedComment = await commentService.setCommentProperty(testCommentId, 'avatarUrl', avatarUrl);

      expect(updatedComment.avatarUrl).toBe(avatarUrl);
    });

    it('正常系: ハイライト設定', async () => {
      const updatedComment = await commentService.setCommentProperty(testCommentId, 'highlight', true);

      expect(updatedComment.highlight).toBe(true);
    });

    it('異常系: 無効なプロパティ', async () => {
      await expect(commentService.setCommentProperty(testCommentId, 'invalidProperty', 'value')).rejects.toThrow('Invalid property');
    });
  });

  describe('deleteComment', () => {
    it('正常系: コメント削除成功', async () => {
      const comment = await commentService.createComment({
        ...testCommentData,
        content: '削除テスト用コメント'
      });

      await commentService.deleteComment(comment.id);

      await expect(commentService.getCommentById(comment.id)).rejects.toThrow('Comment not found');
    });

    it('異常系: 存在しないコメント削除', async () => {
      await expect(commentService.deleteComment('nonexistent-id')).rejects.toThrow('Comment not found');
    });
  });

  describe('summarizeComments', () => {
    beforeAll(async () => {
      // テストデータを追加して統計をテスト
      await commentService.createComment({
        ...testCommentData,
        platform: 'twitch',
        content: 'Twitchテストコメント1'
      });

      await commentService.createComment({
        ...testCommentData,
        platform: 'twitch',
        content: 'Twitchテストコメント2',
        status: 'moderated'
      });

      await commentService.createComment({
        ...testCommentData,
        platform: 'youtube',
        content: 'YouTubeテストコメント2',
        status: 'hidden'
      });
    });

    it('正常系: 全体統計取得', async () => {
      const summary = await commentService.summarizeComments();

      expect(summary).toHaveProperty('total');
      expect(summary).toHaveProperty('byPlatform');
      expect(summary).toHaveProperty('byStatus');
      expect(summary.total).toBeGreaterThan(0);
      expect(Object.keys(summary.byPlatform).length).toBeGreaterThan(0);
      expect(Object.keys(summary.byStatus).length).toBeGreaterThan(0);
    });

    it('正常系: プラットフォーム別統計', async () => {
      const summary = await commentService.summarizeComments({ platform: 'youtube' });

      expect(summary.byPlatform.youtube).toBeDefined();
      expect(summary.byPlatform.youtube).toBeGreaterThan(0);
    });

    it('正常系: 日付範囲別統計', async () => {
      const dateFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 1日前
      const summary = await commentService.summarizeComments({ dateFrom });

      expect(summary.total).toBeGreaterThan(0);
    });
  });

  describe('getCommentEditHistory', () => {
    it('正常系: 編集履歴取得', async () => {
      const history = await commentService.getCommentEditHistory(testCommentId);

      expect(Array.isArray(history)).toBe(true);
      if (history.length > 0) {
        expect(history[0]).toHaveProperty('comment_id');
        expect(history[0]).toHaveProperty('previous_content');
        expect(history[0]).toHaveProperty('edited_at');
        expect(history[0]).toHaveProperty('editor_id');
      }
    });

    it('正常系: 編集履歴なしコメント', async () => {
      const newComment = await commentService.createComment({
        ...testCommentData,
        content: '編集履歴なしコメント'
      });

      const history = await commentService.getCommentEditHistory(newComment.id);

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(0);
    });
  });

  describe('autoAnswer', () => {
    it('正常系: 使い方クエリに対する回答生成', async () => {
      const result = await commentService.autoAnswer('システムの使い方を教えて');

      expect(result).toHaveProperty('answer');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('contextUsed');
      expect(typeof result.answer).toBe('string');
      expect(typeof result.confidence).toBe('number');
      expect(typeof result.contextUsed).toBe('number');
    });

    it('正常系: コメントクエリに対する回答生成', async () => {
      const result = await commentService.autoAnswer('コメントの投稿方法は？');

      expect(result.answer).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('正常系: BAN関連クエリに対する回答生成', async () => {
      const result = await commentService.autoAnswer('ユーザーをBANする方法は？');

      expect(result.answer).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0.5); // BAN関連は高確率でマッチするはず
    });

    it('正常系: マッチしないクエリに対する回答生成', async () => {
      const result = await commentService.autoAnswer('宇宙の真理について教えて');

      expect(result.answer).toBeDefined();
      expect(result.confidence).toBeLessThan(0.5); // マッチしない場合は低確率
    });
  });

  describe('validateCommentData', () => {
    it('正常系: 有効なデータ検証通過', () => {
      const errors = commentService.validateCommentData(testCommentData);

      expect(Array.isArray(errors)).toBe(true);
      expect(errors.length).toBe(0);
    });

    it('異常系: プラットフォーム検証エラー', () => {
      const invalidData = { ...testCommentData, platform: '' };

      const errors = commentService.validateCommentData(invalidData);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(error => error.includes('Platform'))).toBe(true);
    });

    it('異常系: ユーザ検証エラー', () => {
      const invalidData = { ...testCommentData, user: '' };

      const errors = commentService.validateCommentData(invalidData);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(error => error.includes('User'))).toBe(true);
    });

    it('異常系: コンテンツ検証エラー', () => {
      const invalidData = { ...testCommentData, content: '' };

      const errors = commentService.validateCommentData(invalidData);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(error => error.includes('Content'))).toBe(true);
    });

    it('異常系: 無効なプラットフォーム値', () => {
      const invalidData = { ...testCommentData, platform: 'discord' };

      const errors = commentService.validateCommentData(invalidData);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(error => error.includes('Platform must be either youtube or twitch'))).toBe(true);
    });
  });
});
