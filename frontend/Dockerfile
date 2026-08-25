# フロントエンド（Vite + React）を静的ビルドし、nginxで配信するイメージ。
#
# 過去の版にあった致命的な問題:
#  - nginx設定をRUN内のヒアドキュメントで生成していた（BuildKitのヒアドキュメント
#    サポート前提かつレビュー不能）。設定は nginx.conf として外出しした。
#  - `USER nginxuser` を指定した上でポート80をlistenしていた。非rootは1024未満の
#    ポートをbindできないため、コンテナは起動直後に必ず落ちる。公式nginxイメージは
#    masterのみroot、ワーカーは自動でnginxユーザーに降格する設計なので、
#    ここではその既定の挙動に従う。
#  - VITE_API_URL / VITE_WS_URL をARGで受けていたが、アプリが実際に読むのは
#    VITE_API_BASE_URL / VITE_SOCKET_URL であり、どちらも未定義のままだった。
#    現在は同一オリジン（nginxが/apiと/socket.ioをbackendへプロキシ）を前提とするため、
#    ビルド時にURLを埋め込む必要そのものが無い。

FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./

# --ignore-scripts は付けない: esbuild などがpostinstallでネイティブバイナリを
# 配置するため、省略するとvite buildが失敗する
RUN npm ci && npm cache clean --force

COPY . .

ENV NODE_ENV=production
RUN npm run build

FROM nginx:1.25-alpine AS production

RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/app.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:80/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
