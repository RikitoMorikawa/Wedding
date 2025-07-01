// src/utils/videoThumbnail.ts
// フロントエンド側での動画サムネイル生成（改良版）

export interface ThumbnailOptions {
  width?: number;
  height?: number;
  timeOffset?: number; // 何秒の位置からキャプチャするか
  quality?: number; // 0.0 - 1.0
}

/**
 * 動画ファイルからサムネイル画像を生成（簡素化版）
 */
export async function generateVideoThumbnail(videoFile: File, options: ThumbnailOptions = {}): Promise<Blob> {
  const {
    width = 400,
    height = 300,
    timeOffset = 0, // デフォルトを0秒に変更
    quality = 0.8,
  } = options;

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Canvas context not available"));
      return;
    }

    canvas.width = width;
    canvas.height = height;

    let objectUrl: string | null = null;
    let hasResolved = false; // 重複処理防止

    // クリーンアップ関数
    const cleanup = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
      video.src = "";
      video.removeAttribute("src");
    };

    // 5秒でタイムアウト（短縮）
    const timeoutId = setTimeout(() => {
      if (!hasResolved) {
        hasResolved = true;
        cleanup();
        reject(new Error("Video thumbnail generation timeout (5s)"));
      }
    }, 5000);

    // 成功時の処理
    const generateThumbnail = () => {
      if (hasResolved) return;

      try {
        console.log(`🎯 サムネイル生成実行: ${video.currentTime}秒, ${video.videoWidth}x${video.videoHeight}`);

        // 動画が有効かチェック
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          throw new Error("Invalid video dimensions");
        }

        // アスペクト比計算
        const videoAspect = video.videoWidth / video.videoHeight;
        const canvasAspect = width / height;

        let drawWidth = width;
        let drawHeight = height;
        let offsetX = 0;
        let offsetY = 0;

        if (videoAspect > canvasAspect) {
          drawHeight = width / videoAspect;
          offsetY = (height - drawHeight) / 2;
        } else {
          drawWidth = height * videoAspect;
          offsetX = (width - drawWidth) / 2;
        }

        // 背景とフレーム描画
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);

        // Blob生成
        canvas.toBlob(
          (blob) => {
            if (!hasResolved) {
              hasResolved = true;
              clearTimeout(timeoutId);
              cleanup();

              if (blob && blob.size > 0) {
                console.log(`✅ サムネイル生成成功: ${blob.size} bytes`);
                resolve(blob);
              } else {
                reject(new Error("Generated blob is empty"));
              }
            }
          },
          "image/jpeg",
          quality
        );
      } catch (error) {
        if (!hasResolved) {
          hasResolved = true;
          clearTimeout(timeoutId);
          cleanup();
          reject(error);
        }
      }
    };

    // イベントハンドラー設定
    video.onloadeddata = () => {
      console.log(`📊 動画データ読み込み完了`);
      if (timeOffset === 0) {
        // 最初のフレームを使用
        generateThumbnail();
      } else {
        // 指定時間にシーク
        video.currentTime = Math.min(timeOffset, video.duration || 1);
      }
    };

    video.onseeked = () => {
      console.log(`⏰ シーク完了: ${video.currentTime}秒`);
      generateThumbnail();
    };

    video.onerror = (event) => {
      if (!hasResolved) {
        hasResolved = true;
        clearTimeout(timeoutId);
        cleanup();

        const error = video.error;
        let errorMessage = "Failed to load video";

        if (error) {
          switch (error.code) {
            case MediaError.MEDIA_ERR_DECODE:
              errorMessage = "Video decode error - format may be unsupported";
              break;
            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
              errorMessage = "Video format not supported by browser";
              break;
            case MediaError.MEDIA_ERR_NETWORK:
              errorMessage = "Network error loading video";
              break;
            default:
              errorMessage = `Video error (code: ${error.code})`;
          }
        }

        console.error(`❌ 動画読み込みエラー:`, errorMessage, event);
        reject(new Error(errorMessage));
      }
    };

    // 動画設定とロード
    try {
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.crossOrigin = "anonymous";

      objectUrl = URL.createObjectURL(videoFile);
      video.src = objectUrl;

      console.log(`🔄 動画読み込み開始: ${videoFile.name}`);
      video.load();
    } catch (error) {
      if (!hasResolved) {
        hasResolved = true;
        clearTimeout(timeoutId);
        cleanup();
        reject(new Error(`Failed to create object URL: ${error}`));
      }
    }
  });
}

/**
 * プレースホルダーサムネイル生成（最終フォールバック）
 */
export async function generatePlaceholderThumbnail(photoId: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas context not available for placeholder");
  }

  canvas.width = 400;
  canvas.height = 300;

  // グラデーション背景
  const gradient = ctx.createLinearGradient(0, 0, 400, 300);
  gradient.addColorStop(0, "#667eea");
  gradient.addColorStop(1, "#764ba2");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 400, 300);

  // 再生ボタン
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.beginPath();
  ctx.arc(200, 150, 40, 0, 2 * Math.PI);
  ctx.fill();

  ctx.fillStyle = "#667eea";
  ctx.beginPath();
  ctx.moveTo(180, 130);
  ctx.lineTo(180, 170);
  ctx.lineTo(220, 150);
  ctx.closePath();
  ctx.fill();

  // テキスト
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.font = "24px Arial";
  ctx.textAlign = "center";
  ctx.fillText("VIDEO", 200, 220);

  ctx.font = "16px Arial";
  ctx.fillText(photoId.substring(0, 8), 200, 250);

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob!);
      },
      "image/jpeg",
      0.8
    );
  });
}

/**
 * 生成したサムネイルをS3にアップロード
 */
export async function uploadThumbnailToS3(
  thumbnailBlob: Blob,
  photoId: string,
  apiBase: string,
  token: string
): Promise<{ success: boolean; thumbnailUrl?: string; error?: string }> {
  try {
    console.log(`📤 サムネイルをS3にアップロード中: ${photoId}`);

    // ファイル名とキーを生成
    const fileName = `${photoId}-thumbnail.jpg`;
    // const s3Key = `thumbnails/${fileName}`;

    // 署名付きURL取得
    const urlResponse = await fetch(`${apiBase}/photos/thumbnail-upload-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        photoId: photoId,
        fileName: fileName,
        contentType: "image/jpeg",
      }),
    });

    if (!urlResponse.ok) {
      throw new Error(`署名付きURL取得失敗: ${urlResponse.status}`);
    }

    const { uploadURL, thumbnailUrl } = await urlResponse.json();

    // S3にアップロード
    const uploadResponse = await fetch(uploadURL, {
      method: "PUT",
      body: thumbnailBlob,
      headers: {
        "Content-Type": "image/jpeg",
      },
    });

    if (!uploadResponse.ok) {
      throw new Error(`S3アップロード失敗: ${uploadResponse.status}`);
    }

    console.log(`✅ サムネイルアップロード完了: ${thumbnailUrl}`);

    return {
      success: true,
      thumbnailUrl: thumbnailUrl,
    };
  } catch (error) {
    console.error("❌ サムネイルアップロードエラー:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
