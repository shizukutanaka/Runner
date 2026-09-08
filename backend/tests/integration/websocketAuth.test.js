// WebSocketの `authenticate` / `sendNotification` / `moderationAction` に
// 身元確認が無かった欠陥を検査する（E-47）。
//
// ---------------------------------------------------------------------------
// なぜ必要か
// ---------------------------------------------------------------------------
// REST APIには `authenticateToken` / `requireRole` があるが、
// WebSocket層（`ws.js`）には**接続自体を検証する仕組みが一切無かった**。
//
//   1. `authenticate` イベントはクライアントが自己申告する `data.userId` を
//      そのまま使って `socket.join(\`user:${userId}\`)` していた。
//      検証済みの身元が無いので、**任意の他人のuserIdを名乗るだけで
//      その人宛のルームに参加できた**——他ユーザー宛の通知を横取りできる
//   2. `sendNotification` イベントは認証チェックも入力検証も無く、
//      **未認証の接続からでも**任意のuserId宛（省略時は接続中の全員へ）に
//      任意の文言の「システム通知」を注入できた
//   3. `moderationAction` イベントも同様に未認証で、実際のDB操作は
//      伴わないものの「モデレーション操作が行われた」という偽の更新を
//      ダッシュボード全体へブロードキャストできた
//
// これらはいずれも、REST APIでは `requireRole('moderator')` 等で
// 塞がれている操作の**WebSocket版が素通しだった**という形の欠陥である。
//
// ---------------------------------------------------------------------------
// 修正の要点
// ---------------------------------------------------------------------------
// 接続時（`io.use()`）にCookie（本番はhttpOnly Cookie、テスト/非ブラウザ
// クライアントは `auth.token`）からJWTを読み、REST APIと同じ`verifyToken`で
// 検証して `socket.user` に載せる。`authenticate` は `socket.user.id` を
// 使い、クライアントの自己申告は無視する。`sendNotification` /
// `moderationAction` は `socket.user.role` がmoderator以上でなければ拒否する。
const http = require('http');
const { io: ioClient } = require('socket.io-client');
const setupWebSocket = require('../../src/ws');
const { generateToken } = require('../../src/middleware/auth');

const asToken = (id, role = 'moderator') => generateToken({ id, username: id, role });

