const { AdminCreateUserCommand, AdminSetUserPasswordCommand, CognitoIdentityProviderClient } = require("@aws-sdk/client-cognito-identity-provider");

// aws-exports.jsから設定を読み込み
const awsconfig = require('./src/aws-exports.js').default || require('./src/aws-exports.js');

console.log('AWS Config:', {
  region: awsconfig.aws_project_region,
  userPoolId: awsconfig.aws_user_pools_id
});

const client = new CognitoIdentityProviderClient({ 
  region: awsconfig.aws_project_region 
});

// 作成したいパスコードのリスト
const passcodes = [
  '111111', '222222', '333333', '444444', '555555',
  '666666', '777777', '888888', '999999', '101010'
];

async function createUser(passcode) {
  if (!awsconfig.aws_user_pools_id) {
    console.error('❌ UserPoolId is not found in aws-exports.js');
    return;
  }

  const createParams = {
    UserPoolId: awsconfig.aws_user_pools_id,
    Username: passcode,
    TemporaryPassword: passcode,
    MessageAction: 'SUPPRESS', // ウェルカムメールを送信しない
  };

  try {
    // ユーザー作成
    const createCommand = new AdminCreateUserCommand(createParams);
    await client.send(createCommand);
    
    // パスワードを永続化
    const setPasswordParams = {
      UserPoolId: awsconfig.aws_user_pools_id,
      Username: passcode,
      Password: passcode,
      Permanent: true
    };
    
    const setPasswordCommand = new AdminSetUserPasswordCommand(setPasswordParams);
    await client.send(setPasswordCommand);
    
    console.log(`✅ User created: ${passcode}`);
  } catch (error) {
    if (error.name === 'UsernameExistsException') {
      console.log(`⚠️  User ${passcode} already exists`);
    } else {
      console.error(`❌ Error creating user ${passcode}:`, error.message);
    }
  }
}

async function createAllUsers() {
  console.log('Creating users...');
  
  if (!awsconfig.aws_user_pools_id) {
    console.error('❌ Cannot proceed: UserPoolId is missing');
    return;
  }
  
  for (const passcode of passcodes) {
    await createUser(passcode);
    // APIレート制限を避けるため少し待機
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('✅ Process completed!');
}

createAllUsers().catch(console.error);
