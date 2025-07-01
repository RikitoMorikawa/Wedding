// src/utils/videoThumbnail.ts
// フロントエンド側での動画サムネイル生成

export interface ThumbnailOptions {
  width?: number;
  height?: number;
  timeOffset?: number; // 何秒の位置からキャプチャするか
  quality?: number; // 0.0 - 1.0
}

/**
 * 動画ファイルからサムネイル画像を生成
 */
export async function generateVideoThumbnail(videoFile: File, options: ThumbnailOptions = {}): Promise<Blob> {
  const {
    width = 400,
    height = 300,
    timeOffset = 1, // 1秒の位置
    quality = 0.8,
  } = options;

  return new Promise((resolve, reject) => {
    // HTML5 videoエレメントを作成
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Canvas context not available"));
      return;
    }

    // キャンバスサイズ設定
    canvas.width = width;
    canvas.height = height;

    // 動画読み込み完了時の処理
    video.onloadedmetadata = () => {
      // 指定時間にシーク
      video.currentTime = Math.min(timeOffset, video.duration);
    };

    // シーク完了時の処理
    video.onseeked = () => {
      try {
        // 動画の縦横比を計算
        const videoAspect = video.videoWidth / video.videoHeight;
        const canvasAspect = width / height;

        let drawWidth = width;
        let drawHeight = height;
        let offsetX = 0;
        let offsetY = 0;

        // アスペクト比を保持してセンタリング
        if (videoAspect > canvasAspect) {
          // 動画の方が横長
          drawHeight = width / videoAspect;
          offsetY = (height - drawHeight) / 2;
        } else {
          // 動画の方が縦長
          drawWidth = height * videoAspect;
          offsetX = (width - drawWidth) / 2;
        }

        // 背景を黒で塗りつぶし
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, width, height);

        // 動画フレームを描画
        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);

        // Blobとして出力
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Failed to create thumbnail blob"));
            }
          },
          "image/jpeg",
          quality
        );
      } catch (error) {
        reject(error);
      } finally {
        // リソース解放
        video.src = "";
        URL.revokeObjectURL(video.src);
      }
    };

    // エラーハンドリング
    video.onerror = () => {
      reject(new Error("Failed to load video"));
    };

    // 動画ファイルを読み込み
    video.src = URL.createObjectURL(videoFile);
    video.load();
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
