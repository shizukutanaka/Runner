# バックエンドAPIのイメージ。
#
# 過去の版は起動不能だった:
#  - ビルドを node:18-alpine（musl）で行い、実行を
#    gcr.io/distroless/nodejs18-debian11（glibc）で行っていた。sqlite3 の
#    ネイティブバイナリはmusl向けにコンパイルされるためglibcでは読み込めない。
#  - しかもproduction依存のインストールが `npm ci --only=production --ignore-scripts`
#    だったため、sqlite3のinstallスクリプトごと止まり、そもそもネイティブバイナリが
#    生成されていなかった。
#  - distroless には node が PATH に無いため、docker-composeの
#    `CMD node -e ...` ヘルスチェックは永久にunhealthyを返す。
# 単一ランタイム（node:18-alpine）に統一してこれらをまとめて解消している。

FROM node:18-alpine AS deps

# sqlite3 のネイティブビルドに必要
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev && npm cache clean --force

FROM node:18-alpine AS production

ENV NODE_ENV=production
ENV PORT=4000

WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node src ./src

# アプリが書き込むディレクトリ。ボリュームを当てない場合でも起動できるよう
# イメージ側で node ユーザー所有として用意しておく
RUN mkdir -p /app/data /app/logs /app/backups \
    && chown -R node:node /app/data /app/logs /app/backups

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||4000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]
