const express = require("express");
const bodyParser = require("body-parser");
const awsServerlessExpressMiddleware = require("aws-serverless-express/middleware");

// ✅ 必要なimport（S3とDynamoDB両方）
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, QueryCommand, GetCommand, PutCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

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
 * 写真・動画アップロード機能 *
 **********************/

// ✅ アップロード用署名付きURL生成
app.post("/photos/upload-url", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { fileName, fileType, passcode, mediaType = "photo" } = req.body;

    if (!fileName || !fileType || !passcode) {
      return res.status(400).json({
        success: false,
        message: "fileName, fileType, and passcode are required",
      });
    }

    // ファイルタイプの検証
    const allowedPhotoTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    const allowedVideoTypes = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"];
    const allAllowedTypes = [...allowedPhotoTypes, ...allowedVideoTypes];

    if (!allAllowedTypes.includes(fileType)) {
      return res.status(400).json({
        success: false,
        message: "Unsupported file type",
      });
    }

    const isVideo = allowedVideoTypes.includes(fileType);

    // S3 署名付きURL生成
    const s3Key = `${isVideo ? "videos" : "photos"}/${Date.now()}_${fileName}`;
    const s3Params = {
      Bucket: process.env.STORAGE_WEDDINGPHOTOS_BUCKETNAME,
      Key: `public/${s3Key}`, // S3アップロード用にはpublicを付ける
      ContentType: fileType,
      Expires: 300, // 5分
    };

    const uploadURL = s3.getSignedUrl("putObject", s3Params);

    res.json({
      success: true,
      uploadURL: uploadURL,
      s3Key: s3Key, // DynamoDBにはpublicプレフィックスなしで保存
      mediaType: isVideo ? "video" : "photo",
    });
  } catch (error) {
    console.error("Error creating upload URL:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ✅ アルバム保存エンドポイント
app.post("/photos/save-album", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { photoId, albumId, uploadedBy, caption, s3Key, uploaderName, uploadedAt, photoIndex, totalPhotos, isMainPhoto, mediaType, fileType } = req.body;

    if (!photoId || !uploadedBy || !s3Key) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: photoId, uploadedBy, s3Key",
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
        mediaType: mediaType || "photo",
        fileType: fileType || "image/jpeg",
        isPublic: true, // デフォルトで公開
      },
    });

    await docClient.send(putCommand);

    res.json({
      success: true,
      message: "Media saved successfully",
      photoId: photoId,
      mediaType: mediaType || "photo",
    });
  } catch (error) {
    console.error("Error saving media:", error);
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

// ✅ 修正：特定の対象のお気に入り数を取得（GSI使用）
app.get("/favorites/count/:targetType/:targetId", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { targetType, targetId } = req.params;

    // ✅ GSI "targetType-targetId-index" を使用した効率的なクエリ
    const queryCommand = new QueryCommand({
      TableName: process.env.STORAGE_FAVORITES_NAME,
      IndexName: "targetType-targetId-index", // GSI使用
      KeyConditionExpression: "targetType = :targetType AND targetId = :targetId",
      ExpressionAttributeValues: {
        ":targetType": targetType,
        ":targetId": targetId,
      },
      Select: "COUNT", // 件数のみ取得で高速化
    });

    const result = await docClient.send(queryCommand);
    const count = result.Count || 0;

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

// ✅ 修正：特定ユーザーの特定対象へのお気に入り状態をチェック
app.get("/favorites/check/:userId/:targetType/:targetId", async function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");

  try {
    const { userId, targetType, targetId } = req.params;
    const favoriteId = `${userId}_${targetType}_${targetId}`;

    // ✅ プライマリキーでの直接取得（既に効率的）
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
