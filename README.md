# 結婚式写真共有アプリ - プロジェクト概要

## プロジェクト説明

結婚式の参加者がパスコードでログインし、写真をアップロード・共有できるWebアプリケーション。パスコードベースの簡単認証で、技術的知識がないゲストでも簡単に利用できるよう設計されています。

### 主な機能
- **パスコード認証**: 簡単な数字のパスコードでログイン
- **ユーザー名登録**: 初回ログイン時に表示名を登録
- **写真アップロード**: ドラッグ&ドロップ対応
- **写真一覧表示**: リアルタイムで共有写真を表示
- **レスポンシブ対応**: スマートフォン・タブレット・PC対応

## 技術スタック

### フロントエンド
- **Next.js 15.3.3**: React フレームワーク
- **TypeScript**: 型安全性
- **Tailwind CSS**: スタイリング
- **AWS Amplify UI**: 認証コンポーネント

### バックエンド
- **AWS Lambda**: サーバーレス関数
- **Node.js**: ランタイム
- **Express.js**: APIフレームワーク

### データベース・ストレージ
- **Amazon DynamoDB**: NoSQLデータベース
- **Amazon S3**: 画像ストレージ

### インフラ・デプロイ
- **AWS Amplify**: フルスタック開発プラットフォーム
- **Amazon Cognito**: 認証サービス
- **Amazon API Gateway**: REST API
- **AWS CloudFormation**: インフラ as Code

## アーキテクチャ

```
[ユーザー] 
    ↓
[Amplify Hosting (Next.js)]
    ↓
[API Gateway]
    ↓
[Lambda Function]
    ↓
[DynamoDB] ← ユーザー情報
    ↓
[S3 Bucket] ← 写真ファイル
```

## 認証フロー

### 1. ログイン処理
```
パスコード入力 
→ Cognito認証 (username=password方式)
→ DynamoDB でユーザー情報確認
→ 名前の有無で画面分岐
```

### 2. 状態管理
```typescript
// 主要な状態
const [user, setUser] = useState<AuthUser | null>(null)          // Cognito認証状態
const [userInfo, setUserInfo] = useState<UserInfo | null>(null)  // DynamoDB ユーザー情報
const [loading, setLoading] = useState(true)                     // 初期ローディング
const [userInfoLoading, setUserInfoLoading] = useState(false)    // ユーザー情報取得中
```

### 3. 画面遷移
```
1. 読み込み中 (loading=true)
2. ログイン画面 (!user)
3. ユーザー情報確認中 (userInfoLoading=true)
4. 名前登録モーダル (!userInfo.name)
5. メイン画面 (正常状態)
```

## データベース設計

### Users テーブル
```
Table: Users-dev
Partition Key: passcode (String)

例:
┌──────────┬────────┐
│ passcode │  name  │
├──────────┼────────┤
│ 111111   │ 新郎   │
│ 222222   │ 新婦   │
│ 333333   │ 友人A  │
└──────────┴────────┘
```

### Photos ストレージ
```
S3 Bucket: weddingphotos-dev
構造: /public/{timestamp}_{filename}
```

## API エンドポイント

### Base URL
```
https://5939n6zwpc.execute-api.ap-northeast-1.amazonaws.com/dev
```

### GET /photos/user/{passcode}
ユーザー情報取得
```json
// Response (成功)
{
  "success": true,
  "user": {
    "passcode": "111111",
    "name": "新郎"
  }
}

// Response (未登録)
{
  "success": false,
  "message": "User not found"
}
```

### POST /photos/user
ユーザー登録
```json
// Request
{
  "passcode": "333333",
  "name": "友人A"
}

// Response
{
  "success": true,
  "message": "User registered successfully"
}
```

## デプロイ手順

### 初回セットアップ
```bash
# 1. Amplify CLI インストール
npm install -g @aws-amplify/cli

# 2. AWS認証設定
amplify configure

# 3. プロジェクト初期化
amplify init

# 4. 認証追加
amplify add auth

# 5. API追加
amplify add api

# 6. ストレージ追加
amplify add storage

# 7. ホスティング追加
amplify add hosting

# 8. デプロイ
amplify push
amplify publish
```

### 日常的なデプロイ
```bash
# コード変更後
git add .
git commit -m "変更内容"
git push origin main

# フロントエンドのみ更新
amplify publish

# バックエンドも含む更新
amplify push
amplify publish
```

## API追加・変更手順

### 既存API の更新
```bash
# 1. Lambda関数を編集
vim amplify/backend/function/weddingPhotosFunction/src/app.js

# 2. デプロイ
amplify push

# 3. テスト
curl https://YOUR_API_ENDPOINT/dev/photos/test
```

### 新しいエンドポイント追加
```bash
# 1. API設定更新
amplify update api

# 2. 新しいパス追加
# 例: /photos/albums

# 3. Lambda関数にルート追加
# app.js に新しいエンドポイント実装

# 4. デプロイ
amplify push
```

### Lambda関数のログ確認
```bash
# AWS Console でLambda関数のログ確認
amplify console

# または CloudWatch Logs で確認
```

## 環境管理

### 開発環境
```bash
amplify env add
# Name: staging
amplify push
```

### 環境切り替え
```bash
amplify env checkout dev     # 開発環境
amplify env checkout prod    # 本番環境
```

## トラブルシューティング

### よくある問題と解決方法

#### 1. ビルドエラー
```bash
# TypeScript エラー
npm run build  # ローカルで確認

# ESLint エラー
npm run lint:fix
```

#### 2. API エラー
```bash
# CORS エラー
amplify update api  # CORS設定確認

# 認証エラー
amplify update api  # "Restrict API access" を No に
```

#### 3. 認証問題
```bash
# Cognito設定確認
amplify console auth

# ユーザープール確認
aws cognito-idp list-users --user-pool-id YOUR_POOL_ID
```

#### 4. ストレージ問題
```bash
# S3設定確認
amplify console storage

# アクセス権限確認
amplify update storage
```

## 本番環境情報

### デプロイURL
```
https://dev.d17lbvp1d125uc.amplifyapp.com
```

### API エンドポイント
```
https://5939n6zwpc.execute-api.ap-northeast-1.amazonaws.com/dev
```

### 登録済みユーザー
- `111111`: 新郎
- `222222`: 新婦
- その他: 未登録（初回ログイン時に名前登録）

## セキュリティ考慮事項

1. **認証方式**: パスコード=パスワード方式（簡易性重視）
2. **API認証**: 認証不要設定（ゲストの利便性重視）
3. **CORS**: 開発環境では全オリジン許可
4. **ファイルアップロード**: S3 の pre-signed URL 使用

## 今後の拡張案

- [ ] 写真にコメント機能
- [ ] アルバム分類機能
- [ ] 管理者用ダッシュボード
- [ ] メール通知機能
- [ ] 写真ダウンロード一括機能
- [ ] QRコード でのパスコード配布