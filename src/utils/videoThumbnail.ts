// src/utils/videoThumbnail.ts - 修正版
export interface ThumbnailOptions {
  width?: number;
  height?: number;
  timeOffset?: number;
  quality?: number;
}

export async function generateVideoThumbnail(videoFile: File, options: ThumbnailOptions = {}): Promise<Blob> {
  const {
    width = 400,
    height = 300,
    timeOffset = 0.5, // ⭐ 修正1: 0.5秒に変更（真っ黒を回避）
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
    let hasResolved = false;

    const cleanup = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
      video.src = "";
      video.removeAttribute("src");
    };

    const timeoutId = setTimeout(() => {
      if (!hasResolved) {
        hasResolved = true;
        cleanup();
        reject(new Error("Video thumbnail generation timeout"));
      }
    }, 10000); // ⭐ 修正2: タイムアウトを10秒に延長

    const generateThumbnail = () => {
      if (hasResolved) return;

      try {
        console.log(`🎯 サムネイル生成実行: ${video.currentTime}秒, ${video.videoWidth}x${video.videoHeight}`);

        // ⭐ 修正3: より厳密な動画状態チェック
        if (video.readyState < 2) {
          // HAVE_CURRENT_DATA未満
          console.warn("動画データが準備されていません");
          throw new Error("Video not ready for thumbnail generation");
        }

        if (video.videoWidth === 0 || video.videoHeight === 0) {
          throw new Error("Invalid video dimensions");
        }

        // ⭐ 修正4: 現在時刻のフレームが有効かチェック
        if (video.currentTime === 0 && timeOffset > 0) {
          console.warn("シークが完了していません、再試行します");
          setTimeout(() => generateThumbnail(), 100);
          return;
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

        // ⭐ 修正5: 白い背景を描画（真っ黒を防ぐ）
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);

        // 動画フレームを描画
        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);

        // ⭐ 修正6: 描画結果をピクセルレベルでチェック
        const imageData = ctx.getImageData(0, 0, width, height);
        const pixels = imageData.data;
        let nonBlackPixels = 0;

        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          if (r > 10 || g > 10 || b > 10) {
            // 完全な黒以外
            nonBlackPixels++;
          }
        }

        console.log(`🔍 非黒ピクセル数: ${nonBlackPixels} / ${width * height}`);

        // 真っ黒すぎる場合は別のタイムスタンプを試す
        if (nonBlackPixels < width * height * 0.1 && timeOffset < 2) {
          console.warn("フレームが真っ黒すぎます、別のタイムスタンプを試行");
          video.currentTime = Math.min(timeOffset + 1, video.duration || 2);
          return;
        }

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

    // ⭐ 修正7: イベントハンドラーの改善
    video.onloadedmetadata = () => {
      console.log(`📊 動画メタデータ読み込み完了: ${video.duration}秒`);

      // 動画の長さに応じてタイムオフセットを調整
      const adjustedTimeOffset = Math.min(timeOffset, video.duration * 0.1);

      if (adjustedTimeOffset > 0) {
        video.currentTime = adjustedTimeOffset;
      } else {
        // 最初のフレームを使用
        generateThumbnail();
      }
    };

    video.oncanplay = () => {
      console.log(`🎬 動画再生準備完了`);
      if (timeOffset === 0) {
        generateThumbnail();
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
