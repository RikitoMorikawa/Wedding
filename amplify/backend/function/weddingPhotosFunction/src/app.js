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
Amplify Params - DO NOT EDIT */
const express = require("express");
const bodyParser = require("body-parser");
const awsServerlessExpressMiddleware = require("aws-serverless-express/middleware");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");

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
      "GET /photos/list": "Get photos list (legacy)",
    },
  });
});

app.listen(3000, function () {
  console.log("App started");
});

module.exports = app;
