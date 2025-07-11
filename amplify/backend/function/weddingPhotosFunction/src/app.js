const express = require("express");
const bodyParser = require("body-parser");
const awsServerlessExpressMiddleware = require("aws-serverless-express/middleware");
const { TransactWriteCommand } = require("@aws-sdk/lib-dynamodb");
const { MediaConvertClient, CreateJobCommand, DescribeEndpointsCommand, GetJobCommand } = require("@aws-sdk/client-mediaconvert");

// ✅ 追加：ファイルシステムとchild_process
const fs = require("fs");
const { exec } = require("child_process");
const { promisify } = require("util");
const execPromise = promisify(exec);

// ✅ 必要なimport（S3とDynamoDB両方）
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  BatchGetCommand,
} = require("@aws-sdk/lib-dynamodb");

// ✅ S3関連のimport（アップロード機能に必要）
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const AWS = require("aws-sdk"); // ✅ 署名付きURL生成用

// DynamoDB client setup
const client = new DynamoDBClient({ region: process.env.TABLE_REGION });
const docClient = DynamoDBDocumentClient.from(client);

// S3 client setup
const s3Client = new S3Client({ region: process.env.TABLE_REGION });
const s3 = new AWS.S3(); // ✅ アップロード用S3クライアント

// ✅ MediaConvert クライアントの初期化（改善版）
let mediaConvertClient = null;
let mediaConvertEndpoint = null;

// MediaConvertエンドポイントを取得する関数
async function getMediaConvertEndpoint() {
  if (mediaConvertEndpoint) {
    return mediaConvertEndpoint;
  }

  try {
    const tempClient = new MediaConvertClient({
      region: process.env.TABLE_REGION || process.env.AWS_REGION,
    });

    const command = new DescribeEndpointsCommand({});
    const response = await tempClient.send(command);

    if (response.Endpoints && response.Endpoints.length > 0) {
      mediaConvertEndpoint = response.Endpoints[0].Url;
      console.log(`✅ MediaConvert endpoint取得: ${mediaConvertEndpoint}`);
      return mediaConvertEndpoint;
    } else {
      throw new Error("MediaConvert endpoints not found");
    }
  } catch (error) {
    console.error("❌ MediaConvert endpoint取得エラー:", error);
    throw error;
  }
}

// MediaConvertクライアントを初期化する関数
async function initializeMediaConvertClient() {
  if (mediaConvertClient) {
    return mediaConvertClient;
  }

  try {
    const endpoint = await getMediaConvertEndpoint();
    mediaConvertClient = new MediaConvertClient({
      region: process.env.TABLE_REGION || process.env.AWS_REGION,
      endpoint: endpoint,
    });
    console.log(`✅ MediaConvertクライアント初期化完了`);
    return mediaConvertClient;
  } catch (error) {
    console.error("❌ MediaConvertクライアント初期化エラー:", error);
    throw error;
  }
}

const app = express();
app.use(bodyParser.json());
app.use(awsServerlessExpressMiddleware.eventContext());

// CORS設定
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "*");
  next();
});

// ✅ 新規追加：MediaConvert環境確認エンドポイント
app.get("/debug/mediaconvert-env", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    console.log("🔍 MediaConvert環境確認開始");

    const envInfo = {
      AWS_REGION: process.env.AWS_REGION,
      TABLE_REGION: process.env.TABLE_REGION,
      MEDIACONVERT_ROLE_ARN: process.env.MEDIACONVERT_ROLE_ARN,
      STORAGE_WEDDINGPHOTOS_BUCKETNAME: process.env.STORAGE_WEDDINGPHOTOS_BUCKETNAME,
    };

    console.log("📊 環境変数:", envInfo);

    // MediaConvertエンドポイント取得テスト
    let endpointTest = null;
    try {
      const endpoint = await getMediaConvertEndpoint();
      endpointTest = { success: true, endpoint };
      console.log("✅ エンドポイント取得成功:", endpoint);
    } catch (error) {
      endpointTest = { success: false, error: error.message };
      console.error("❌ エンドポイント取得失敗:", error);
    }

    // MediaConvertクライアント初期化テスト
    let clientTest = null;
    try {
      const client = await initializeMediaConvertClient();
      clientTest = { success: true, initialized: !!client };
      console.log("✅ クライアント初期化成功");
    } catch (error) {
      clientTest = { success: false, error: error.message };
      console.error("❌ クライアント初期化失敗:", error);
    }

    res.json({
      success: true,
      environment: envInfo,
      endpointTest,
      clientTest,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ MediaConvert環境確認エラー:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ✅ 新規追加：MediaConvert簡易テストエンドポイント
app.post("/debug/mediaconvert-test", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { testVideoS3Key } = req.body;

    if (!testVideoS3Key) {
      return res.status(400).json({
        success: false,
        message: "testVideoS3Key is required",
      });
    }

    console.log(`🧪 MediaConvertテスト開始: ${testVideoS3Key}`);

    // 環境変数確認
    const roleArn = process.env.MEDIACONVERT_ROLE_ARN;
    if (!roleArn) {
      throw new Error("MEDIACONVERT_ROLE_ARN not set");
    }

    // クライアント初期化
    const client = await initializeMediaConvertClient();

    // テスト用ジョブ設定（最小構成）
    const testJobSettings = {
      Role: roleArn,
      Settings: {
        Inputs: [
          {
            FileInput: `s3://${process.env.STORAGE_WEDDINGPHOTOS_BUCKETNAME}/public/${testVideoS3Key}`,
            VideoSelector: {
              ColorSpace: "FOLLOW",
            },
          },
        ],
        OutputGroups: [
          {
            Name: "Test Thumbnail",
            OutputGroupSettings: {
              Type: "FILE_GROUP_SETTINGS",
              FileGroupSettings: {
                Destination: `s3://${process.env.STORAGE_WEDDINGPHOTOS_BUCKETNAME}/public/test-thumbnails/`,
              },
            },
            Outputs: [
              {
                NameModifier: "test_thumb",
                ContainerSettings: {
                  Container: "RAW",
                },
                VideoDescription: {
                  CodecSettings: {
                    Codec: "FRAME_CAPTURE",
                    FrameCaptureSettings: {
                      FramerateNumerator: 1,
                      FramerateDenominator: 1,
                      MaxCaptures: 1,
                      Quality: 80,
                    },
                  },
                  Width: 400,
                  Height: 300,
                },
              },
            ],
          },
        ],
        TimecodeConfig: {
          Source: "ZEROBASED",
        },
      },
    };

    console.log("🚀 テストジョブ作成中...");

    const command = new CreateJobCommand(testJobSettings);
    const response = await client.send(command);

    console.log(`✅ テストジョブ作成成功: ${response.Job.Id}`);

    res.json({
      success: true,
      message: "MediaConvert test job created successfully",
      jobId: response.Job.Id,
      status: response.Job.Status,
      testVideoS3Key,
    });
  } catch (error) {
    console.error("❌ MediaConvertテストエラー:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.stack,
    });
  }
});

/**********************
 * ユーザー関連API *
 **********************/

