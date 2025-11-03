#!/bin/bash

# YouTube & Twitch Comment Manager ベンチマークスクリプト
# 使用方法: ./benchmark.sh [オプション]

# 設定
API_BASE_URL=${API_BASE_URL:-"http://localhost:3000/api"}
CONCURRENT_USERS=${CONCURRENT_USERS:-10}
DURATION=${DURATION:-60}
COMMENTS_PER_USER=${COMMENTS_PER_USER:-100}

echo "=== YouTube & Twitch Comment Manager ベンチマーク ==="
echo "API Base URL: $API_BASE_URL"
echo "同時ユーザー数: $CONCURRENT_USERS"
echo "テスト時間: ${DURATION}秒"
echo "ユーザーあたりコメント数: $COMMENTS_PER_USER"
echo "総リクエスト数: $(($CONCURRENT_USERS * $COMMENTS_PER_USER))"
echo ""

# 結果ファイル
RESULTS_DIR="benchmark_results_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$RESULTS_DIR"

# 色付き出力関数
print_status() {
    echo -e "\033[1;34m[INFO]\033[0m $1"
}

print_success() {
    echo -e "\033[1;32m[SUCCESS]\033[0m $1"
}

print_error() {
    echo -e "\033[1;31m[ERROR]\033[0m $1"
}

print_warning() {
    echo -e "\033[1;33m[WARNING]\033[0m $1"
}

# 前提条件チェック
check_prerequisites() {
    print_status "前提条件チェック中..."

    if ! command -v curl &> /dev/null; then
        print_error "curlがインストールされていません"
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        print_error "jqがインストールされていません"
        exit 1
    fi

    if ! command -v bc &> /dev/null; then
        print_error "bcがインストールされていません"
        exit 1
    fi

    print_success "前提条件チェック完了"
}

# ヘルスチェック
health_check() {
    print_status "ヘルスチェックを実行中..."

    local response=$(curl -s -w "%{http_code}" -o /dev/null "$API_BASE_URL/health")

    if [ "$response" -eq 200 ]; then
        print_success "APIサーバーが正常に応答しています"
    else
        print_error "APIサーバーが応答しません (HTTP $response)"
        exit 1
    fi
}

# 単一リクエストの実行時間測定
measure_single_request() {
    local endpoint="$1"
    local method="${2:-GET}"
    local data="${3:-}"

    local start_time=$(date +%s%N)
    local response

    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "%{http_code}" -o /dev/null "$API_BASE_URL$endpoint")
    else
        response=$(curl -s -X "$method" -w "%{http_code}" -o /dev/null -H "Content-Type: application/json" -d "$data" "$API_BASE_URL$endpoint")
    fi

    local end_time=$(date +%s%N)
    local duration=$(( (end_time - start_time) / 1000000 )) # ミリ秒に変換

    echo "$duration,$response"
}

# コメント作成ベンチマーク
benchmark_comment_creation() {
    print_status "コメント作成ベンチマークを実行中..."

    local results_file="$RESULTS_DIR/comment_creation_results.csv"
    echo "timestamp,duration_ms,response_code" > "$results_file"

    local total_requests=0
    local successful_requests=0
    local total_duration=0

    for i in $(seq 1 $COMMENTS_PER_USER); do
        local timestamp=$(date +%s)
        local result=$(measure_single_request "/comments" "POST" '{"content":"ベンチマークテストコメント '$i'","user":"benchmark_user_'$i'","platform":"youtube"}')
        local duration=$(echo $result | cut -d',' -f1)
        local response_code=$(echo $result | cut -d',' -f2)

        echo "$timestamp,$duration,$response_code" >> "$results_file"

        total_requests=$((total_requests + 1))
        total_duration=$((total_duration + duration))

        if [ "$response_code" -eq 201 ]; then
            successful_requests=$((successful_requests + 1))
        fi

        # 進捗表示（10件ごと）
        if [ $((i % 10)) -eq 0 ]; then
            echo "  進捗: $i/$COMMENTS_PER_USER 件処理済み"
        fi
    done

    # 結果計算
    local avg_duration=$((total_duration / total_requests))
    local success_rate=$(echo "scale=2; $successful_requests * 100 / $total_requests" | bc)

    print_success "コメント作成ベンチマーク完了"
    echo "  総リクエスト数: $total_requests"
    echo "  成功数: $successful_requests"
    echo "  成功率: $success_rate%"
    echo "  平均応答時間: ${avg_duration}ms"
    echo "  結果ファイル: $results_file"
}