describe('WebSocketの認証・認可（E-47）', () => {
  let httpServer;
  let baseUrl;

  const connect = (auth) => new Promise((resolve, reject) => {
    const client = ioClient(baseUrl, {
      transports: ['websocket'],
      auth,
      forceNew: true,
      reconnection: false
    });
    client.on('connect', () => resolve(client));
    client.on('connect_error', reject);
  });

  const waitForEvent = (client, event, timeoutMs = 1500) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    client.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

  // `client`が`event`を受け取ったかどうかを、**アクションを起こす前から**
  // 記録し続ける収集器を返す。後から `.once()` で待つ形だと、複数の
  // クライアントへほぼ同時に届くイベントの一方を先にawaitしている間に
  // もう一方が（リスナー登録前に）届いて消費されずに落ちる競合が起きる
  // （実際にこれで「攻撃者も受け取っているのに、テストが誤ってpassする」
  // という欠陥をこのテスト自体で踏んだ）。届く可能性のある全クライアントに
  // 先にリスナーを付けてから、初めてアクションを起こすこと
  const collectEvents = (client, event) => {
    const received = [];
    client.on(event, (payload) => received.push(payload));
    return received;
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  beforeAll(async () => {
    const app = { set: () => {}, get: () => undefined };
    httpServer = http.createServer();
    await setupWebSocket(httpServer, app);
    await new Promise((resolve) => httpServer.listen(0, resolve));
    const { port } = httpServer.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => httpServer.close(resolve));
  });

  test('自己申告のuserIdでは、その人のroomに参加できない（本人確認したidだけが通る）', async () => {
    const attacker = await connect({ token: asToken('attacker-user') });
    const victimListener = await connect({ token: asToken('victim-user') });

    // victim-user 宛の通知が届くかどうかを、**アクションを起こす前から**両方に
    // 仕掛けておく（後から個別にawaitすると、片方を待っている間にもう片方の
    // イベントがリスナー登録前に届いて消費されずに落ちる競合が起きるため）
    const attackerNotifications = collectEvents(attacker, 'notification');
    const victimNotifications = collectEvents(victimListener, 'notification');

    // attacker は自分のトークン（id=attacker-user）で認証しつつ、
    // わざと他人（victim-user）を名乗る
    attacker.emit('authenticate', { userId: 'victim-user' });
    await waitForEvent(attacker, 'authenticated');

    victimListener.emit('authenticate', { userId: 'victim-user' });
    await waitForEvent(victimListener, 'authenticated');

    // victim-user 宛の通知を、正規の資格を持つ第三者から送る
    const sender = await connect({ token: asToken('sender-mod', 'moderator') });
    sender.emit('sendNotification', { userId: 'victim-user', title: 't', message: 'm' });

    await wait(600);

    // 本物の victim-user は受け取るが、victim-user を名乗っただけの attacker は
    // 実際には attacker-user の room にしかいないので受け取れないはず
    expect(victimNotifications).toHaveLength(1);
    expect(attackerNotifications).toHaveLength(0);

    attacker.close();
    victimListener.close();
    sender.close();
  });

  test('認証していない接続からの authenticate は拒否される', async () => {
    const anon = await connect({}); // トークン無し
    anon.emit('authenticate', { userId: 'someone' });
    const err = await waitForEvent(anon, 'error');
    expect(err.type).toBe('auth');
    anon.close();
  });

  test('未認証の接続からは sendNotification で他人に通知を注入できない', async () => {
    const victim = await connect({ token: asToken('victim-2') });
    const victimNotifications = collectEvents(victim, 'notification');
    victim.emit('authenticate', { userId: 'victim-2' });
    await waitForEvent(victim, 'authenticated');

    const anon = await connect({}); // トークン無し
    anon.emit('sendNotification', { userId: 'victim-2', title: 'phish', message: 'click me' });

    const err = await waitForEvent(anon, 'error');
    expect(err.type).toBe('auth');
    await wait(500);
    expect(victimNotifications).toHaveLength(0);

    victim.close();
    anon.close();
  });

  test('moderator未満の役割からは sendNotification / moderationAction が拒否される', async () => {
    const lowPriv = await connect({ token: asToken('user-only', 'user') });
    lowPriv.emit('sendNotification', { title: 't', message: 'm' });
    const err1 = await waitForEvent(lowPriv, 'error');
    expect(err1.type).toBe('auth');

    lowPriv.emit('moderationAction', { action: 'hide', commentId: 'c1', moderatorId: 'user-only' });
    const err2 = await waitForEvent(lowPriv, 'error');
    expect(err2.type).toBe('auth');

    lowPriv.close();
  });

  test('moderator以上なら sendNotification / moderationAction が通る（締めすぎ防止）', async () => {
    const mod = await connect({ token: asToken('mod-ok', 'moderator') });
    const dashboardListener = await connect({ token: asToken('dash-viewer', 'moderator') });
    dashboardListener.emit('joinDashboard', 'default');
    await waitForEvent(dashboardListener, 'statsUpdate');

    mod.emit('sendNotification', { title: 'ok', message: 'this should broadcast' });
    await expect(waitForEvent(dashboardListener, 'notification')).resolves.toBeDefined();

    mod.emit('moderationAction', { action: 'hide', commentId: 'c1', moderatorId: 'mod-ok' });
    await expect(waitForEvent(dashboardListener, 'moderationUpdate')).resolves.toBeDefined();

    mod.close();
    dashboardListener.close();
  });
});
