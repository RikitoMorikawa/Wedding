const express = require("express");
const bodyParser = require("body-parser");
const awsServerlessExpressMiddleware = require("aws-serverless-express/middleware");
const { TransactWriteCommand } = require("@aws-sdk/lib-dynamodb");

// ✅ 必要なimport（S3とDynamoDB両方）
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, QueryCommand, GetCommand, PutCommand, DeleteCommand, BatchGetCommand } = require("@aws-sdk/lib-dynamodb");

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

// ✅ バッチ署名付きURL生成
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

    // ファイル数制限チェック
    if (files.length > 20) {
      return res.status(400).json({
        success: false,
        message: "Maximum 20 files allowed",
      });
    }

    // 合計サイズチェック（100MB制限）
    const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB
    let totalSize = 0;
    
    for (const file of files) {
      totalSize += file.size || 0;
    }

    if (totalSize > MAX_TOTAL_SIZE) {
      return res.status(400).json({
        success: false,
        message: `Total file size exceeds 100MB limit. Current: ${(totalSize / (1024 * 1024)).toFixed(1)}MB`,
      });
    }

    const allowedPhotoTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    const allowedVideoTypes = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"];
    const allAllowedTypes = [...allowedPhotoTypes, ...allowedVideoTypes];

    const uploadUrls = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // ファイルタイプ検証
      if (!allAllowedTypes.includes(file.fileType)) {
        return res.status(400).json({
          success: false,
          message: `Unsupported file type: ${file.fileType}`,
        });
      }

      // 個別ファイルサイズチェック
      const isVideo = allowedVideoTypes.includes(file.fileType);
      const maxSize = isVideo ? 50 * 1024 * 1024 : 8 * 1024 * 1024; // 50MB for video, 8MB for photo
      
      if (file.size > maxSize) {
        return res.status(400).json({
          success: false,
          message: `File ${file.fileName} exceeds size limit (${isVideo ? '50MB' : '8MB'})`,
        });
      }

      // S3キー生成
      const timestamp = Date.now();
      const s3Key = `${isVideo ? "videos" : "photos"}/${timestamp}_${i}_${file.fileName}`;
      
      const s3Params = {
        Bucket: process.env.STORAGE_WEDDINGPHOTOS_BUCKETNAME,
        Key: `public/${s3Key}`,
        ContentType: file.fileType,
        Expires: 600, // 10分（バッチ処理のため延長）
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
      totalSize: totalSize,
      expiresIn: 600, // 10分
    });

  } catch (error) {
    console.error("Error creating batch upload URLs:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ✅ バッチアルバム保存（トランザクション対応）
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
      passcode 
    } = req.body;

    // バリデーション
    if (!albumId || !uploadedBy || !uploaderName || !files || !Array.isArray(files)) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: albumId, uploadedBy, uploaderName, files",
      });
    }

    if (files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "files array cannot be empty",
      });
    }

    if (files.length > 20) {
      return res.status(400).json({
        success: false,
        message: "Maximum 20 files allowed",
      });
    }

    // ユーザー存在確認
    const userCheck = new GetCommand({
      TableName: process.env.STORAGE_WEDDINGUSERS_NAME,
      Key: { passcode: passcode }
    });

    const userResult = await docClient.send(userCheck);
    if (!userResult.Item) {
      return res.status(403).json({
        success: false,
        message: "Invalid user",
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
    const failedFiles = [];

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
                caption: globalIndex === 0 ? (caption || "") : "", // メイン写真のみキャプション
                s3Key: file.s3Key,
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
              ConditionExpression: "attribute_not_exists(photoId)"
            }
          };
        });

        // トランザクション実行
        const transactCommand = new TransactWriteCommand({
          TransactItems: transactItems
        });

        await docClient.send(transactCommand);
        
        // 成功したファイルを記録
        batch.forEach(file => {
          savedFiles.push({
            photoId: file.photoId,
            s3Key: file.s3Key,
            fileName: file.fileName
          });
        });

        console.log(`✅ Batch ${batchIndex + 1}/${batches.length} saved successfully (${batch.length} files)`);
        
        // バッチ間で少し待機（DynamoDB負荷軽減）
        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // 全バッチ成功
      res.json({
        success: true,
        message: `Album saved successfully with ${files.length} files`,
        albumId: albumId,
        totalFiles: files.length,
        savedFiles: savedFiles.length,
        failedFiles: failedFiles.length,
        batches: batches.length,
      });

    } catch (transactionError) {
      console.error("Transaction failed:", transactionError);
      
      // トランザクション失敗時のS3クリーンアップを並行実行
      const cleanupPromises = savedFiles.map(async (file) => {
        try {
          await s3.deleteObject({
            Bucket: process.env.STORAGE_WEDDINGPHOTOS_BUCKETNAME,
            Key: `public/${file.s3Key}`
          }).promise();
          console.log(`🧹 Cleaned up S3 file: ${file.s3Key}`);
        } catch (cleanupError) {
          console.error(`❌ Failed to cleanup S3 file ${file.s3Key}:`, cleanupError);
        }
      });

      // クリーンアップを並行実行（レスポンスをブロックしない）
      Promise.all(cleanupPromises).catch(console.error);

      // エラーレスポンス
      if (transactionError.name === 'ConditionalCheckFailedException') {
        res.status(409).json({
          success: false,
          message: "Some files already exist. Please try again.",
          error: "DUPLICATE_FILES",
          cleanedUp: savedFiles.length,
        });
      } else if (transactionError.name === 'ProvisionedThroughputExceededException') {
        res.status(503).json({
          success: false,
          message: "Database is temporarily overloaded. Please try again in a few seconds.",
          error: "THROUGHPUT_EXCEEDED",
          cleanedUp: savedFiles.length,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Failed to save album",
          error: transactionError.message,
          cleanedUp: savedFiles.length,
        });
      }
    }

  } catch (error) {
    console.error("Error in batch save album:", error);
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
      Key: { passcode: passcode }
    });

    const userResult = await docClient.send(userCheck);
    if (!userResult.Item) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // S3ファイル削除
    await s3.deleteObject({
      Bucket: process.env.STORAGE_WEDDINGPHOTOS_BUCKETNAME,
      Key: `public/${s3Key}`
    }).promise();

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