# コメント取得ベンチマーク
benchmark_comment_retrieval() {
    print_status "コメント取得ベンチマークを実行中..."

    local results_file="$RESULTS_DIR/comment_retrieval_results.csv"
    echo "timestamp,duration_ms,response_code,comments_count" > "$results_file"

    local total_requests=0
    local successful_requests=0
    local total_duration=0
    local total_comments=0

    for i in $(seq 1 $COMMENTS_PER_USER); do
        local timestamp=$(date +%s)
        local start_time=$(date +%s%N)

        # まずコメントを作成
        local create_response=$(curl -s -X POST -H "Content-Type: application/json" \
            -d '{"content":"取得テストコメント '$i'","user":"retrieval_user_'$i'","platform":"twitch"}' \
            "$API_BASE_URL/comments")

        local comment_id=$(echo $create_response | jq -r '.data.id')

        if [ "$comment_id" != "null" ] && [ "$comment_id" != "" ]; then
            # コメントを取得
            local get_response=$(curl -s -w "%{http_code}" -o /tmp/response_body "$API_BASE_URL/comments/$comment_id")
            local end_time=$(date +%s%N)
            local duration=$(( (end_time - start_time) / 1000000 ))

            local comments_count=$(echo $create_response | jq '.data | length' 2>/dev/null || echo "0")

            echo "$timestamp,$duration,$get_response,$comments_count" >> "$results_file"

            total_requests=$((total_requests + 1))
            total_duration=$((total_duration + duration))
            total_comments=$((total_comments + comments_count))

            if [ "$get_response" -eq 200 ]; then
                successful_requests=$((successful_requests + 1))
            fi
        fi

        # 進捗表示（10件ごと）
        if [ $((i % 10)) -eq 0 ]; then
            echo "  進捗: $i/$COMMENTS_PER_USER 件処理済み"
        fi
    done

    # 結果計算
    local avg_duration=$((total_duration / total_requests))
    local success_rate=$(echo "scale=2; $successful_requests * 100 / $total_requests" | bc)

    print_success "コメント取得ベンチマーク完了"
    echo "  総リクエスト数: $total_requests"
    echo "  成功数: $successful_requests"
    echo "  成功率: $success_rate%"
    echo "  平均応答時間: ${avg_duration}ms"
    echo "  平均コメント数: $total_comments"
    echo "  結果ファイル: $results_file"
}

# AI要約ベンチマーク
benchmark_ai_summary() {
    print_status "AI要約ベンチマークを実行中..."

    local results_file="$RESULTS_DIR/ai_summary_results.csv"
    echo "timestamp,duration_ms,response_code,summary_length" > "$results_file"

    local total_requests=0
    local successful_requests=0
    local total_duration=0

    # テスト用のコメントデータを準備
    local test_comments='[
        {"content":"素晴らしい配信でした！","user":"user1","platform":"youtube"},
        {"content":"次の配信も楽しみです","user":"user2","platform":"youtube"},
        {"content":"質問があります","user":"user3","platform":"youtube"},
        {"content":"ありがとうございます","user":"user4","platform":"youtube"},
        {"content":"とても勉強になりました","user":"user5","platform":"youtube"}
    ]'

    for i in $(seq 1 $COMMENTS_PER_USER); do
        local timestamp=$(date +%s)
        local result=$(measure_single_request "/comments/summary" "POST" "{\"comments\":$test_comments}")
        local duration=$(echo $result | cut -d',' -f1)
        local response_code=$(echo $result | cut -d',' -f2)

        # レスポンスボディを取得して要約の長さを測定
        local summary_response=$(curl -s -X POST -H "Content-Type: application/json" \
            -d "{\"comments\":$test_comments}" "$API_BASE_URL/comments/summary")
        local summary_length=$(echo $summary_response | jq -r '.data | length' 2>/dev/null || echo "0")

        echo "$timestamp,$duration,$response_code,$summary_length" >> "$results_file"

        total_requests=$((total_requests + 1))
        total_duration=$((total_duration + duration))

        if [ "$response_code" -eq 200 ]; then
            successful_requests=$((successful_requests + 1))
        fi

        # 進捗表示（5件ごと）
        if [ $((i % 5)) -eq 0 ]; then
            echo "  進捗: $i/$COMMENTS_PER_USER 件処理済み"
        fi
    done

    # 結果計算
    local avg_duration=$((total_duration / total_requests))
    local success_rate=$(echo "scale=2; $successful_requests * 100 / $total_requests" | bc)

    print_success "AI要約ベンチマーク完了"
    echo "  総リクエスト数: $total_requests"
    echo "  成功数: $successful_requests"
    echo "  成功率: $success_rate%"
    echo "  平均応答時間: ${avg_duration}ms"
    echo "  結果ファイル: $results_file"
}

