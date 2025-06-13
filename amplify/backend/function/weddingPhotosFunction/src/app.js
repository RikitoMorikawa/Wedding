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
Amplify Params - DO NOT EDIT */const express = require("express");
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

// Save photo metadata to DynamoDB
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
        uploadedBy: uploadedBy,
        caption: caption || "",
        uploadedAt: new Date().toISOString(),
        s3Key: s3Key,
        uploaderName: uploaderName || "",
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

// Get all photos
app.get("/photos/list", async function (req, res) {
  try {
    console.log("Getting photos list");
    console.log("Photos table name:", process.env.STORAGE_PHOTOS_NAME);

    const command = new ScanCommand({
      TableName: process.env.STORAGE_PHOTOS_NAME,
    });

    const result = await docClient.send(command);

    res.json({
      success: true,
      photos: result.Items || [],
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
  });
});

app.listen(3000, function () {
  console.log("App started");
});

module.exports = app;
