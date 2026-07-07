// トークンストレージ:
// 理想は httpOnly Cookie (XSS耐性) だが、それにはサーバーサイドのセッション管理が必要。
// 現状は sessionStorage を使用: タブ閉じで自動削除、localStorage より安全。
// 本番への移行時は backend の /auth/login を httpOnly Cookie を発行するよう変更すること。
export const tokenStorage = {
  get: () => sessionStorage.getItem('authToken') ?? localStorage.getItem('authToken'),
  set: (t) => { sessionStorage.setItem('authToken', t); localStorage.removeItem('authToken'); },
  remove: () => { sessionStorage.removeItem('authToken'); localStorage.removeItem('authToken'); }
};

// リフレッシュトークン専用ストレージ（アクセストークンとは別に保持し、401時の自動更新に使う）
export const refreshTokenStorage = {
  get: () => sessionStorage.getItem('refreshToken') ?? localStorage.getItem('refreshToken'),
  set: (t) => { sessionStorage.setItem('refreshToken', t); localStorage.removeItem('refreshToken'); },
  remove: () => { sessionStorage.removeItem('refreshToken'); localStorage.removeItem('refreshToken'); }
};