# 同時実行ベンチマーク
benchmark_concurrent() {
    print_status "同時実行ベンチマークを実行中..."

    local results_file="$RESULTS_DIR/concurrent_results.csv"
    echo "start_time,end_time,duration_ms,requests_per_second,errors" > "$results_file"

    local start_time=$(date +%s%N)
    local end_time=$((start_time + DURATION * 1000000000)) # ナノ秒に変換
    local total_requests=0
    local error_count=0

    # 同時実行でリクエストを送信
    for i in $(seq 1 $CONCURRENT_USERS); do
        (
            local user_requests=0
            while [ $(date +%s%N) -lt $end_time ]; do
                local response=$(curl -s -w "%{http_code}" -o /dev/null "$API_BASE_URL/comments?platform=youtube")
                user_requests=$((user_requests + 1))

                if [ "$response" -ne 200 ]; then
                    error_count=$((error_count + 1))
                fi

                # 短い間隔でリクエストを送信
                sleep 0.1
            done
            echo "User $i: $user_requests requests"
        ) &
    done

    # 全プロセスが完了するのを待つ
    wait

    local current_time=$(date +%s%N)
    local duration=$(( (current_time - start_time) / 1000000 )) # ミリ秒に変換
    local requests_per_second=$(echo "scale=2; $total_requests / ($duration / 1000)" | bc)

    echo "$start_time,$current_time,$duration,$requests_per_second,$error_count" >> "$results_file"

    print_success "同時実行ベンチマーク完了"
    echo "  テスト時間: ${duration}ms"
    echo "  総リクエスト数: $total_requests"
    echo "  1秒あたりのリクエスト数: $requests_per_second"
    echo "  エラー数: $error_count"
    echo "  結果ファイル: $results_file"
}

# システムリソース監視
monitor_system_resources() {
    print_status "システムリソース監視を開始..."

    local monitoring_duration=$DURATION
    local monitoring_file="$RESULTS_DIR/system_resources.csv"

    echo "timestamp,cpu_usage,memory_usage,disk_usage,network_rx,network_tx" > "$monitoring_file'

    local end_time=$(( $(date +%s) + monitoring_duration ))

    while [ $(date +%s) -lt $end_time ]; do
        local timestamp=$(date +%s)

        # CPU使用率
        local cpu_usage=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')

        # メモリ使用率
        local memory_usage=$(free | awk 'NR==2{printf "%.2f", $3*100/$2}')

        # ディスク使用率
        local disk_usage=$(df / | awk 'NR==2{print $5}' | sed 's/%//')

        # ネットワーク使用量（簡易版）
        local network_rx=$(cat /proc/net/dev | grep eth0 | awk '{print $2}')
        local network_tx=$(cat /proc/net/dev | grep eth0 | awk '{print $10}')

        echo "$timestamp,$cpu_usage,$memory_usage,$disk_usage,$network_rx,$network_tx" >> "$monitoring_file"

        sleep 1
    done

    print_success "システムリソース監視完了"
    echo "  監視時間: ${monitoring_duration}秒"
    echo "  監視データ: $monitoring_file"
}

# 結果サマリー生成
generate_summary() {
    print_status "ベンチマーク結果サマリーを生成中..."

    local summary_file="$RESULTS_DIR/benchmark_summary.txt"

    cat > "$summary_file" << EOF
YouTube & Twitch Comment Manager ベンチマーク結果
実行日時: $(date)
API Base URL: $API_BASE_URL
同時ユーザー数: $CONCURRENT_USERS
テスト時間: ${DURATION}秒
ユーザーあたりコメント数: $COMMENTS_PER_USER

=== コメント作成 ===
$(tail -5 "$RESULTS_DIR/comment_creation_results.csv" | awk -F',' 'NR>1{sum+=$2; count++} END{print "平均応答時間: " sum/count "ms"}')

=== コメント取得 ===
$(tail -5 "$RESULTS_DIR/comment_retrieval_results.csv" | awk -F',' 'NR>1{sum+=$2; count++} END{print "平均応答時間: " sum/count "ms"}')

=== AI要約 ===
$(tail -5 "$RESULTS_DIR/ai_summary_results.csv" | awk -F',' 'NR>1{sum+=$2; count++} END{print "平均応答時間: " sum/count "ms"}')

=== 同時実行 ===
$(tail -1 "$RESULTS_DIR/concurrent_results.csv" | awk -F',' '{print "1秒あたりリクエスト数: " $4}')

=== パフォーマンス評価 ===
EOF

    # パフォーマンス評価
    local avg_response_time=$(tail -5 "$RESULTS_DIR/comment_creation_results.csv" | awk -F',' 'NR>1{sum+=$2; count++} END{print sum/count}')
    local rps=$(tail -1 "$RESULTS_DIR/concurrent_results.csv" | awk -F',' '{print $4}')

    if (( $(echo "$avg_response_time < 100" | bc -l) )) && (( $(echo "$rps > 50" | bc -l) )); then
        echo "評価: 優秀 (応答時間: ${avg_response_time}ms, RPS: ${rps})" >> "$summary_file"
    elif (( $(echo "$avg_response_time < 500" | bc -l) )) && (( $(echo "$rps > 10" | bc -l) )); then
        echo "評価: 良好 (応答時間: ${avg_response_time}ms, RPS: ${rps})" >> "$summary_file"
    else
        echo "評価: 要改善 (応答時間: ${avg_response_time}ms, RPS: ${rps})" >> "$summary_file"
    fi

    echo "" >> "$summary_file"
    echo "詳細結果は各CSVファイルとシステムリソースログを参照してください。" >> "$summary_file"

    print_success "サマリー生成完了"
    echo "  サマリーファイル: $summary_file"
}

