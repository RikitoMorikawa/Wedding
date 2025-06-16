"use client";

import { useState, useRef } from "react";
import { Amplify } from "aws-amplify";
import { getCurrentUser } from "aws-amplify/auth";
import { v4 as uuidv4 } from "uuid";
import awsconfig from "../aws-exports";
import WeddingConfirmDialog from "./WeddingConfirmDialog";
import BubblyButton from "./BubblyButton";

// Amplifyの設定
Amplify.configure(awsconfig);

interface PhotoUploadProps {
  onUploadSuccess: () => void;
  userInfo: { passcode: string; name: string } | null;
  selectedMediaType: "photo" | "video"; // 新しいprops
}

interface SelectedFile {
  file: File;
  id: string;
  preview: string;
  mediaType: "photo" | "video";
}

const MAX_FILES = 10;

export default function PhotoUpload({ onUploadSuccess, userInfo, selectedMediaType }: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [caption, setCaption] = useState("");
  const [showWeddingConfirm, setShowWeddingConfirm] = useState(false);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const API_BASE = awsconfig.aws_cloud_logic_custom[0].endpoint;

  // ファイル選択処理
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);

    let validFiles: File[] = [];

    if (selectedMediaType === "photo") {
      validFiles = files.filter((file) => file.type.startsWith("image/"));
      if (validFiles.length !== files.length) {
        alert("写真ファイルのみ選択できます");
      }
    } else if (selectedMediaType === "video") {
      validFiles = files.filter((file) => file.type.startsWith("video/"));
      if (validFiles.length !== files.length) {
        alert("動画ファイルのみ選択できます");
      }
    }

    if (validFiles.length === 0) {
      alert(`${selectedMediaType === "photo" ? "画像" : "動画"}ファイルを選択してください`);
      return;
    }

    if (selectedFiles.length + validFiles.length > MAX_FILES) {
      alert(`最大${MAX_FILES}個まで選択できます`);
      return;
    }

    // ファイルサイズチェック
    const maxPhotoSize = 10 * 1024 * 1024; // 10MB
    const maxVideoSize = 100 * 1024 * 1024; // 100MB

    for (const file of validFiles) {
      const maxSize = selectedMediaType === "photo" ? maxPhotoSize : maxVideoSize;
      if (file.size > maxSize) {
        alert(`${selectedMediaType === "photo" ? "画像" : "動画"}ファイルは${selectedMediaType === "photo" ? "10MB" : "100MB"}以下にしてください`);
        return;
      }
    }

    const newFiles: SelectedFile[] = validFiles.map((file) => ({
      file,
      id: uuidv4(),
      preview: URL.createObjectURL(file),
      mediaType: selectedMediaType,
    }));

    setSelectedFiles((prev) => [...prev, ...newFiles]);
  };

  const removeAllFiles = () => {
    selectedFiles.forEach((file) => URL.revokeObjectURL(file.preview));
    setSelectedFiles([]);
    const fileInput = document.getElementById("file-input") as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  const animateButton = () => {
    if (buttonRef.current) {
      buttonRef.current.classList.remove("animate");
      requestAnimationFrame(() => {
        if (buttonRef.current) {
          buttonRef.current.classList.add("animate");
          setTimeout(() => {
            if (buttonRef.current) {
              buttonRef.current.classList.remove("animate");
            }
          }, 700);
        }
      });
    }
  };

  // アップロードボタンクリック時
  const handleUploadClick = () => {
    if (selectedFiles.length === 0) return;
    setShowWeddingConfirm(true);
  };

  // 確認ダイアログで「はい」を選択
  const handleWeddingConfirm = () => {
    setShowWeddingConfirm(false);
    performUpload();
  };

  // 確認ダイアログで「いいえ」を選択
  const handleWeddingCancel = () => {
    setShowWeddingConfirm(false);
  };

  // 実際のアップロード処理
  const performUpload = async () => {
    if (selectedFiles.length === 0 || !userInfo) return;

    animateButton();
    setUploading(true);

    try {
      const user = await getCurrentUser();
      const albumId = uuidv4();
      const uploadedAt = new Date().toISOString();

      const uploadPromises = selectedFiles.map(async (selectedFile, index) => {
        const mediaId = uuidv4();

        try {
          // 1. 署名付きURL取得
          const urlResponse = await fetch(`${API_BASE}/photos/upload-url`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: selectedFile.file.name,
              fileType: selectedFile.file.type,
              passcode: user.username,
              mediaType: selectedFile.mediaType,
            }),
          });

          const urlResult = await urlResponse.json();
          if (!urlResult.success) {
            throw new Error(urlResult.message || "Failed to get upload URL");
          }

          // 2. S3にアップロード
          await fetch(urlResult.uploadURL, {
            method: "PUT",
            body: selectedFile.file,
            headers: { "Content-Type": selectedFile.file.type },
          });

          // 3. DBに保存
          const saveResponse = await fetch(`${API_BASE}/photos/save-album`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              photoId: mediaId,
              albumId: albumId,
              uploadedBy: user.username,
              caption: index === 0 ? caption : "",
              s3Key: urlResult.s3Key,
              uploaderName: userInfo.name,
              uploadedAt: uploadedAt,
              photoIndex: index,
              totalPhotos: selectedFiles.length,
              isMainPhoto: index === 0,
              mediaType: selectedFile.mediaType,
              fileType: selectedFile.file.type,
            }),
          });

          const saveResult = await saveResponse.json();
          if (!saveResult.success) {
            throw new Error(saveResult.message || "Failed to save media metadata");
          }

          return { success: true, mediaId, s3Key: urlResult.s3Key };
        } catch (error) {
          console.error(`Error uploading ${selectedFile.file.name}:`, error);
          return { success: false, error, mediaId };
        }
      });

      const results = await Promise.all(uploadPromises);
      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.length - successCount;

      console.log(`Upload completed: ${successCount} success, ${failureCount} failures`);

      // クリーンアップ
      selectedFiles.forEach((file) => URL.revokeObjectURL(file.preview));
      setSelectedFiles([]);
      setCaption("");
      const fileInput = document.getElementById("file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      if (failureCount === 0) {
        onUploadSuccess();
      } else {
        alert(`⚠️ アップロード完了\n${successCount}個が成功、${failureCount}個が失敗しました`);
        setTimeout(() => {
          onUploadSuccess();
        }, 1000);
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("❌ アップロードエラー\nアップロード中にエラーが発生しました");
      setTimeout(() => {
        onUploadSuccess();
      }, 1000);
    } finally {
      setUploading(false);
    }
  };

  const totalFileSize = selectedFiles.reduce((sum, file) => sum + file.file.size, 0) / (1024 * 1024);

  return (
    <>
      <div className="space-y-4">
        {/* ファイル選択エリア */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            {selectedMediaType === "photo" ? "写真" : "動画"}を選択 ({selectedFiles.length}/{MAX_FILES}個)
            {selectedFiles.length > 0 && <span className="text-xs text-gray-500 ml-2">({totalFileSize.toFixed(1)}MB)</span>}
          </label>

          <label
            htmlFor="file-input"
            className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-pink-300 rounded-2xl cursor-pointer bg-pink-50/50 hover:bg-pink-50 transition-colors"
          >
            <div className="flex flex-col items-center justify-center py-3">
              <div className="text-3xl mb-2">{selectedMediaType === "photo" ? "📷" : "🎥"}</div>
              <p className="text-sm text-pink-600 font-medium">
                {selectedFiles.length === 0
                  ? `${selectedMediaType === "photo" ? "写真" : "動画"}をタップして選択`
                  : `${selectedMediaType === "photo" ? "写真" : "動画"}を追加`}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {selectedMediaType === "photo" ? "JPG, PNG, GIF, WebP（最大10MB）" : "MP4, MOV, AVI, WebM（最大100MB）"}
              </p>
            </div>
            <input
              id="file-input"
              type="file"
              accept={selectedMediaType === "photo" ? "image/*" : "video/*"}
              multiple
              onChange={handleFileSelect}
              className="hidden"
              disabled={selectedFiles.length >= MAX_FILES}
            />
          </label>
        </div>

        {/* 選択されたファイルの情報 */}
        {selectedFiles.length > 0 && (
          <div className="bg-pink-50/50 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">
                選択中の{selectedMediaType === "photo" ? "写真" : "動画"} ({selectedFiles.length}個)
              </h3>
              <button onClick={removeAllFiles} className="text-xs text-red-500 hover:text-red-700 font-medium" disabled={uploading}>
                すべて削除
              </button>
            </div>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {selectedFiles.map((selectedFile, index) => (
                <div key={selectedFile.id} className="flex items-center justify-between bg-white rounded-lg p-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-100">
                      {selectedFile.mediaType === "photo" ? (
                        <img src={selectedFile.preview} alt="preview" className="w-full h-full object-cover" />
                      ) : (
                        <video src={selectedFile.preview} className="w-full h-full object-cover" muted />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-1">
                        {index === 0 && <span className="text-pink-600 text-xs font-bold">★</span>}
                        <p className="text-xs font-medium text-gray-800 truncate">{selectedFile.file.name}</p>
                      </div>
                      <p className="text-xs text-gray-500">
                        {(selectedFile.file.size / (1024 * 1024)).toFixed(1)}MB
                        {index === 0 && <span className="ml-1 text-pink-600">（メイン{selectedMediaType === "photo" ? "写真" : "動画"}）</span>}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* キャプション入力 */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            コメント（任意）
            {selectedFiles.length > 1 && <span className="text-xs text-gray-500 ml-2">※アルバム全体のコメントです</span>}
          </label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-pink-400 focus:ring-4 focus:ring-pink-100 transition-all duration-200 bg-gray-50/50 resize-none"
            placeholder={selectedFiles.length > 1 ? "このアルバムについて一言..." : `この${selectedMediaType === "photo" ? "写真" : "動画"}について一言...`}
            disabled={uploading}
          />
        </div>

        {/* アップロードボタン */}
        <div className="pt-3">
          <BubblyButton ref={buttonRef} onClick={handleUploadClick} disabled={selectedFiles.length === 0 || uploading}>
            {uploading ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>アップロード中...</span>
              </div>
            ) : (
              `${
                selectedFiles.length === 0
                  ? `${selectedMediaType === "photo" ? "写真" : "動画"}を選択してください`
                  : selectedFiles.length === 1
                  ? `${selectedMediaType === "photo" ? "写真" : "動画"}をアップロード`
                  : `${selectedFiles.length}個をアップロード`
              }`
            )}
          </BubblyButton>
        </div>
      </div>

      {/* 確認ダイアログ */}
      <WeddingConfirmDialog isOpen={showWeddingConfirm} onConfirm={handleWeddingConfirm} onCancel={handleWeddingCancel} />
    </>
  );
}
