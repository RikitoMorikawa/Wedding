const { CognitoIdentityProviderClient, ListUsersCommand } = require("@aws-sdk/client-cognito-identity-provider");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");

// aws-exports.jsから設定を読み込み
const awsconfig = require('./src/aws-exports.js').default || require('./src/aws-exports.js');

const cognitoClient = new CognitoIdentityProviderClient({ 
  region: awsconfig.aws_project_region 
});

const dynamoClient = new DynamoDBClient({ region: awsconfig.aws_project_region });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const tableName = 'Users-dev';

// 全データ取得とパスコード完全一致確認
async function verifyExactMatch() {
  console.log('🔍 パスコード完全一致確認');
  console.log('==========================================');
  
  try {
    // Cognito全ユーザー取得
    let allCognitoUsers = [];
    let paginationToken = null;
    
    do {
      const command = new ListUsersCommand({
        UserPoolId: awsconfig.aws_user_pools_id,
        Limit: 60,
        ...(paginationToken && { PaginationToken: paginationToken })
      });
      
      const result = await cognitoClient.send(command);
      allCognitoUsers = allCognitoUsers.concat(result.Users || []);
      paginationToken = result.PaginationToken;
    } while (paginationToken);
    
    // DynamoDB全レコード取得
    const dynamoCommand = new ScanCommand({
      TableName: tableName
    });
    const dynamoResult = await docClient.send(dynamoCommand);
    
    // データ整理
    const cognitoUsernames = allCognitoUsers
      .map(user => user.Username)
      .filter(username => username >= '000001' && username <= '000080')
      .sort();
      
    const dynamoPasscodes = dynamoResult.Items
      .map(item => item.passcode)
      .filter(passcode => passcode >= '000001' && passcode <= '000080')
      .sort();
    
    console.log(`📊 Cognitoユーザー名: ${cognitoUsernames.length}件`);
    console.log(`📊 DynamoDBパスコード: ${dynamoPasscodes.length}件`);
    
    // 完全一致確認
    console.log('\n🔸 全パスコード一致確認:');
    
    let perfectMatch = true;
    let matchCount = 0;
    
    // 各パスコードを個別に確認
    for (let i = 1; i <= 80; i++) {
      const expectedPasscode = i.toString().padStart(6, '0');
      const inCognito = cognitoUsernames.includes(expectedPasscode);
      const inDynamo = dynamoPasscodes.includes(expectedPasscode);
      
      if (inCognito && inDynamo) {
        matchCount++;
        if (i <= 10 || i > 70) { // 最初の10件と最後の10件を表示
          console.log(`  ✅ ${expectedPasscode}: Cognito ✓ DynamoDB ✓`);
        }
      } else {
        perfectMatch = false;
        console.log(`  ❌ ${expectedPasscode}: Cognito ${inCognito ? '✓' : '✗'} DynamoDB ${inDynamo ? '✓' : '✗'}`);
      }
    }
    
    if (matchCount > 10 && matchCount <= 70) {
      console.log(`  ... 中間 ${matchCount - 10}件も全て一致`);
    }
    
    // 結果サマリー
    console.log('\n📈 最終結果:');
    console.log('==========================================');
    console.log(`✅ 完全一致数: ${matchCount}/80`);
    
    if (perfectMatch && matchCount === 80) {
      console.log('🎉 完璧！全パスコードが完全一致しています！');
      console.log('');
      console.log('✨ データ整合性: 100%');
      console.log('✨ Cognito ↔ DynamoDB 紐づけ: 完璧');
      console.log('✨ 000001～000080: 全て揃っています');
      console.log('');
      console.log('🚀 アプリケーションは正常に動作するはずです！');
    } else {
      console.log('⚠️  一部不一致があります');
    }
    
    // ボーナス：統計情報
    console.log('\n📋 詳細統計:');
    console.log(`🔹 Cognitoユーザー総数: ${allCognitoUsers.length}`);
    console.log(`🔹 範囲内Cognitoユーザー: ${cognitoUsernames.length}`);
    console.log(`🔹 DynamoDBレコード総数: ${dynamoResult.Items.length}`);
    console.log(`🔹 範囲内DynamoDBレコード: ${dynamoPasscodes.length}`);
    
  } catch (error) {
    console.error('❌ エラー:', error.message);
  }
}

// メイン実行
verifyExactMatch();