# クリーンアップ
cleanup() {
    print_status "クリーンアップを実行中..."

    # テストで作成したコメントを削除
    local comment_ids=$(curl -s "$API_BASE_URL/comments?platform=youtube" | jq -r '.data[].id' 2>/dev/null || echo "")

    if [ ! -z "$comment_ids" ]; then
        for id in $comment_ids; do
            curl -s -X DELETE "$API_BASE_URL/comments/$id" > /dev/null
        done
    fi

    print_success "クリーンアップ完了"
}

# メイン実行
main() {
    check_prerequisites
    health_check

    print_status "ベンチマークを開始します..."

    # 各ベンチマークを実行
    benchmark_comment_creation &
    CREATION_PID=$!

    benchmark_comment_retrieval &
    RETRIEVAL_PID=$!

    benchmark_ai_summary &
    SUMMARY_PID=$!

    # システムリソース監視
    monitor_system_resources &
    MONITOR_PID=$!

    # 同時実行ベンチマーク
    sleep 5 # 他のベンチマークが開始してから
    benchmark_concurrent &
    CONCURRENT_PID=$!

    # 全プロセス完了待ち
    wait $CREATION_PID $RETRIEVAL_PID $SUMMARY_PID $MONITOR_PID $CONCURRENT_PID

    # サマリー生成
    generate_summary

    # クリーンアップ
    cleanup

    print_success "すべてのベンチマークが完了しました！"
    print_success "結果ディレクトリ: $RESULTS_DIR"
    echo ""
    echo "=== 次のステップ ==="
    echo "1. 結果ファイルを確認してください"
    echo "2. ボトルネックを特定してください"
    echo "3. 必要に応じて最適化を行ってください"
    echo "4. 再度ベンチマークを実行して改善を確認してください"
}

# ヘルプ表示
show_help() {
    cat << EOF
YouTube & Twitch Comment Manager ベンチマークツール

使用方法: $0 [オプション]

オプション:
  -h, --help              このヘルプを表示
  -u, --url URL          APIベースURL (デフォルト: http://localhost:3000/api)
  -c, --concurrent NUM   同時ユーザー数 (デフォルト: 10)
  -d, --duration SEC     テスト時間（秒） (デフォルト: 60)
  -r, --requests NUM     ユーザーあたりのリクエスト数 (デフォルト: 100)
  -o, --output DIR       結果出力ディレクトリ

例:
  $0                                    # デフォルト設定で実行
  $0 -c 50 -d 120                       # 50ユーザー、120秒間実行
  $0 -u http://api.example.com/api      # カスタムAPI URL
  $0 -o ./my_benchmark_results          # カスタム出力ディレクトリ

前提条件:
  - curl
  - jq
  - bc

結果ファイル:
  - comment_creation_results.csv    # コメント作成結果
  - comment_retrieval_results.csv   # コメント取得結果
  - ai_summary_results.csv          # AI要約結果
  - concurrent_results.csv          # 同時実行結果
  - system_resources.csv            # システムリソース監視
  - benchmark_summary.txt           # サマリー

EOF
}

# 引数解析
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -u|--url)
            API_BASE_URL="$2"
            shift 2
            ;;
        -c|--concurrent)
            CONCURRENT_USERS="$2"
            shift 2
            ;;
        -d|--duration)
            DURATION="$2"
            shift 2
            ;;
        -r|--requests)
            COMMENTS_PER_USER="$2"
            shift 2
            ;;
        -o|--output)
            RESULTS_DIR="$2"
            shift 2
            ;;
        *)
            print_error "不明なオプション: $1"
            show_help
            exit 1
            ;;
    esac
done

# メイン実行
main
