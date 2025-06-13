結婚式写真共有アプリ - 認証フロー
概要
本アプリケーションは、パスコードベースの認証システムを採用し、Cognito認証とDynamoDB連携による二段階のユーザー管理を実装しています。
認証フロー詳細
1. 初期状態

アプリ起動時に checkUser() を実行
Cognitoの認証状態を確認

2. 未認証の場合
CustomAuth コンポーネント表示
├── パスコード入力フォーム
├── Cognito認証 (signIn)
└── 認証成功時 → onAuthSuccess() 実行
3. 認証成功後の処理フロー
onAuthSuccess()
└── checkUser() 再実行
    ├── 1. Cognito認証チェック
    │   └── getCurrentUser() で現在のユーザー取得
    └── 2. DynamoDB nameカラムチェック
        └── fetchUserInfo(passcode) でユーザー情報取得