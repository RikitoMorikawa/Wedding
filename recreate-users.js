const { CognitoIdentityProviderClient, ListUsersCommand, AdminDeleteUserCommand, AdminCreateUserCommand, AdminSetUserPasswordCommand } = require("@aws-sdk/client-cognito-identity-provider");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, DeleteCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");

// aws-exports.jsから設定を読み込み
const awsconfig = require('./src/aws-exports.js').default || require('./src/aws-exports.js');

const cognitoClient = new CognitoIdentityProviderClient({ 
  region: awsconfig.aws_project_region 
});

const dynamoClient = new DynamoDBClient({ region: awsconfig.aws_project_region });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const tableName = 'Users-dev';

// 000001から000080までのパスコード生成
function generatePasscodes() {
  const passcodes = [];
  for (let i = 1; i <= 80; i++) {
    passcodes.push(i.toString().padStart(6, '0'));
  }
  return passcodes;
}

// Cognito全ユーザー削除
async function deleteAllCognitoUsers() {
  console.log('\n🗑️  Cognito全ユーザー削除中...');
  
  try {
    const listCommand = new ListUsersCommand({
      UserPoolId: awsconfig.aws_user_pools_id,
      Limit: 60
    });
    
    let result = await cognitoClient.send(listCommand);
    let allUsers = result.Users || [];
    
    // ページネーションで全ユーザーを取得
    while (result.PaginationToken) {
      const nextCommand = new ListUsersCommand({
        UserPoolId: awsconfig.aws_user_pools_id,
        Limit: 60,
        PaginationToken: result.PaginationToken
      });
      result = await cognitoClient.send(nextCommand);
      allUsers = allUsers.concat(result.Users || []);
    }
    
    console.log(`削除対象: ${allUsers.length}ユーザー`);
    
    // 各ユーザーを削除
    for (const user of allUsers) {
      try {
        const deleteCommand = new AdminDeleteUserCommand({
          UserPoolId: awsconfig.aws_user_pools_id,
          Username: user.Username
        });
        
        await cognitoClient.send(deleteCommand);
        console.log(`✅ 削除: ${user.Username}`);
        
        // レート制限回避
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`❌ 削除失敗 ${user.Username}:`, error.message);
      }
    }
    
    console.log('✅ Cognito全ユーザー削除完了');
  } catch (error) {
    console.error('❌ Cognito削除エラー:', error.message);
  }
}

// DynamoDB全レコード削除
async function deleteAllDynamoRecords() {
  console.log('\n🗑️  DynamoDB全レコード削除中...');
  
  try {
    const scanCommand = new ScanCommand({
      TableName: tableName
    });
    
    const result = await docClient.send(scanCommand);
    const items = result.Items || [];
    
    console.log(`削除対象: ${items.length}レコード`);
    
    // 各レコードを削除
    for (const item of items) {
      try {
        const deleteCommand = new DeleteCommand({
          TableName: tableName,
          Key: {
            passcode: item.passcode
          }
        });
        
        await docClient.send(deleteCommand);
        console.log(`✅ 削除: ${item.passcode}`);
        
        // レート制限回避
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`❌ 削除失敗 ${item.passcode}:`, error.message);
      }
    }
    
    console.log('✅ DynamoDB全レコード削除完了');
  } catch (error) {
    console.error('❌ DynamoDB削除エラー:', error.message);
  }
}

// Cognito新規ユーザー作成
async function createCognitoUsers() {
  console.log('\n🏗️  Cognito新規ユーザー作成中...');
  
  const passcodes = generatePasscodes();
  
  for (const passcode of passcodes) {
    try {
      // ユーザー作成
      const createCommand = new AdminCreateUserCommand({
        UserPoolId: awsconfig.aws_user_pools_id,
        Username: passcode,
        TemporaryPassword: passcode,
        MessageAction: 'SUPPRESS'
      });
      
      await cognitoClient.send(createCommand);
      
      // パスワード永続化
      const setPasswordCommand = new AdminSetUserPasswordCommand({
        UserPoolId: awsconfig.aws_user_pools_id,
        Username: passcode,
        Password: passcode,
        Permanent: true
      });
      
      await cognitoClient.send(setPasswordCommand);
      
      console.log(`✅ 作成: ${passcode}`);
      
      // レート制限回避
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      if (error.name === 'UsernameExistsException') {
        console.log(`⚠️  ${passcode} は既に存在`);
      } else {
        console.error(`❌ 作成失敗 ${passcode}:`, error.message);
      }
    }
  }
  
  console.log('✅ Cognito新規ユーザー作成完了');
}

// DynamoDB新規レコード作成
async function createDynamoRecords() {
  console.log('\n🏗️  DynamoDB新規レコード作成中...');
  
  const passcodes = generatePasscodes();
  
  for (const passcode of passcodes) {
    try {
      const putCommand = new PutCommand({
        TableName: tableName,
        Item: {
          passcode: passcode,
          name: '' // 空文字で初期化
        }
      });
      
      await docClient.send(putCommand);
      console.log(`✅ 作成: ${passcode}`);
      
      // レート制限回避
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`❌ 作成失敗 ${passcode}:`, error.message);
    }
  }
  
  console.log('✅ DynamoDB新規レコード作成完了');
}

// メイン実行
async function main() {
  console.log('🚀 ユーザー再作成プロセス開始');
  console.log('対象: 000001 ～ 000080 (80件)');
  console.log('==========================================');
  
  try {
    await deleteAllCognitoUsers();
    await deleteAllDynamoRecords();
    await createCognitoUsers();
    await createDynamoRecords();
    
    console.log('\n🎉 全プロセス完了！');
    console.log('確認用: node verify-users.js');
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

main();