// ユーザー情報取得
app.get("/photos/user/:passcode", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { passcode } = req.params;

    const command = new GetCommand({
      TableName: process.env.STORAGE_WEDDINGUSERS_NAME,
      Key: {
        passcode: passcode,
      },
    });

    const result = await docClient.send(command);

    if (result.Item) {
      res.json({
        success: true,
        user: result.Item,
      });
    } else {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
  } catch (error) {
    console.error("Error getting user:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ユーザー登録
app.post("/photos/user", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { passcode, name } = req.body;

    if (!passcode || !name) {
      return res.status(400).json({
        success: false,
        message: "Passcode and name are required",
      });
    }

    const command = new PutCommand({
      TableName: process.env.STORAGE_WEDDINGUSERS_NAME,
      Item: {
        passcode: passcode,
        name: name,
        createdAt: new Date().toISOString(),
      },
    });

    await docClient.send(command);

    res.json({
      success: true,
      message: "User registered successfully",
    });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**********************
 * バッチアップロード機能 *
 **********************/

// amplify/backend/function/weddingPhotosFunction/src/app.js
// バッチ署名付きURL生成（バランス型設定）

// ✅ 結婚式70名対応の拡張設定（合計容量制限を削除）
const MAX_PHOTO_FILES = 30; // 写真: 30ファイル（20→30に拡張）
const MAX_VIDEO_FILES = 1; // 動画: 1ファイル（3→1に変更）
const MAX_PHOTO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_VIDEO_SIZE = 300 * 1024 * 1024; // 300MB（3分程度の動画対応）
// MAX_TOTAL_SIZE削除 - 写真と動画は別々投稿のため不要

// バッチ署名付きURL生成の修正部分
app.post("/photos/batch-upload-urls", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { files, passcode } = req.body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "files array is required",
      });
    }

    if (!passcode) {
      return res.status(400).json({
        success: false,
        message: "passcode is required",
      });
    }

    // ✅ メディアタイプ別ファイル数制限チェック
    const photoFiles = files.filter((file) => {
      const allowedPhotoTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
      return allowedPhotoTypes.includes(file.fileType);
    });

    const videoFiles = files.filter((file) => {
      const allowedVideoTypes = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"];
      return allowedVideoTypes.includes(file.fileType);
    });

    // 写真枚数チェック（30枚に拡張）
    if (photoFiles.length > MAX_PHOTO_FILES) {
      return res.status(400).json({
        success: false,
        message: `写真は最大${MAX_PHOTO_FILES}個まででです。現在: ${photoFiles.length}個`,
        errorCode: "TOO_MANY_PHOTOS",
        maxPhotos: MAX_PHOTO_FILES,
        currentPhotos: photoFiles.length,
      });
    }

    // ✅ 動画枚数チェック（1個制限）
    if (videoFiles.length > MAX_VIDEO_FILES) {
      return res.status(400).json({
        success: false,
        message: `動画は最大${MAX_VIDEO_FILES}個まで（約3分の動画対応）です。現在: ${videoFiles.length}個`,
        errorCode: "TOO_MANY_VIDEOS",
        maxVideos: MAX_VIDEO_FILES,
        currentVideos: videoFiles.length,
      });
    }

    const allowedPhotoTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    const allowedVideoTypes = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"];
    const allAllowedTypes = [...allowedPhotoTypes, ...allowedVideoTypes];

    const uploadUrls = [];
    let totalSize = 0; // レスポンス用の集計のみ

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // ファイルタイプ検証
      if (!allAllowedTypes.includes(file.fileType)) {
        return res.status(400).json({
          success: false,
          message: `サポートされていないファイル形式です: ${file.fileType}`,
          errorCode: "UNSUPPORTED_FILE_TYPE",
          fileName: file.fileName,
          fileType: file.fileType,
        });
      }

      // ✅ 個別ファイルサイズチェック（更新された設定）
      const isVideo = allowedVideoTypes.includes(file.fileType);
      const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_PHOTO_SIZE;
      const mediaType = isVideo ? "動画" : "写真";
      const maxSizeText = isVideo ? "300MB" : "50MB"; // 300MBに更新
      const description = isVideo ? "（約3分対応）" : "（プロ撮影対応）"; // 説明更新

      if (file.size > maxSize) {
        return res.status(400).json({
          success: false,
          message: `${mediaType}ファイル「${file.fileName}」のサイズが制限を超えています。制限: ${maxSizeText}${description}、現在: ${(
            file.size /
            (1024 * 1024)
          ).toFixed(1)}MB`,
          errorCode: "FILE_SIZE_EXCEEDED",
          fileName: file.fileName,
          maxSizeMB: Math.floor(maxSize / (1024 * 1024)),
          currentSizeMB: parseFloat((file.size / (1024 * 1024)).toFixed(1)),
          mediaType: isVideo ? "video" : "photo",
        });
      }

      // レスポンス用のサイズ集計
      totalSize += file.size || 0;

      // S3キー生成
      const timestamp = Date.now();
      const s3Key = `${isVideo ? "videos" : "photos"}/${timestamp}_${i}_${file.fileName}`;

      const s3Params = {
        Bucket: process.env.STORAGE_WEDDINGPHOTOS_BUCKETNAME,
        Key: `public/${s3Key}`,
        ContentType: file.fileType,
        Expires: 600, // 10分
      };

      const uploadURL = s3.getSignedUrl("putObject", s3Params);

      uploadUrls.push({
        fileIndex: i,
        fileName: file.fileName,
        uploadURL: uploadURL,
        s3Key: s3Key,
        mediaType: isVideo ? "video" : "photo",
        fileType: file.fileType,
        size: file.size,
      });
    }

    res.json({
      success: true,
      uploadUrls: uploadUrls,
      totalFiles: files.length,
      photoFiles: photoFiles.length,
      videoFiles: videoFiles.length,
      totalSize: totalSize, // 情報表示用のみ
      expiresIn: 600,
      limits: {
        maxPhotos: MAX_PHOTO_FILES,
        maxVideos: MAX_VIDEO_FILES,
        maxPhotoSizeMB: Math.floor(MAX_PHOTO_SIZE / (1024 * 1024)),
        maxVideoSizeMB: Math.floor(MAX_VIDEO_SIZE / (1024 * 1024)),
        // maxTotalSizeMB削除 - 合計制限なし
      },
    });
  } catch (error) {
    console.error("Error creating batch upload URLs:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      errorCode: "INTERNAL_SERVER_ERROR",
    });
  }
});

