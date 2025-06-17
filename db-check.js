// =============================================================================
// 📋 DynamoDB全テーブル確認スクリプト
// =============================================================================

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { CognitoIdentityProviderClient, ListUsersCommand } = require("@aws-sdk/client-cognito-identity-provider");

// aws-exports.jsから設定を読み込み
const awsconfig = require("./src/aws-exports.js").default || require("./src/aws-exports.js");

const dynamoClient = new DynamoDBClient({ region: awsconfig.aws_project_region });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cognitoClient = new CognitoIdentityProviderClient({ region: awsconfig.aws_project_region });

// テーブル名
const TABLES = {
  users: "Users-dev",
  photos: "Photos-dev",
  favorites: "Favorites-dev",
};

// =============================================================================
// 🔍 1. 全テーブル基本情報確認
// =============================================================================
async function checkAllTables() {
  console.log("🔍 DynamoDB全テーブル確認");
  console.log("==========================================");

  for (const [name, tableName] of Object.entries(TABLES)) {
    try {
      console.log(`\n📊 ${name.toUpperCase()}テーブル (${tableName})`);
      console.log("----------------------------------------");

      const command = new ScanCommand({ TableName: tableName });
      const result = await docClient.send(command);
      const items = result.Items || [];

      console.log(`📈 総レコード数: ${items.length}`);

      if (items.length > 0) {
        console.log("📝 サンプルデータ:");
        items.slice(0, 3).forEach((item, index) => {
          console.log(`  ${index + 1}. ${JSON.stringify(item)}`);
        });

        if (items.length > 3) {
          console.log(`  ... 他 ${items.length - 3}件`);
        }
      } else {
        console.log("⚠️  データが見つかりません");
      }
    } catch (error) {
      console.error(`❌ ${name}テーブルエラー:`, error.message);
    }
  }
}

// =============================================================================
// 🔗 2. テーブル間紐づき確認
// =============================================================================
async function checkRelationships() {
  console.log("\n\n🔗 テーブル間紐づき確認");
  console.log("==========================================");

  try {
    // 全テーブルのデータを取得
    const [usersResult, photosResult, favoritesResult] = await Promise.all([
      docClient.send(new ScanCommand({ TableName: TABLES.users })),
      docClient.send(new ScanCommand({ TableName: TABLES.photos })),
      docClient.send(new ScanCommand({ TableName: TABLES.favorites })),
    ]);

    const users = usersResult.Items || [];
    const photos = photosResult.Items || [];
    const favorites = favoritesResult.Items || [];

    console.log(`📊 Users: ${users.length}件`);
    console.log(`📊 Photos: ${photos.length}件`);
    console.log(`📊 Favorites: ${favorites.length}件`);

    // ユーザーパスコード一覧
    const userPasscodes = new Set(users.map((u) => u.passcode));
    console.log(`\n👤 登録済みユーザーパスコード: ${Array.from(userPasscodes).sort().join(", ")}`);

    // 写真アップロードユーザー確認
    const photoUploaders = new Set(photos.map((p) => p.uploadedBy));
    console.log(`📸 写真アップロードユーザー: ${Array.from(photoUploaders).sort().join(", ")}`);

    // お気に入り使用ユーザー確認
    const favoriteUsers = new Set(favorites.map((f) => f.userId));
    console.log(`⭐ お気に入り使用ユーザー: ${Array.from(favoriteUsers).sort().join(", ")}`);

    // 紐づき整合性チェック
    console.log("\n🔍 紐づき整合性チェック:");

    // 存在しないユーザーが写真をアップロードしていないかチェック
    const invalidPhotoUploaders = Array.from(photoUploaders).filter((uploader) => !userPasscodes.has(uploader));
    if (invalidPhotoUploaders.length > 0) {
      console.log(`⚠️  存在しないユーザーが写真アップロード: ${invalidPhotoUploaders.join(", ")}`);
    } else {
      console.log("✅ 写真アップロード → ユーザー紐づき: OK");
    }

    // 存在しないユーザーがお気に入りしていないかチェック
    const invalidFavoriteUsers = Array.from(favoriteUsers).filter((user) => !userPasscodes.has(user));
    if (invalidFavoriteUsers.length > 0) {
      console.log(`⚠️  存在しないユーザーがお気に入り使用: ${invalidFavoriteUsers.join(", ")}`);
    } else {
      console.log("✅ お気に入り → ユーザー紐づき: OK");
    }

    // お気に入り対象の写真が存在するかチェック
    const photoIds = new Set(photos.map((p) => p.albumId || p.photoId));
    const favoriteTargetIds = favorites.filter((f) => f.targetType === "album").map((f) => f.targetId);
    const invalidFavoriteTargets = favoriteTargetIds.filter((targetId) => !photoIds.has(targetId));

    if (invalidFavoriteTargets.length > 0) {
      console.log(
        `⚠️  存在しない写真/アルバムがお気に入り対象: ${invalidFavoriteTargets.slice(0, 5).join(", ")}${invalidFavoriteTargets.length > 5 ? "..." : ""}`
      );
    } else {
      console.log("✅ お気に入り → 写真/アルバム紐づき: OK");
    }
  } catch (error) {
    console.error("❌ 紐づき確認エラー:", error.message);
  }
}

