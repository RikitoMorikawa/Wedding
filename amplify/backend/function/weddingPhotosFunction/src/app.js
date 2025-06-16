const express = require("express");
const bodyParser = require("body-parser");
const awsServerlessExpressMiddleware = require("aws-serverless-express/middleware");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, DeleteCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

// declare a new express app
const app = express();
app.use(bodyParser.json());
app.use(awsServerlessExpressMiddleware.eventContext());

// 1. 必要なライブラリを追加（ファイルの上部に追加）
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

// Enable CORS for all methods
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  next();
});

// DynamoDB setup
const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

/**********************
 * 既存のAPIエンドポイント *
 **********************/

// ユーザー情報取得
app.get("/photos/user/:passcode", async function (req, res) {
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
    const photos = allPhotos.filter(photo => photo.isPublic !== false);

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

    if (typeof isPublic !== 'boolean' || !passcode) {
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
      message: `Album ${isPublic ? 'published' : 'unpublished'} successfully`,
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

// お気に入り追加/削除
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

// ユーザーのお気に入り一覧取得
app.get("/favorites/user/:userId", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { userId } = req.params;

    // Favoritesテーブルから該当ユーザーのお気に入りを取得
    // GSIを使用しない場合はScanを使用
    const scanCommand = new ScanCommand({
      TableName: process.env.STORAGE_FAVORITES_NAME,
      FilterExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
    });

    const result = await docClient.send(scanCommand);
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

// 特定の対象のお気に入り数を取得
app.get("/favorites/count/:targetType/:targetId", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { targetType, targetId } = req.params;

    const scanCommand = new ScanCommand({
      TableName: process.env.STORAGE_FAVORITES_NAME,
      FilterExpression: "targetType = :targetType AND targetId = :targetId",
      ExpressionAttributeValues: {
        ":targetType": targetType,
        ":targetId": targetId,
      },
    });

    const result = await docClient.send(scanCommand);
    const count = result.Items ? result.Items.length : 0;

    res.json({
      success: true,
      count: count,
    });
  } catch (error) {
    console.error("Error getting favorite count:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 特定ユーザーの特定対象へのお気に入り状態をチェック
app.get("/favorites/check/:userId/:targetType/:targetId", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { userId, targetType, targetId } = req.params;
    const favoriteId = `${userId}_${targetType}_${targetId}`;

    const getCommand = new GetCommand({
      TableName: process.env.STORAGE_FAVORITES_NAME,
      Key: {
        favoriteId: favoriteId,
      },
    });

    const result = await docClient.send(getCommand);
    const isFavorite = !!result.Item;

    res.json({
      success: true,
      isFavorite: isFavorite,
    });
  } catch (error) {
    console.error("Error checking favorite status:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 写真アルバム保存エンドポイント
// 2. 写真アルバム保存エンドポイントを動画対応に修正
app.post("/photos/save-album", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const {
      photoId,
      albumId,
      uploadedBy,
      caption,
      s3Key,
      uploaderName,
      uploadedAt,
      photoIndex,
      totalPhotos,
      isMainPhoto,
      mediaType, // 追加
      fileType   // 追加
    } = req.body;

    if (!photoId || !uploadedBy || !s3Key) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: photoId, uploadedBy, s3Key"
      });
    }

    const putCommand = new PutCommand({
      TableName: process.env.STORAGE_PHOTOS_NAME,
      Item: {
        photoId: photoId,
        albumId: albumId || photoId,
        uploadedBy: uploadedBy,
        uploaderName: uploaderName,
        caption: caption || "",
        s3Key: s3Key,
        uploadedAt: uploadedAt,
        photoIndex: photoIndex || 0,
        totalPhotos: totalPhotos || 1,
        isMainPhoto: isMainPhoto || false,
        mediaType: mediaType || 'photo', // 追加
        fileType: fileType || 'image/jpeg' // 追加
      }
    });

    await docClient.send(putCommand);

    res.json({
      success: true,
      message: "Media saved successfully",
      photoId: photoId,
      mediaType: mediaType || 'photo'
    });

  } catch (error) {
    console.error("Error saving media:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 写真・動画アップロード用の署名付きURL生成
app.post("/photos/upload-url", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { fileName, fileType, passcode, mediaType = 'photo' } = req.body;

    if (!fileName || !fileType || !passcode) {
      return res.status(400).json({
        success: false,
        message: "fileName, fileType, and passcode are required",
      });
    }

    // ファイルタイプの検証
    const allowedPhotoTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const allowedVideoTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
    const allAllowedTypes = [...allowedPhotoTypes, ...allowedVideoTypes];

    if (!allAllowedTypes.includes(fileType)) {
      return res.status(400).json({
        success: false,
        message: "Unsupported file type",
      });
    }

    // ファイルサイズ制限
    const maxPhotoSize = 10 * 1024 * 1024; // 10MB
    const maxVideoSize = 100 * 1024 * 1024; // 100MB
    const isVideo = allowedVideoTypes.includes(fileType);
    const maxSize = isVideo ? maxVideoSize : maxPhotoSize;

    // S3 署名付きURL生成（publicプレフィックスなし）
    const s3Key = `${isVideo ? 'videos' : 'photos'}/${Date.now()}_${fileName}`;
    const s3Params = {
      Bucket: process.env.STORAGE_WEDDINGPHOTOS_BUCKETNAME,
      Key: `public/${s3Key}`, // S3アップロード用にはpublicを付ける
      ContentType: fileType,
      Expires: 300, // 5分
    };

    const uploadURL = s3.getSignedUrl('putObject', s3Params);

    res.json({
      success: true,
      uploadURL: uploadURL,
      s3Key: s3Key, // DynamoDBにはpublicプレフィックスなしで保存
      mediaType: isVideo ? 'video' : 'photo'
    });

  } catch (error) {
    console.error("Error creating upload URL:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 写真・動画一覧取得（メディアタイプフィルタ付き）
app.get("/photos/media", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  
  try {
    const { mediaType, passcode } = req.query; // 'photo', 'video', または未指定（全て）

    let filterExpression = "isPublic <> :false";
    let expressionAttributeValues = {
      ":false": false
    };

    // mediaType でフィルタリング
    if (mediaType && (mediaType === 'photo' || mediaType === 'video')) {
      filterExpression += " AND mediaType = :mediaType";
      expressionAttributeValues[":mediaType"] = mediaType;
    }

    // 特定ユーザーの場合は非公開も含む
    if (passcode) {
      filterExpression = "(isPublic <> :false OR uploadedBy = :passcode)";
      expressionAttributeValues[":passcode"] = passcode;
      
      if (mediaType) {
        filterExpression += " AND mediaType = :mediaType";
      }
    }

    const command = new ScanCommand({
      TableName: process.env.STORAGE_PHOTOS_NAME,
      FilterExpression: filterExpression,
      ExpressionAttributeValues: expressionAttributeValues,
    });

    const result = await docClient.send(command);
    const allItems = result.Items || [];

    // S3 署名付きURL を生成
    const itemsWithUrls = await Promise.all(
      allItems.map(async (item) => {
        try {
          const getParams = {
            Bucket: process.env.STORAGE_WEDDINGPHOTOS_BUCKETNAME,
            Key: item.s3Key,
            Expires: 3600, // 1時間
          };

          const url = s3.getSignedUrl('getObject', getParams);

          return {
            ...item,
            url: url,
          };
        } catch (error) {
          console.error(`Error generating URL for item ${item.photoId}:`, error);
          return {
            ...item,
            url: null,
          };
        }
      })
    );

    // 新しい順にソート
    itemsWithUrls.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

    res.json({
      success: true,
      items: itemsWithUrls,
      count: itemsWithUrls.length,
    });

  } catch (error) {
    console.error("Error getting media:", error);
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