// バッチアルバム保存の修正部分
app.post("/photos/batch-save-album", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const {
      albumId,
      uploadedBy,
      uploaderName,
      caption,
      uploadedAt,
      files, // [{ photoId, s3Key, mediaType, fileType, fileName, size, fileIndex }]
      passcode,
    } = req.body;

    // バリデーション
    if (!albumId || !uploadedBy || !uploaderName || !files || !Array.isArray(files)) {
      return res.status(400).json({
        success: false,
        message: "必須フィールドが不足しています: albumId, uploadedBy, uploaderName, files",
        errorCode: "MISSING_REQUIRED_FIELDS",
      });
    }

    if (files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "ファイル配列が空です",
        errorCode: "EMPTY_FILES_ARRAY",
      });
    }

    // ✅ サーバーサイドでも制限を再チェック（更新された設定）
    const photoFiles = files.filter((file) => file.mediaType === "photo");
    const videoFiles = files.filter((file) => file.mediaType === "video");

    if (photoFiles.length > MAX_PHOTO_FILES) {
      return res.status(400).json({
        success: false,
        message: `写真は最大${MAX_PHOTO_FILES}個まででです`,
        errorCode: "TOO_MANY_PHOTOS",
        maxPhotos: MAX_PHOTO_FILES,
        currentPhotos: photoFiles.length,
      });
    }

    if (videoFiles.length > MAX_VIDEO_FILES) {
      return res.status(400).json({
        success: false,
        message: `動画は最大${MAX_VIDEO_FILES}個まで（約3分の動画対応）です`,
        errorCode: "TOO_MANY_VIDEOS",
        maxVideos: MAX_VIDEO_FILES,
        currentVideos: videoFiles.length,
      });
    }

    // ユーザー存在確認
    const userCheck = new GetCommand({
      TableName: process.env.STORAGE_WEDDINGUSERS_NAME,
      Key: { passcode: passcode },
    });

    const userResult = await docClient.send(userCheck);
    if (!userResult.Item) {
      return res.status(403).json({
        success: false,
        message: "無効なユーザーです",
        errorCode: "INVALID_USER",
      });
    }

    // DynamoDBのTransactWriteは最大25項目まで
    // 10個ずつのバッチに分割
    const BATCH_SIZE = 10;
    const batches = [];

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      batches.push(files.slice(i, i + BATCH_SIZE));
    }

    const savedFiles = [];

    try {
      // バッチごとにトランザクション実行
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];

        // トランザクションアイテム作成
        const transactItems = batch.map((file, batchFileIndex) => {
          const globalIndex = batchIndex * BATCH_SIZE + batchFileIndex;

          return {
            Put: {
              TableName: process.env.STORAGE_PHOTOS_NAME,
              Item: {
                photoId: file.photoId,
                albumId: albumId,
                uploadedBy: uploadedBy,
                uploaderName: uploaderName,
                caption: globalIndex === 0 ? caption || "" : "", // メイン写真のみキャプション
                s3Key: file.s3Key,
                thumbnailS3Key: file.mediaType === "video" ? `thumbnails/${file.photoId}_thumbnail.jpg` : null,
                processingStatus: file.mediaType === "video" ? "pending" : "ready",
                uploadedAt: uploadedAt,
                photoIndex: globalIndex,
                totalPhotos: files.length,
                isMainPhoto: globalIndex === 0,
                mediaType: file.mediaType,
                fileType: file.fileType,
                fileName: file.fileName,
                fileSize: file.size,
                isPublic: true,
                createdAt: new Date().toISOString(),
              },
              // 条件付き書き込み（同じphotoIdが存在しない場合のみ）
              ConditionExpression: "attribute_not_exists(photoId)",
            },
          };
        });

        // トランザクション実行
        const transactCommand = new TransactWriteCommand({
          TransactItems: transactItems,
        });

        await docClient.send(transactCommand);

        // 成功したファイルを記録
        batch.forEach((file) => {
          savedFiles.push({
            photoId: file.photoId,
            s3Key: file.s3Key,
            fileName: file.fileName,
            mediaType: file.mediaType,
          });
        });

        console.log(`✅ Batch ${batchIndex + 1}/${batches.length} saved successfully (${batch.length} files)`);

        // バッチ間で少し待機（DynamoDB負荷軽減）
        if (batchIndex < batches.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      // 全バッチ成功
      res.json({
        success: true,
        message: `アルバムが正常に保存されました（写真${photoFiles.length}個、動画${videoFiles.length}個）`,
        albumId: albumId,
        totalFiles: files.length,
        photoFiles: photoFiles.length,
        videoFiles: videoFiles.length,
        savedFiles: savedFiles.length,
        batches: batches.length,
        limits: {
          maxPhotos: MAX_PHOTO_FILES,
          maxVideos: MAX_VIDEO_FILES,
          currentPhotos: photoFiles.length,
          currentVideos: videoFiles.length,
        },
      });
    } catch (transactionError) {
      console.error("Transaction failed:", transactionError);

      // トランザクション失敗時のS3クリーンアップを並行実行
      const cleanupPromises = savedFiles.map(async (file) => {
        try {
          await s3
            .deleteObject({
              Bucket: process.env.STORAGE_WEDDINGPHOTOS_BUCKETNAME,
              Key: `public/${file.s3Key}`,
            })
            .promise();
          console.log(`🧹 Cleaned up S3 file: ${file.s3Key}`);
        } catch (cleanupError) {
          console.error(`❌ Failed to cleanup S3 file ${file.s3Key}:`, cleanupError);
        }
      });

      // クリーンアップを並行実行（レスポンスをブロックしない）
      Promise.all(cleanupPromises).catch(console.error);

      // エラーレスポンス
      if (transactionError.name === "ConditionalCheckFailedException") {
        res.status(409).json({
          success: false,
          message: "一部のファイルが既に存在します。しばらく待ってから再試行してください。",
          errorCode: "DUPLICATE_FILES",
          cleanedUp: savedFiles.length,
        });
      } else if (transactionError.name === "ProvisionedThroughputExceededException") {
        res.status(503).json({
          success: false,
          message: "データベースが一時的に混雑しています。少し待ってから再試行してください。",
          errorCode: "THROUGHPUT_EXCEEDED",
          cleanedUp: savedFiles.length,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "アルバムの保存に失敗しました",
          errorCode: "TRANSACTION_FAILED",
          error: transactionError.message,
          cleanedUp: savedFiles.length,
        });
      }
    }
  } catch (error) {
    console.error("Error in batch save album:", error);
    res.status(500).json({
      success: false,
      message: "内部サーバーエラーが発生しました",
      errorCode: "INTERNAL_SERVER_ERROR",
      error: error.message,
    });
  }
});

// ✅ 大幅改善版：generate-thumbnailエンドポイント
// amplify/backend/function/weddingPhotosFunction/src/app.js
// サムネイル生成エンドポイントの複合キー対応修正

