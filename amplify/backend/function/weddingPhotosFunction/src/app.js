/* Amplify Params - DO NOT EDIT
	ENV
	REGION
	STORAGE_PHOTOS_ARN
	STORAGE_PHOTOS_NAME
	STORAGE_PHOTOS_STREAMARN
	STORAGE_WEDDINGPHOTOS_BUCKETNAME
	STORAGE_WEDDINGUSERS_ARN
	STORAGE_WEDDINGUSERS_NAME
	STORAGE_WEDDINGUSERS_STREAMARN
	STORAGE_FAVORITES_ARN
	STORAGE_FAVORITES_NAME
	STORAGE_FAVORITES_STREAMARN
Amplify Params - DO NOT EDIT */
const express = require("express");
const bodyParser = require("body-parser");
const awsServerlessExpressMiddleware = require("aws-serverless-express/middleware");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, DeleteCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

// DynamoDB setup
const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const app = express();
app.use(bodyParser.json());
app.use(awsServerlessExpressMiddleware.eventContext());

// Enable CORS for all methods
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "*");
  next();
});

// Get user info by passcode
app.get("/photos/user/:passcode", async function (req, res) {
  try {
    const { passcode } = req.params;

    console.log("Looking up user:", passcode);
    console.log("Table name:", process.env.STORAGE_WEDDINGUSERS_NAME);

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
      res.json({
        success: false,
        message: "User not found",
      });
    }
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Register new user
app.post("/photos/user", async function (req, res) {
  try {
    const { passcode, name } = req.body;

    if (!passcode || !name) {
      return res.status(400).json({
        success: false,
        message: "passcode and name are required",
      });
    }

    console.log("Registering user:", { passcode, name });
    console.log("Table name:", process.env.STORAGE_WEDDINGUSERS_NAME);

    const command = new PutCommand({
      TableName: process.env.STORAGE_WEDDINGUSERS_NAME,
      Item: {
        passcode: passcode,
        name: name,
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

// Save photo metadata to DynamoDB (legacy single photo)
app.post("/photos/save", async function (req, res) {
  try {
    const { photoId, uploadedBy, caption, s3Key, uploaderName } = req.body;

    if (!photoId || !uploadedBy || !s3Key) {
      return res.status(400).json({
        success: false,
        message: "photoId, uploadedBy, and s3Key are required",
      });
    }

    console.log("Saving photo metadata:", { photoId, uploadedBy, caption, s3Key, uploaderName });
    console.log("Photos table name:", process.env.STORAGE_PHOTOS_NAME);

    const command = new PutCommand({
      TableName: process.env.STORAGE_PHOTOS_NAME,
      Item: {
        photoId: photoId,
        uploadedAt: new Date().toISOString(),
        uploadedBy: uploadedBy,
        caption: caption || "",
        s3Key: s3Key,
        uploaderName: uploaderName || "",
        // レガシー形式のため、単一写真として扱う
        albumId: photoId, // 単一写真の場合はphotoIdをalbumIdとして使用
        photoIndex: 0,
        totalPhotos: 1,
        isMainPhoto: true,
      },
    });

    await docClient.send(command);

    res.json({
      success: true,
      message: "Photo metadata saved successfully",
    });
  } catch (error) {
    console.error("Error saving photo metadata:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Save album photos to DynamoDB
app.post("/photos/save-album", async function (req, res) {
  try {
    const { photoId, albumId, uploadedBy, caption, s3Key, uploaderName, uploadedAt, photoIndex, totalPhotos, isMainPhoto } = req.body;

    if (!photoId || !albumId || !uploadedBy || !s3Key) {
      return res.status(400).json({
        success: false,
        message: "photoId, albumId, uploadedBy, and s3Key are required",
      });
    }

    console.log("Saving album photo metadata:", {
      photoId,
      albumId,
      uploadedBy,
      caption,
      s3Key,
      uploaderName,
      photoIndex,
      totalPhotos,
      isMainPhoto,
    });
    console.log("Photos table name:", process.env.STORAGE_PHOTOS_NAME);

    const command = new PutCommand({
      TableName: process.env.STORAGE_PHOTOS_NAME,
      Item: {
        photoId: photoId,
        uploadedAt: uploadedAt,
        albumId: albumId,
        uploadedBy: uploadedBy,
        caption: caption || "",
        s3Key: s3Key,
        uploaderName: uploaderName || "",
        photoIndex: photoIndex || 0,
        totalPhotos: totalPhotos || 1,
        isMainPhoto: isMainPhoto || false,
      },
    });

    await docClient.send(command);

    res.json({
      success: true,
      message: "Album photo metadata saved successfully",
    });
  } catch (error) {
    console.error("Error saving album photo metadata:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get all photos grouped by albums
app.get("/photos/albums", async function (req, res) {
  try {
    console.log("Getting photos grouped by albums");
    console.log("Photos table name:", process.env.STORAGE_PHOTOS_NAME);

    const command = new ScanCommand({
      TableName: process.env.STORAGE_PHOTOS_NAME,
    });

    const result = await docClient.send(command);
    const photos = result.Items || [];

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

// アルバムにお気に入り追加
app.post("/albums/:albumId/favorite", async function (req, res) {
  try {
    const { albumId } = req.params;
    const userId = req.headers["user-id"];

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
      });
    }

    const favoriteId = `${albumId}-${userId}`;

    // 既にお気に入りに追加されているかチェック
    const checkCommand = new GetCommand({
      TableName: process.env.STORAGE_FAVORITES_NAME,
      Key: { favoriteId },
    });

    const existingFavorite = await docClient.send(checkCommand);

    if (existingFavorite.Item) {
      return res.status(409).json({
        success: false,
        error: "Already favorited",
      });
    }

    // お気に入りを追加
    const putCommand = new PutCommand({
      TableName: process.env.STORAGE_FAVORITES_NAME,
      Item: {
        favoriteId,
        albumId,
        userId,
        createdAt: new Date().toISOString(),
      },
    });

    await docClient.send(putCommand);

    res.json({
      success: true,
      message: "Added to favorites",
    });
  } catch (error) {
    console.error("Error adding favorite:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// アルバムのお気に入り削除
app.delete("/albums/:albumId/favorite", async function (req, res) {
  try {
    const { albumId } = req.params;
    const userId = req.headers["user-id"];

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
      });
    }

    const favoriteId = `${albumId}-${userId}`;

    // お気に入りを削除
    const deleteCommand = new DeleteCommand({
      TableName: process.env.STORAGE_FAVORITES_NAME,
      Key: { favoriteId },
    });

    await docClient.send(deleteCommand);

    res.json({
      success: true,
      message: "Removed from favorites",
    });
  } catch (error) {
    console.error("Error removing favorite:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// アルバムのお気に入り数取得
app.get("/albums/:albumId/favorites/count", async function (req, res) {
  try {
    const { albumId } = req.params;

    const command = new QueryCommand({
      TableName: process.env.STORAGE_FAVORITES_NAME,
      IndexName: "albumId-index",
      KeyConditionExpression: "albumId = :albumId",
      ExpressionAttributeValues: {
        ":albumId": albumId,
      },
    });

    const result = await docClient.send(command);
    const favoriteCount = result.Items ? result.Items.length : 0;

    res.json({
      success: true,
      albumId,
      favoriteCount,
    });
  } catch (error) {
    console.error("Error getting favorite count:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ユーザーのお気に入りアルバム一覧を取得
app.get("/favorites", async function (req, res) {
  try {
    const userId = req.headers["user-id"];

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
      });
    }

    const command = new ScanCommand({
      TableName: process.env.STORAGE_FAVORITES_NAME,
      FilterExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
    });

    const result = await docClient.send(command);
    const favorites = result.Items || [];

    res.json({
      success: true,
      favorites: favorites.map((fav) => fav.albumId),
    });
  } catch (error) {
    console.error("Error getting user favorites:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// アルバム一覧にお気に入り数を含めて取得（既存APIの拡張）
app.get("/photos/albums-with-favorites", async function (req, res) {
  try {
    console.log("Getting albums with favorite counts");
    console.log("Photos table name:", process.env.STORAGE_PHOTOS_NAME);
    console.log("Favorites table name:", process.env.STORAGE_FAVORITES_NAME);

    // 既存のアルバム取得ロジック
    const photosCommand = new ScanCommand({
      TableName: process.env.STORAGE_PHOTOS_NAME,
    });

    const photosResult = await docClient.send(photosCommand);
    const photos = photosResult.Items || [];

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
          caption: "",
          totalPhotos: 1,
        });
      }

      const album = albumsMap.get(albumId);
      album.photos.push(photo);

      if (photo.isMainPhoto || photo.photoIndex === 0 || (!album.mainPhoto && album.photos.length === 1)) {
        album.mainPhoto = photo;
        album.caption = photo.caption || "";
        album.uploadedAt = photo.uploadedAt;
      }

      if (photo.uploadedAt > album.uploadedAt) {
        album.uploadedAt = photo.uploadedAt;
      }

      album.totalPhotos = album.photos.length;
    });

    // お気に入り数を取得
    const favoritesCommand = new ScanCommand({
      TableName: process.env.STORAGE_FAVORITES_NAME,
    });

    const favoritesResult = await docClient.send(favoritesCommand);
    const favorites = favoritesResult.Items || [];

    // アルバムごとのお気に入り数をカウント
    const favoriteCounts = {};
    favorites.forEach((favorite) => {
      favoriteCounts[favorite.albumId] = (favoriteCounts[favorite.albumId] || 0) + 1;
    });

    // アルバム配列に変換してお気に入り数を追加
    const albums = Array.from(albumsMap.values())
      .map((album) => ({
        ...album,
        favoriteCount: favoriteCounts[album.albumId] || 0,
      }))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    // 各アルバム内の写真をphotoIndexでソート
    albums.forEach((album) => {
      album.photos.sort((a, b) => (a.photoIndex || 0) - (b.photoIndex || 0));
    });

    res.json({
      success: true,
      albums: albums,
    });
  } catch (error) {
    console.error("Error getting albums with favorites:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get all photos (legacy API for backward compatibility)
app.get("/photos/list", async function (req, res) {
  try {
    console.log("Getting photos list (legacy)");
    console.log("Photos table name:", process.env.STORAGE_PHOTOS_NAME);

    const command = new ScanCommand({
      TableName: process.env.STORAGE_PHOTOS_NAME,
    });

    const result = await docClient.send(command);

    // レガシー形式（単一写真として扱う）のため、メイン写真のみを返す
    const photos = (result.Items || [])
      .filter((photo) => photo.isMainPhoto !== false) // メイン写真またはisMainPhotoが設定されていない写真
      .map((photo) => ({
        photoId: photo.photoId,
        uploadedBy: photo.uploadedBy,
        uploaderName: photo.uploaderName,
        caption: photo.caption,
        uploadedAt: photo.uploadedAt,
        s3Key: photo.s3Key,
      }));

    res.json({
      success: true,
      photos: photos,
    });
  } catch (error) {
    console.error("Error getting photos:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Health check endpoint
app.get("/photos", function (req, res) {
  res.json({
    success: true,
    message: "Wedding Photos API is running",
    endpoints: {
      "GET /photos/user/:passcode": "Get user info",
      "POST /photos/user": "Register user",
      "POST /photos/save": "Save single photo (legacy)",
      "POST /photos/save-album": "Save album photo",
      "GET /photos/albums": "Get photos grouped by albums",
      "GET /photos/albums-with-favorites": "Get albums with favorite counts",
      "POST /albums/:albumId/favorite": "Add album to favorites",
      "DELETE /albums/:albumId/favorite": "Remove album from favorites",
      "GET /albums/:albumId/favorites/count": "Get album favorite count",
      "GET /favorites": "Get user's favorite albums",
      "GET /photos/list": "Get photos list (legacy)",
    },
  });
});

app.listen(3000, function () {
  console.log("App started");
});

module.exports = app;
