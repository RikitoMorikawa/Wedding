const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

// aws-exports.jsから設定を読み込み
const awsconfig = require('./src/aws-exports.js').default || require('./src/aws-exports.js');

const client = new DynamoDBClient({ region: awsconfig.aws_project_region });
const docClient = DynamoDBDocumentClient.from(client);

// 実際のテーブル名
const tableName = 'Users-dev';

console.log('AWS Config:', {
  region: awsconfig.aws_project_region,
  tableName: tableName
});

// テーブル情報
const tableData = [
  { passcode: '111111', name: '新郎' },
  { passcode: '222222', name: '新婦' },
  { passcode: '333333', name: ''},
  { passcode: '444444', name: '' },
  { passcode: '555555', name: '' },
  { passcode: '666666', name: '' },
  { passcode: '777777', name: '' },
  { passcode: '888888', name: '' },
  { passcode: '999999', name: '' },
  { passcode: '101010', name: '' }
];

async function insertTableData() {
  console.log('Inserting table data into DynamoDB...');
  console.log('Table name:', tableName);
  
  for (const data of tableData) {
    try {
      const command = new PutCommand({
        TableName: tableName,
        Item: data
      });
      
      await docClient.send(command);
      console.log(`✅ Inserted: ${data.passcode} - ${data.name}`);
    } catch (error) {
      console.error(`❌ Error inserting ${data.passcode}:`, error.message);
    }
    
    // APIレート制限を避けるため少し待機
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('✅ All data inserted!');
}

insertTableData().catch(console.error);