app.post("/photos/generate-thumbnail", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  console.log("🎬 サムネイル生成リクエスト開始");
  console.log("📥 リクエストボディ:", JSON.stringify(req.body, null, 2));

  // 🔧 環境変数の確認とデバッグ
  console.log("🔍 環境変数確認:");
  console.log("  STORAGE_WEDDINGPHOTOS_NAME:", process.env.STORAGE_WEDDINGPHOTOS_NAME);
  console.log("  STORAGE_PHOTOS_NAME:", process.env.STORAGE_PHOTOS_NAME);
  console.log("  STORAGE_WEDDINGPHOTOS_BUCKETNAME:", process.env.STORAGE_WEDDINGPHOTOS_BUCKETNAME);

  try {
    const { photoId, videoS3Key, uploadedAt } = req.body;

    // 入力値の検証とログ
    if (!photoId) {
      console.error("❌ photoId が未指定");
      return res.status(400).json({
        success: false,
        message: "photoId is required",
        debug: { received: req.body },
      });
    }

    if (!videoS3Key) {
      console.error("❌ videoS3Key が未指定");
      return res.status(400).json({
        success: false,
        message: "videoS3Key is required",
        debug: { received: req.body },
      });
    }

    console.log(`🔍 処理開始 - photoId: ${photoId}, videoS3Key: ${videoS3Key}`);

    // 🔧 正しいテーブル名を特定
    let tableName = process.env.STORAGE_WEDDINGPHOTOS_NAME || process.env.STORAGE_PHOTOS_NAME;

    // 両方ともnullの場合、確認済みのテーブル名を設定
    if (!tableName) {
      tableName = "Photos-dev"; // ✅ 確認済みの実際のテーブル名
      console.warn("⚠️ 環境変数が未設定のため、確認済みテーブル名を使用:", tableName);
    }

    console.log(`📋 使用するテーブル名: ${tableName}`);

    // 🔧 DynamoDBから動画レコードを取得（複合キー対応）
    console.log("📋 DynamoDBから動画レコード取得中...");

    let videoRecord = null;

    // Method 1: uploadedAtが提供されている場合、GetCommandを試行
    if (uploadedAt) {
      console.log(`🔑 複合キー使用: photoId=${photoId}, uploadedAt=${uploadedAt}`);
      try {
        const getCommand = new GetCommand({
          TableName: tableName,
          Key: {
            photoId: photoId,
            uploadedAt: uploadedAt,
          },
        });

        const getResult = await docClient.send(getCommand);
        if (getResult.Item) {
          videoRecord = getResult.Item;
          console.log("✅ GetCommandで動画レコード取得成功");
        } else {
          console.log("⚠️ GetCommandで見つからず、Scanにフォールバック");
        }
      } catch (getError) {
        console.warn("⚠️ GetCommandエラー、Scanにフォールバック:", getError.message);
      }
    }

    // Method 2: GetCommandで見つからない場合、または uploadedAt が未提供の場合、Scanを使用
    if (!videoRecord) {
      console.log(`🔍 Scanでphotoを検索中: photoId=${photoId}`);
      try {
        const scanCommand = new ScanCommand({
          TableName: tableName,
          FilterExpression: "photoId = :photoId",
          ExpressionAttributeValues: {
            ":photoId": photoId,
          },
          Limit: 1,
        });

        const scanResult = await docClient.send(scanCommand);
        if (scanResult.Items && scanResult.Items.length > 0) {
          videoRecord = scanResult.Items[0];
          console.log("✅ Scanで動画レコード取得成功");
        }
      } catch (scanError) {
        console.error("❌ Scanでもエラー:", scanError.message);
      }
    }

    if (!videoRecord) {
      console.error(`❌ 動画レコードが見つかりません - photoId: ${photoId}`);
      return res.status(404).json({
        success: false,
        message: "Video record not found",
        debug: {
          photoId,
          tableName,
          uploadedAt,
          searchedWith: uploadedAt ? "GetCommand + Scan" : "Scan only",
        },
      });
    }

    console.log(
      "✅ 動画レコード取得成功:",
      JSON.stringify(
        {
          photoId: videoRecord.photoId,
          uploadedAt: videoRecord.uploadedAt,
          s3Key: videoRecord.s3Key,
          mediaType: videoRecord.mediaType,
        },
        null,
        2
      )
    );

    // 🔧 S3バケット名も確認
    let bucketName = process.env.STORAGE_WEDDINGPHOTOS_BUCKETNAME;
    if (!bucketName) {
      // ✅ 確認済みの実際のバケット名
      bucketName = "wedding3171c17ab5234e0fbf03519b4e2eab93e48b3-dev";
      console.warn("⚠️ S3バケット名が未設定のため、確認済み値を使用:", bucketName);
    }

    console.log(`📦 使用するS3バケット: ${bucketName}`);

    // S3から動画ファイルを取得
    console.log(`📦 S3から動画ファイル取得中 - Key: ${videoS3Key}`);
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: videoS3Key.startsWith("public/") ? videoS3Key : `public/${videoS3Key}`,
    });

    let videoBuffer;
    try {
      const s3Response = await s3Client.send(getObjectCommand);
      console.log("📦 S3レスポンス取得成功");

      // ストリームをバッファに変換
      const chunks = [];
      for await (const chunk of s3Response.Body) {
        chunks.push(chunk);
      }
      videoBuffer = Buffer.concat(chunks);
      console.log(`📦 動画バッファ作成完了 - サイズ: ${videoBuffer.length} bytes`);
    } catch (s3Error) {
      console.error("❌ S3からの動画取得エラー:", s3Error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch video from S3",
        debug: {
          error: s3Error.message,
          bucket: bucketName,
          key: videoS3Key,
          fullKey: videoS3Key.startsWith("public/") ? videoS3Key : `public/${videoS3Key}`,
        },
      });
    }

    // 一時ファイルパス作成
    const tempDir = "/tmp";
    const inputVideoPath = `${tempDir}/input_${Date.now()}.mp4`;
    const outputImagePath = `${tempDir}/thumbnail_${Date.now()}.jpg`;

    console.log(`📁 一時ファイルパス作成:`);
    console.log(`   入力: ${inputVideoPath}`);
    console.log(`   出力: ${outputImagePath}`);

    // 動画ファイルを一時ファイルに保存
    try {
      fs.writeFileSync(inputVideoPath, videoBuffer);
      console.log("✅ 動画ファイル一時保存完了");
    } catch (writeError) {
      console.error("❌ 動画ファイル保存エラー:", writeError);
      return res.status(500).json({
        success: false,
        message: "Failed to save video file",
        debug: { error: writeError.message },
      });
    }

    // FFmpegでサムネイル生成
    console.log("🎨 FFmpegでサムネイル生成開始...");
    const ffmpegCommand = `/opt/ffmpeg -i "${inputVideoPath}" -ss 00:00:01 -vframes 1 -q:v 5 -s 400x300 "${outputImagePath}"`;
    console.log(`🔧 FFmpegコマンド: ${ffmpegCommand}`);

    try {
      const { stdout, stderr } = await execPromise(ffmpegCommand);
      console.log("✅ FFmpeg実行完了");
      if (stdout) console.log("📤 FFmpeg stdout:", stdout);
      if (stderr) console.log("📤 FFmpeg stderr:", stderr);
    } catch (ffmpegError) {
      console.error("❌ FFmpeg実行エラー:", ffmpegError);

      // クリーンアップ
      try {
        fs.unlinkSync(inputVideoPath);
        console.log("🧹 入力ファイル削除完了");
      } catch (cleanupError) {
        console.error("⚠️ 入力ファイル削除エラー:", cleanupError);
      }

      return res.status(500).json({
        success: false,
        message: "FFmpeg processing failed",
        debug: {
          error: ffmpegError.message,
          command: ffmpegCommand,
        },
      });
    }

    // サムネイル画像をS3にアップロード
    console.log("☁️ サムネイル画像をS3にアップロード中...");
    const thumbnailBuffer = fs.readFileSync(outputImagePath);
    console.log(`📊 サムネイルバッファサイズ: ${thumbnailBuffer.length} bytes`);

    const thumbnailS3Key = `thumbnails/${photoId}.jpg`;
    console.log(`🔑 サムネイルS3キー: ${thumbnailS3Key}`);

    const putObjectCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: `public/${thumbnailS3Key}`,
      Body: thumbnailBuffer,
      ContentType: "image/jpeg",
    });

    try {
      await s3Client.send(putObjectCommand);
      console.log("✅ S3アップロード完了");
    } catch (uploadError) {
      console.error("❌ S3アップロードエラー:", uploadError);

      // クリーンアップ
      try {
        fs.unlinkSync(inputVideoPath);
        fs.unlinkSync(outputImagePath);
        console.log("🧹 一時ファイル削除完了");
      } catch (cleanupError) {
        console.error("⚠️ 一時ファイル削除エラー:", cleanupError);
      }

      return res.status(500).json({
        success: false,
        message: "Failed to upload thumbnail to S3",
        debug: {
          error: uploadError.message,
          key: `public/${thumbnailS3Key}`,
        },
      });
    }

    // 🔧 DynamoDBを更新（複合キー対応）
    console.log("💾 DynamoDBにサムネイルURL更新中...");
    const thumbnailUrl = `https://${bucketName}.s3.ap-northeast-1.amazonaws.com/public/${thumbnailS3Key}`;
    console.log(`🔗 サムネイルURL: ${thumbnailUrl}`);

    // 複合キーを使用してUpdateCommand実行
    const updateCommand = new UpdateCommand({
      TableName: tableName,
      Key: {
        photoId: photoId,
        uploadedAt: videoRecord.uploadedAt, // ✅ 取得したレコードのuploadedAtを使用
      },
      UpdateExpression: "SET thumbnailUrl = :thumbnailUrl, thumbnailGeneratedAt = :generatedAt",
      ExpressionAttributeValues: {
        ":thumbnailUrl": thumbnailUrl,
        ":generatedAt": new Date().toISOString(),
      },
    });

    try {
      await docClient.send(updateCommand);
      console.log("✅ DynamoDB更新完了");
    } catch (dbError) {
      console.error("❌ DynamoDB更新エラー:", dbError);
      return res.status(500).json({
        success: false,
        message: "Failed to update database",
        debug: {
          error: dbError.message,
          photoId: photoId,
          uploadedAt: videoRecord.uploadedAt,
          tableName: tableName,
        },
      });
    }

    // 一時ファイル削除
    console.log("🧹 一時ファイル削除中...");
    try {
      fs.unlinkSync(inputVideoPath);
      fs.unlinkSync(outputImagePath);
      console.log("✅ 一時ファイル削除完了");
    } catch (cleanupError) {
      console.error("⚠️ 一時ファイル削除エラー:", cleanupError);
    }

    console.log("🎉 サムネイル生成処理完全完了");

    res.json({
      success: true,
      message: "Thumbnail generated successfully",
      photoId: photoId,
      thumbnailUrl: thumbnailUrl,
      debug: {
        videoS3Key: videoS3Key,
        thumbnailS3Key: thumbnailS3Key,
        tableName: tableName,
        bucketName: bucketName,
        uploadedAt: videoRecord.uploadedAt,
        processedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("💥 サムネイル生成処理で予期しないエラー:", error);
    console.error("📊 エラースタック:", error.stack);

    res.status(500).json({
      success: false,
      message: "Internal server error during thumbnail generation",
      debug: {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

// ✅ 大幅改善版：実際のサムネイル生成関数
async function generateVideoThumbnail(videoS3Key, photoId) {
  try {
    console.log(`🔧 MediaConvert設定開始...`);

    // MediaConvertクライアントを初期化
    const client = await initializeMediaConvertClient();

    // MediaConvertロールARNを確認
    const roleArn = process.env.MEDIACONVERT_ROLE_ARN;
    if (!roleArn) {
      throw new Error("MEDIACONVERT_ROLE_ARN environment variable not set");
    }

    console.log(`🔑 MediaConvert Role ARN: ${roleArn}`);

    const inputPath = `s3://${process.env.STORAGE_WEDDINGPHOTOS_BUCKETNAME}/public/${videoS3Key}`;
    const outputPath = `s3://${process.env.STORAGE_WEDDINGPHOTOS_BUCKETNAME}/public/thumbnails/`;
    const outputFileName = `${photoId}_thumbnail`;

    console.log(`📥 入力パス: ${inputPath}`);
    console.log(`📤 出力パス: ${outputPath}${outputFileName}`);

    const jobSettings = {
      Role: roleArn,
      Settings: {
        Inputs: [
          {
            FileInput: inputPath,
            VideoSelector: {
              ColorSpace: "FOLLOW",
              Rotate: "AUTO",
            },
            TimecodeSource: "ZEROBASED",
            InputScanType: "AUTO",
          },
        ],
        OutputGroups: [
          {
            Name: "Thumbnail Output Group",
            OutputGroupSettings: {
              Type: "FILE_GROUP_SETTINGS",
              FileGroupSettings: {
                Destination: outputPath,
                DestinationSettings: {
                  S3Settings: {
                    AccessControl: {
                      CannedAcl: "PUBLIC_READ",
                    },
                  },
                },
              },
            },
            Outputs: [
              {
                NameModifier: outputFileName,
                ContainerSettings: {
                  Container: "RAW",
                },
                VideoDescription: {
                  CodecSettings: {
                    Codec: "FRAME_CAPTURE",
                    FrameCaptureSettings: {
                      FramerateNumerator: 1,
                      FramerateDenominator: 1,
                      MaxCaptures: 1,
                      Quality: 80,
                    },
                  },
                  Width: 800,
                  Height: 600,
                  RespondToAfd: "NONE",
                  ScalingBehavior: "DEFAULT",
                  TimecodeInsertion: "DISABLED",
                  AntiAlias: "ENABLED",
                  Sharpness: 50,
                },
              },
            ],
          },
        ],
        TimecodeConfig: {
          Source: "ZEROBASED",
        },
        AdAvailOffset: 0,
      },
      BillingTagsSource: "JOB",
      AccelerationSettings: {
        Mode: "DISABLED",
      },
      StatusUpdateInterval: "SECONDS_60",
      Priority: 0,
    };

    console.log(`🚀 MediaConvertジョブ作成中...`);

    const command = new CreateJobCommand(jobSettings);
    const response = await client.send(command);

    console.log(`✅ MediaConvert ジョブ作成成功: ${response.Job.Id}`);

    // 期待されるサムネイルファイル名
    const thumbnailKey = `thumbnails/${outputFileName}.0000000.jpg`;

    return {
      jobId: response.Job.Id,
      thumbnailKey: thumbnailKey,
    };
  } catch (error) {
    console.error("❌ MediaConvert エラー:", error);
    throw error;
  }
}

// ✅ SVGプレースホルダー生成関数（フォールバック用）
async function generatePlaceholderThumbnail(photoId) {
  try {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#grad)" />
  <circle cx="400" cy="300" r="80" fill="rgba(255,255,255,0.9)" />
  <polygon points="360,260 360,340 440,300" fill="#667eea" />
  <text x="400" y="420" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="32" font-family="Arial">VIDEO</text>
  <text x="400" y="460" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="24" font-family="Arial">${photoId.substring(0, 8)}</text>
</svg>`;
    return Buffer.from(svg, "utf8");
  } catch (error) {
    console.error("SVG generation error:", error);
    throw error;
  }
}

// ✅ MediaConvertジョブ状態確認エンドポイント（新規追加）
app.get("/photos/thumbnail-status/:jobId", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { jobId } = req.params;

    const client = await initializeMediaConvertClient();

    const command = new GetJobCommand({ Id: jobId });
    const response = await client.send(command);

    const job = response.Job;
    const status = job.Status;

    console.log(`📊 ジョブ ${jobId} ステータス: ${status}`);

    res.json({
      success: true,
      jobId: jobId,
      status: status,
      progress: job.JobPercentComplete || 0,
      createdAt: job.CreatedAt,
      finishedAt: job.FinishedAt,
    });
  } catch (error) {
    console.error("Error checking job status:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ✅ デバッグ用：テーブル構造確認エンドポイント（強化版）
app.get("/debug/photo/:photoId", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { photoId } = req.params;

    console.log(`🔍 デバッグ: photoId=${photoId} のテーブル構造確認`);

    const results = {};

    // 1. GetCommandで試行
    try {
      console.log(`🔍 複合キーテーブル対応でphotoId=${photoId}を検索中...`);

      // ScanCommandを使用してphotoIdでフィルタリング
      const scanCommand = new ScanCommand({
        TableName: process.env.STORAGE_PHOTOS_NAME,
        FilterExpression: "photoId = :photoId",
        ExpressionAttributeValues: {
          ":photoId": photoId,
        },
        Limit: 1,
      });

      const scanResult = await docClient.send(scanCommand);
      const items = scanResult.Items || [];

      if (items.length > 0) {
        existingPhoto = items[0];
        console.log(`✅ 写真レコード発見: photoId=${existingPhoto.photoId}, uploadedAt=${existingPhoto.uploadedAt}`);
      } else {
        console.error(`❌ 写真が見つかりません: photoId=${photoId}`);
        return res.status(404).json({
          success: false,
          message: `Photo not found: ${photoId}`,
        });
      }
      results.getCommand = {
        found: !!getResult.Item,
        item: getResult.Item || null,
      };
      console.log(`GetCommand結果: ${!!getResult.Item ? "発見" : "未発見"}`);
    } catch (getError) {
      results.getCommand = {
        error: getError.message,
        errorName: getError.name,
      };
      console.log(`GetCommandエラー: ${getError.message}`);
    }

    // 2. Scanで検索
    try {
      const scanCommand = new ScanCommand({
        TableName: process.env.STORAGE_PHOTOS_NAME,
        FilterExpression: "photoId = :photoId",
        ExpressionAttributeValues: {
          ":photoId": photoId,
        },
        Limit: 5,
      });

      const scanResult = await docClient.send(scanCommand);
      results.scanCommand = {
        found: (scanResult.Items || []).length > 0,
        items: scanResult.Items || [],
        count: (scanResult.Items || []).length,
      };
      console.log(`Scan結果: ${(scanResult.Items || []).length}件発見`);
    } catch (scanError) {
      results.scanCommand = {
        error: scanError.message,
        errorName: scanError.name,
      };
      console.log(`Scanエラー: ${scanError.message}`);
    }

    // 3. テーブル全体の最初の5件を取得（構造把握用）
    try {
      const sampleScanCommand = new ScanCommand({
        TableName: process.env.STORAGE_PHOTOS_NAME,
        Limit: 5,
      });

      const sampleResult = await docClient.send(sampleScanCommand);
      results.sampleItems = {
        count: (sampleResult.Items || []).length,
        items: (sampleResult.Items || []).map((item) => ({
          photoId: item.photoId,
          albumId: item.albumId,
          keys: Object.keys(item),
        })),
      };
      console.log(`サンプルアイテム: ${(sampleResult.Items || []).length}件取得`);
    } catch (sampleError) {
      results.sampleItems = {
        error: sampleError.message,
      };
    }

    res.json({
      success: true,
      photoId: photoId,
      tableName: process.env.STORAGE_PHOTOS_NAME,
      results: results,
      recommendations: generateRecommendations(results),
    });
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      tableName: process.env.STORAGE_PHOTOS_NAME,
    });
  }
});

// ✅ デバッグ結果の推奨事項生成
function generateRecommendations(results) {
  const recommendations = [];

  if (results.getCommand?.error) {
    if (results.getCommand.errorName === "ValidationException") {
      recommendations.push("テーブルが複合キー（パーティションキー+ソートキー）を使用している可能性があります");
    }
  }

  if (results.scanCommand?.found && !results.getCommand?.found) {
    recommendations.push("レコードは存在しますが、GetCommandでは取得できません。キー構造を確認してください");
  }

  if (results.sampleItems?.items?.length > 0) {
    const sampleKeys = results.sampleItems.items[0]?.keys || [];
    if (sampleKeys.includes("albumId")) {
      recommendations.push("albumIdとphotoIdの複合キーを試してください");
    }
  }

  return recommendations;
}

// amplify/backend/function/weddingPhotosFunction/src/app.js
// 以下のエンドポイントを追加

// ✅ サムネイル用署名付きURL生成（軽量）
app.post("/photos/thumbnail-upload-url", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { photoId, fileName, contentType } = req.body;

    if (!photoId || !fileName) {
      return res.status(400).json({
        success: false,
        message: "photoId and fileName are required",
      });
    }

    console.log(`📤 サムネイル署名付きURL生成: ${photoId} - ${fileName}`);

    // S3キー生成
    const s3Key = `thumbnails/${fileName}`;

    // バケット名取得
    let bucketName = process.env.STORAGE_WEDDINGPHOTOS_BUCKETNAME;
    if (!bucketName) {
      bucketName = "wedding3171c17ab5234e0fbf03519b4e2eab93e48b3-dev";
    }

    // 署名付きURL生成
    const s3Params = {
      Bucket: bucketName,
      Key: `public/${s3Key}`,
      ContentType: contentType || "image/jpeg",
      Expires: 300, // 5分
    };

    const uploadURL = s3.getSignedUrl("putObject", s3Params);
    const thumbnailUrl = `https://${bucketName}.s3.ap-northeast-1.amazonaws.com/public/${s3Key}`;

    console.log(`✅ 署名付きURL生成完了: ${s3Key}`);

    res.json({
      success: true,
      uploadURL: uploadURL,
      thumbnailUrl: thumbnailUrl,
      s3Key: s3Key,
      expiresIn: 300,
    });
  } catch (error) {
    console.error("Error generating thumbnail upload URL:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ✅ DynamoDB サムネイルURL更新（軽量）
app.post("/photos/update-thumbnail", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { photoId, thumbnailUrl, uploadedAt } = req.body;

    if (!photoId || !thumbnailUrl) {
      return res.status(400).json({
        success: false,
        message: "photoId and thumbnailUrl are required",
      });
    }

    console.log(`💾 DynamoDB サムネイルURL更新: ${photoId}`);

    // テーブル名取得
    let tableName = process.env.STORAGE_WEDDINGPHOTOS_NAME || process.env.STORAGE_PHOTOS_NAME;
    if (!tableName) {
      tableName = "Photos-dev";
    }

    // レコード取得（複合キー対応）
    let videoRecord = null;

    // Method 1: uploadedAtがある場合はGetCommand
    if (uploadedAt) {
      try {
        const getCommand = new GetCommand({
          TableName: tableName,
          Key: {
            photoId: photoId,
            uploadedAt: uploadedAt,
          },
        });

        const getResult = await docClient.send(getCommand);
        if (getResult.Item) {
          videoRecord = getResult.Item;
          console.log("✅ GetCommandで動画レコード取得成功");
        }
      } catch (getError) {
        console.log("⚠️ GetCommandエラー、Scanにフォールバック");
      }
    }

    // Method 2: GetCommandで見つからない場合はScan
    if (!videoRecord) {
      const scanCommand = new ScanCommand({
        TableName: tableName,
        FilterExpression: "photoId = :photoId",
        ExpressionAttributeValues: {
          ":photoId": photoId,
        },
        Limit: 1,
      });

      const scanResult = await docClient.send(scanCommand);
      if (scanResult.Items && scanResult.Items.length > 0) {
        videoRecord = scanResult.Items[0];
        console.log("✅ Scanで動画レコード取得成功");
      }
    }

    if (!videoRecord) {
      return res.status(404).json({
        success: false,
        message: "Video record not found",
      });
    }

    // DynamoDB更新
    const updateCommand = new UpdateCommand({
      TableName: tableName,
      Key: {
        photoId: photoId,
        uploadedAt: videoRecord.uploadedAt,
      },
      UpdateExpression: "SET thumbnailUrl = :thumbnailUrl, thumbnailGeneratedAt = :generatedAt, processingStatus = :status",
      ExpressionAttributeValues: {
        ":thumbnailUrl": thumbnailUrl,
        ":generatedAt": new Date().toISOString(),
        ":status": "ready",
      },
    });

    await docClient.send(updateCommand);

    console.log(`✅ DynamoDB更新完了: ${photoId}`);

    res.json({
      success: true,
      message: "Thumbnail URL updated successfully",
      photoId: photoId,
      thumbnailUrl: thumbnailUrl,
    });
  } catch (error) {
    console.error("Error updating thumbnail URL:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ✅ S3ファイル削除用ヘルパーAPI（緊急時用）
app.delete("/photos/cleanup-s3/:s3Key", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { s3Key } = req.params;
    const { passcode } = req.body;

    if (!s3Key || !passcode) {
      return res.status(400).json({
        success: false,
        message: "s3Key and passcode are required",
      });
    }

    // ユーザー確認
    const userCheck = new GetCommand({
      TableName: process.env.STORAGE_WEDDINGUSERS_NAME,
      Key: { passcode: passcode },
    });

    const userResult = await docClient.send(userCheck);
    if (!userResult.Item) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // S3ファイル削除
    await s3
      .deleteObject({
        Bucket: process.env.STORAGE_WEDDINGPHOTOS_BUCKETNAME,
        Key: `public/${s3Key}`,
      })
      .promise();

    res.json({
      success: true,
      message: "S3 file deleted successfully",
      s3Key: s3Key,
    });
  } catch (error) {
    console.error("Error cleaning up S3:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**********************
 * 写真関連API *
 **********************/

// アルバム一覧取得（isPublic フィルタリング対応）
app.get("/photos/albums", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    console.log("Photos table name:", process.env.STORAGE_PHOTOS_NAME);

    const command = new ScanCommand({
      TableName: process.env.STORAGE_PHOTOS_NAME,
    });

    const result = await docClient.send(command);
    const allPhotos = result.Items || [];

    // isPublic が true または未設定（既存データ）の写真のみを取得
    const photos = allPhotos.filter((photo) => photo.isPublic !== false);

    // アルバムごとにグループ化
    const albumsMap = new Map();

    photos.forEach((photo) => {
      const albumId = photo.albumId || photo.photoId; // 既存の単一写真は photoId をアルバムIDとして使用

      if (!albumsMap.has(albumId)) {
        albumsMap.set(albumId, {
          albumId: albumId,
          photos: [],
          mainPhoto: null,
          uploadedBy: photo.uploadedBy,
          uploaderName: photo.uploaderName,
          uploadedAt: photo.uploadedAt,
          caption: "",
          totalPhotos: 1,
        });
      }

      const album = albumsMap.get(albumId);
      album.photos.push(photo);

      // メイン写真を設定（isMainPhoto が true、または最初の写真）
      if (photo.isMainPhoto || photo.photoIndex === 0 || (!album.mainPhoto && album.photos.length === 1)) {
        album.mainPhoto = photo;
        album.caption = photo.caption || "";
        album.uploadedAt = photo.uploadedAt;
      }

      // 最新のアップロード時間を保持
      if (photo.uploadedAt > album.uploadedAt) {
        album.uploadedAt = photo.uploadedAt;
      }

      album.totalPhotos = album.photos.length;
    });

    // アルバム配列に変換してソート
    const albums = Array.from(albumsMap.values()).sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    // 各アルバム内の写真をphotoIndexでソート
    albums.forEach((album) => {
      album.photos.sort((a, b) => (a.photoIndex || 0) - (b.photoIndex || 0));
    });

    res.json({
      success: true,
      albums: albums,
    });
  } catch (error) {
    console.error("Error getting albums:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 自分の投稿写真一覧取得（公開/非公開切り替え用）
app.get("/photos/user/:passcode/my-photos", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { passcode } = req.params;

    const command = new ScanCommand({
      TableName: process.env.STORAGE_PHOTOS_NAME,
      FilterExpression: "uploadedBy = :uploadedBy",
      ExpressionAttributeValues: {
        ":uploadedBy": passcode,
      },
    });

    const result = await docClient.send(command);
    const photos = result.Items || [];

    // アルバムごとにグループ化
    const albumsMap = new Map();

    photos.forEach((photo) => {
      const albumId = photo.albumId || photo.photoId;

      if (!albumsMap.has(albumId)) {
        albumsMap.set(albumId, {
          albumId: albumId,
          photos: [],
          mainPhoto: null,
          uploadedBy: photo.uploadedBy,
          uploaderName: photo.uploaderName,
          uploadedAt: photo.uploadedAt,
          caption: photo.caption || "",
          totalPhotos: 1,
          isPublic: photo.isPublic !== false, // デフォルトは公開
        });
      }

      const album = albumsMap.get(albumId);
      album.photos.push(photo);

      // メイン写真を設定
      if (photo.isMainPhoto || photo.photoIndex === 0 || (!album.mainPhoto && album.photos.length === 1)) {
        album.mainPhoto = photo;
        album.isPublic = photo.isPublic !== false;
      }

      album.totalPhotos = album.photos.length;
    });

    const albums = Array.from(albumsMap.values()).sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    // 各アルバム内の写真をphotoIndexでソート
    albums.forEach((album) => {
      album.photos.sort((a, b) => (a.photoIndex || 0) - (b.photoIndex || 0));
    });

    res.json({
      success: true,
      albums: albums,
    });
  } catch (error) {
    console.error("Error getting user photos:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 写真の公開/非公開切り替え
app.put("/photos/album/:albumId/visibility", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { albumId } = req.params;
    const { isPublic, passcode } = req.body;

    if (typeof isPublic !== "boolean" || !passcode) {
      return res.status(400).json({
        success: false,
        message: "isPublic (boolean) and passcode are required",
      });
    }

    // まず、そのアルバムの写真を取得
    const scanCommand = new ScanCommand({
      TableName: process.env.STORAGE_PHOTOS_NAME,
      FilterExpression: "(albumId = :albumId OR photoId = :albumId) AND uploadedBy = :uploadedBy",
      ExpressionAttributeValues: {
        ":albumId": albumId,
        ":uploadedBy": passcode,
      },
    });

    const result = await docClient.send(scanCommand);
    const photos = result.Items || [];

    if (photos.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Album not found or not owned by user",
      });
    }

    // 各写真のisPublicを更新
    const updatePromises = photos.map(async (photo) => {
      const updateCommand = new PutCommand({
        TableName: process.env.STORAGE_PHOTOS_NAME,
        Item: {
          ...photo,
          isPublic: isPublic,
          updatedAt: new Date().toISOString(),
        },
      });
      return docClient.send(updateCommand);
    });

    await Promise.all(updatePromises);

    res.json({
      success: true,
      message: `Album ${isPublic ? "published" : "unpublished"} successfully`,
      updatedPhotos: photos.length,
    });
  } catch (error) {
    console.error("Error updating album visibility:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**********************
 * お気に入り機能API *
 **********************/

// ✅ 修正：お気に入り追加/削除
app.post("/favorites", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { userId, targetType, targetId, action } = req.body;

    if (!userId || !targetType || !targetId || !action) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: userId, targetType, targetId, action",
      });
    }

    const favoriteId = `${userId}_${targetType}_${targetId}`;

    if (action === "add") {
      // お気に入り追加
      const putCommand = new PutCommand({
        TableName: process.env.STORAGE_FAVORITES_NAME,
        Item: {
          favoriteId: favoriteId,
          userId: userId,
          targetType: targetType, // "album" または "photo"
          targetId: targetId,
          createdAt: new Date().toISOString(),
        },
        ConditionExpression: "attribute_not_exists(favoriteId)", // 重複防止
      });

      try {
        await docClient.send(putCommand);
        res.json({
          success: true,
          message: "お気に入りに追加しました",
          favoriteId: favoriteId,
        });
      } catch (error) {
        if (error.name === "ConditionalCheckFailedException") {
          res.status(409).json({
            success: false,
            message: "すでにお気に入りに登録されています",
          });
        } else {
          throw error;
        }
      }
    } else if (action === "remove") {
      // お気に入り削除
      const deleteCommand = new DeleteCommand({
        TableName: process.env.STORAGE_FAVORITES_NAME,
        Key: {
          favoriteId: favoriteId,
        },
      });

      await docClient.send(deleteCommand);
      res.json({
        success: true,
        message: "お気に入りから削除しました",
      });
    } else {
      res.status(400).json({
        success: false,
        message: "action must be 'add' or 'remove'",
      });
    }
  } catch (error) {
    console.error("Error handling favorite:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// バッチお気に入り情報取得API
app.post("/favorites/batch", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { userId, albumIds } = req.body;

    console.log(`📊 バッチAPI呼び出し: userId=${userId}, albumIds=${albumIds?.length}件`);

    if (!albumIds || !Array.isArray(albumIds) || albumIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "albumIds array is required",
      });
    }

    if (albumIds.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Maximum 100 albums per batch",
      });
    }

    const results = {};

    // ✅ 1. お気に入り数をバッチ取得（GSIクエリ使用）
    console.log(`🔢 お気に入り数を取得中...`);
    const countPromises = albumIds.map(async (albumId) => {
      try {
        const queryCommand = new QueryCommand({
          TableName: process.env.STORAGE_FAVORITES_NAME,
          IndexName: "targetType-targetId-index",
          KeyConditionExpression: "targetType = :targetType AND targetId = :targetId",
          ExpressionAttributeValues: {
            ":targetType": "album",
            ":targetId": albumId,
          },
          Select: "COUNT",
        });
        const result = await docClient.send(queryCommand);
        return { albumId, count: result.Count || 0 };
      } catch (error) {
        console.error(`Count error for album ${albumId}:`, error);
        return { albumId, count: 0 };
      }
    });

    // ✅ 2. ユーザーのお気に入り状態をBatchGetItemで取得
    let favoriteStatuses = {};
    if (userId) {
      console.log(`👤 ユーザー ${userId} のお気に入り状態を取得中...`);
      try {
        // favoriteIdのリストを作成
        const favoriteKeys = albumIds.map((albumId) => ({
          favoriteId: `${userId}_album_${albumId}`,
        }));

        console.log(`🔑 検索するfavoriteId例: ${favoriteKeys[0]?.favoriteId}`);

        // BatchGetItemは最大100件まで処理可能
        const chunks = [];
        for (let i = 0; i < favoriteKeys.length; i += 100) {
          chunks.push(favoriteKeys.slice(i, i + 100));
        }

        for (const chunk of chunks) {
          console.log(`📦 BatchGetItem実行: ${chunk.length}件`);

          const batchGetCommand = new BatchGetCommand({
            RequestItems: {
              [process.env.STORAGE_FAVORITES_NAME]: {
                Keys: chunk,
                ProjectionExpression: "favoriteId, targetId, userId",
              },
            },
          });

          const batchResult = await docClient.send(batchGetCommand);
          const items = batchResult.Responses?.[process.env.STORAGE_FAVORITES_NAME] || [];

          console.log(`📖 BatchGetItem結果: ${items.length}件のお気に入りを発見`);
          console.log(
            `📖 発見されたアイテム:`,
            items.map((item) => ({
              favoriteId: item.favoriteId,
              targetId: item.targetId,
            }))
          );

          // 各アイテムをfavoriteStatusesに追加
          items.forEach((item) => {
            favoriteStatuses[item.targetId] = true;
            console.log(`⭐ ${item.targetId.substring(0, 8)}... はお気に入り済み`);
          });
        }

        console.log(`✅ BatchGetItem完了。お気に入り状態:`, favoriteStatuses);
      } catch (error) {
        console.error("❌ Batch favorite status error:", error);
      }
    }

    // ✅ 3. カウント結果を待機
    const countResults = await Promise.allSettled(countPromises);

    // ✅ 4. 結果をまとめる
    countResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        const { albumId, count } = result.value;
        const isFavorite = favoriteStatuses[albumId] || false;

        results[albumId] = {
          favoriteCount: count,
          isFavorite: isFavorite,
        };

        console.log(`📊 ${albumId.substring(0, 8)}...: count=${count}, isFavorite=${isFavorite}`);
      } else {
        // エラーの場合のデフォルト値
        results[albumIds[index]] = {
          favoriteCount: 0,
          isFavorite: false,
        };
      }
    });

    console.log(`✅ バッチ処理完了: ${Object.keys(results).length}件の結果を返却`);

    // 📊 最終結果のサマリー
    const totalFavorites = Object.values(results).filter((r) => r.isFavorite).length;
    console.log(`📈 最終結果: ${totalFavorites}個のお気に入りを検出`);

    res.json({
      success: true,
      results: results,
      totalAlbums: albumIds.length,
      debug: {
        userId: userId,
        totalFavorites: totalFavorites,
      },
    });
  } catch (error) {
    console.error("❌ Error in batch favorites:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ===============================================
// 🧪 デバッグ用：個別テスト用エンドポイント（開発時のみ）
// ===============================================

app.get("/favorites/debug/:userId/:albumId", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { userId, albumId } = req.params;

    const favoriteId = `${userId}_album_${albumId}`;

    console.log(`🔍 デバッグ: favoriteId=${favoriteId}`);

    // 直接GetItemで確認
    const getCommand = new GetCommand({
      TableName: process.env.STORAGE_FAVORITES_NAME,
      Key: { favoriteId: favoriteId },
    });

    const result = await docClient.send(getCommand);

    res.json({
      success: true,
      favoriteId: favoriteId,
      exists: !!result.Item,
      item: result.Item || null,
    });
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ✅ 修正：ユーザーのお気に入り一覧取得（GSI使用）
app.get("/favorites/user/:userId", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { userId } = req.params;

    // ✅ GSI "userId-index" を使用した効率的なクエリ
    const queryCommand = new QueryCommand({
      TableName: process.env.STORAGE_FAVORITES_NAME,
      IndexName: "userId-index", // GSI使用
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
      ScanIndexForward: false, // 新しい順にソート
    });

    const result = await docClient.send(queryCommand);
    const favorites = result.Items || [];

    res.json({
      success: true,
      favorites: favorites,
    });
  } catch (error) {
    console.error("Error getting user favorites:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// S3プリサインドURL生成
app.get("/photos/presigned-url", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { key } = req.query;

    if (!key) {
      return res.status(400).json({
        success: false,
        message: "S3 key is required",
      });
    }

    const command = new GetObjectCommand({
      Bucket: process.env.STORAGE_WEDDINGPHOTOS_BUCKETNAME,
      Key: key,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    res.json({
      success: true,
      signedUrl: signedUrl,
    });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// OPTIONSリクエストの処理
app.options("/*", function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.send();
});

app.listen(3000, function () {
  console.log("App started");
});

module.exports = app;