// =============================================================================
// 🧪 3. Cognito ↔ DynamoDB 整合性確認
// =============================================================================
async function checkCognitoDynamoSync() {
  console.log("\n\n🧪 Cognito ↔ DynamoDB 整合性確認");
  console.log("==========================================");

  try {
    // Cognito全ユーザー取得
    let allCognitoUsers = [];
    let paginationToken = null;

    do {
      const command = new ListUsersCommand({
        UserPoolId: awsconfig.aws_user_pools_id,
        Limit: 60,
        ...(paginationToken && { PaginationToken: paginationToken }),
      });

      const result = await cognitoClient.send(command);
      allCognitoUsers = allCognitoUsers.concat(result.Users || []);
      paginationToken = result.PaginationToken;
    } while (paginationToken);

    // DynamoDBユーザー取得
    const dynamoCommand = new ScanCommand({ TableName: TABLES.users });
    const dynamoResult = await docClient.send(dynamoCommand);
    const dynamoUsers = dynamoResult.Items || [];

    const cognitoUsernames = allCognitoUsers.map((u) => u.Username).sort();
    const dynamoPasscodes = dynamoUsers.map((u) => u.passcode).sort();

    console.log(`📊 Cognitoユーザー: ${cognitoUsernames.length}件`);
    console.log(`📊 DynamoDBユーザー: ${dynamoPasscodes.length}件`);

    // 差分確認
    const cognitoOnly = cognitoUsernames.filter((u) => !dynamoPasscodes.includes(u));
    const dynamoOnly = dynamoPasscodes.filter((p) => !cognitoUsernames.includes(p));

    if (cognitoOnly.length > 0) {
      console.log(`⚠️  Cognitoのみ存在: ${cognitoOnly.slice(0, 10).join(", ")}${cognitoOnly.length > 10 ? "..." : ""}`);
    }

    if (dynamoOnly.length > 0) {
      console.log(`⚠️  DynamoDBのみ存在: ${dynamoOnly.slice(0, 10).join(", ")}${dynamoOnly.length > 10 ? "..." : ""}`);
    }

    if (cognitoOnly.length === 0 && dynamoOnly.length === 0) {
      console.log("✅ Cognito ↔ DynamoDB 完全同期");
    }
  } catch (error) {
    console.error("❌ Cognito-DynamoDB同期確認エラー:", error.message);
  }
}

// =============================================================================
// 📊 4. お気に入り詳細分析
// =============================================================================
async function analyzeFavorites() {
  console.log("\n\n📊 お気に入り詳細分析");
  console.log("==========================================");

  try {
    const command = new ScanCommand({ TableName: TABLES.favorites });
    const result = await docClient.send(command);
    const favorites = result.Items || [];

    if (favorites.length === 0) {
      console.log("ℹ️  お気に入りデータがありません");
      return;
    }

    console.log(`📈 総お気に入り数: ${favorites.length}`);

    // ユーザー別統計
    const userStats = {};
    favorites.forEach((fav) => {
      if (!userStats[fav.userId]) {
        userStats[fav.userId] = { total: 0, album: 0, photo: 0 };
      }
      userStats[fav.userId].total++;
      userStats[fav.userId][fav.targetType]++;
    });

    console.log("\n👤 ユーザー別お気に入り:");
    Object.entries(userStats)
      .sort(([, a], [, b]) => b.total - a.total)
      .forEach(([userId, stats]) => {
        console.log(`  ${userId}: ${stats.total}件 (アルバム:${stats.album}, 写真:${stats.photo})`);
      });

    // 対象別統計
    const targetStats = {};
    favorites.forEach((fav) => {
      const key = `${fav.targetType}:${fav.targetId}`;
      targetStats[key] = (targetStats[key] || 0) + 1;
    });

    console.log("\n⭐ 人気アルバム/写真 TOP5:");
    Object.entries(targetStats)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .forEach(([target, count]) => {
        console.log(`  ${target}: ${count}件`);
      });

    // 最新お気に入り5件
    console.log("\n🕒 最新お気に入り5件:");
    favorites
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5)
      .forEach((fav) => {
        const date = new Date(fav.createdAt).toLocaleString("ja-JP");
        console.log(`  ${date}: ${fav.userId} → ${fav.targetType}:${fav.targetId.substring(0, 8)}...`);
      });
  } catch (error) {
    console.error("❌ お気に入り分析エラー:", error.message);
  }
}

// =============================================================================
// 🚀 メイン実行関数
// =============================================================================
async function main() {
  console.log("🎯 結婚式写真共有アプリ - DB総合チェック");
  console.log("=".repeat(50));

  await checkAllTables();
  await checkRelationships();
  await checkCognitoDynamoSync();
  await analyzeFavorites();

  console.log("\n\n✅ 総合チェック完了");
  console.log("=".repeat(50));
}

// 実行
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  checkAllTables,
  checkRelationships,
  checkCognitoDynamoSync,
  analyzeFavorites,
};
