#!/bin/sh
set -e

# D-7以降、認証Cookieには `Secure` 属性が付く。平文HTTPではブラウザがCookieを
# 保存しないため、**HTTPSが無いとログインが成立しない**。
# そこでこのコンテナ自身がTLSを終端する。
#
# 証明書が用意されていなければ自己署名証明書を生成する。目的は
# 「何も設定しなくても起動して動作確認できる」ことであって、
# 自己署名で本番運用してよいという意味ではない。
# 本番では ./certs に実際の証明書を置いて差し替えること
# （docker-compose.yml が /etc/nginx/certs にマウントする）。

CERT_DIR=/etc/nginx/certs
CERT="$CERT_DIR/fullchain.pem"
KEY="$CERT_DIR/privkey.pem"

mkdir -p "$CERT_DIR"

if [ ! -s "$CERT" ] || [ ! -s "$KEY" ]; then
    echo "[entrypoint] TLS証明書が見つかりません。自己署名証明書を生成します。"
    echo "[entrypoint] 本番では ./certs に fullchain.pem / privkey.pem を配置してください。"
    openssl req -x509 -nodes -newkey rsa:2048 \
        -keyout "$KEY" -out "$CERT" \
        -days 825 \
        -subj "/CN=${TLS_COMMON_NAME:-localhost}" \
        -addext "subjectAltName=DNS:${TLS_COMMON_NAME:-localhost},DNS:localhost,IP:127.0.0.1" \
        2>/dev/null
    chmod 600 "$KEY"
else
    echo "[entrypoint] 既存のTLS証明書を使用します: $CERT"
fi

exec "$@"
