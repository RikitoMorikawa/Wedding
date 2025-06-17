// src/components/PhotoUpload.tsx - バッチアップロード対応版
"use client";

import { useState, useRef } from "react";
import { Amplify } from "aws-amplify";
import { getCurrentUser } from "aws-amplify/auth";
import { v4 as uuidv4 } from "uuid";
import awsconfig from "../aws-exports";
import WeddingConfirmDialog from "./WeddingConfirmDialog";
import BubblyButton from "./BubblyButton";

Amplify.configure(awsconfig);

interface PhotoUploadProps {
  onUploadSuccess: () => void;
  userInfo: { passcode: string; name: string } | null;
  selectedMediaType: "photo" | "video";
}

interface SelectedFile {
  file: File;
  id: string;
  preview: string;
  mediaType: "photo" | "video";
}

interface UploadProgress {
  phase: "preparing" | "uploading" | "saving" | "complete" | "error";
  current: number;
  total: number;
  message: string;
}

const MAX_FILES = 20;
const MAX_PHOTO_SIZE = 8 * 1024 * 1024; // 8MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB

export default function PhotoUpload({ onUploadSuccess, userInfo, selectedMediaType }: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [caption, setCaption] = useState("");
  const [showWeddingConfirm, setShowWeddingConfirm] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    phase: "preparing",
    current: 0,
    total: 0,
    message: "",
  });

  const buttonRef = useRef<HTMLButtonElement>(null);
  const API_BASE = awsconfig.aws_cloud_logic_custom[0].endpoint;

  // ファイル選択処理（既存と同じ）
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

    // 個別ファイルサイズチェック
    const maxSize = selectedMediaType === "photo" ? MAX_PHOTO_SIZE : MAX_VIDEO_SIZE;
    const oversizedFiles = validFiles.filter((file) => file.size > maxSize);

    if (oversizedFiles.length > 0) {
      const maxSizeText = selectedMediaType === "photo" ? "8MB" : "50MB";
      alert(
        `${selectedMediaType === "photo" ? "画像" : "動画"}ファイルは${maxSizeText}以下にしてください\n\n大きすぎるファイル:\n${oversizedFiles
          .map((f) => f.name)
          .join("\n")}`
      );
      return;
    }

    // 合計サイズチェック
    const currentTotalSize = selectedFiles.reduce((sum, file) => sum + file.file.size, 0);
    const newFilesTotalSize = validFiles.reduce((sum, file) => sum + file.size, 0);
    const totalSize = currentTotalSize + newFilesTotalSize;

    if (totalSize > MAX_TOTAL_SIZE) {
      const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(1);
      const maxTotalSizeMB = (MAX_TOTAL_SIZE / (1024 * 1024)).toFixed(0);
      alert(
        `合計ファイルサイズが制限を超えています\n\n現在の合計: ${totalSizeMB}MB\n制限: ${maxTotalSizeMB}MB\n\nファイル数を減らすか、より小さなファイルを選択してください`
      );
      return;
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

  const removeFile = (fileId: string) => {
    const fileToRemove = selectedFiles.find((f) => f.id === fileId);
    if (fileToRemove) {
      URL.revokeObjectURL(fileToRemove.preview);
    }
    setSelectedFiles((prev) => prev.filter((f) => f.id !== fileId));
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

  const handleUploadClick = () => {
    if (selectedFiles.length === 0) return;
    setShowWeddingConfirm(true);
  };

  const handleWeddingConfirm = () => {
    setShowWeddingConfirm(false);
    performBatchUpload();
  };

  const handleWeddingCancel = () => {
    setShowWeddingConfirm(false);
  };

  // ✅ 新しいバッチアップロード処理
  const performBatchUpload = async () => {
    if (selectedFiles.length === 0 || !userInfo) return;

    animateButton();
    setUploading(true);

    try {
      const user = await getCurrentUser();
      const albumId = uuidv4();
      const uploadedAt = new Date().toISOString();

      // 🔥 Step 1: 署名付きURLを一括取得
      setUploadProgress({
        phase: "preparing",
        current: 0,
        total: selectedFiles.length,
        message: "アップロード準備中...",
      });

      const filesInfo = selectedFiles.map((file, index) => ({
        fileName: file.file.name,
        fileType: file.file.type,
        size: file.file.size,
        mediaType: file.mediaType,
        fileIndex: index,
      }));

      console.log("🔄 署名付きURLを一括取得中...");
      const urlResponse = await fetch(`${API_BASE}/photos/batch-upload-urls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: filesInfo,
          passcode: user.username,
        }),
      });

      const urlResult = await urlResponse.json();
      if (!urlResult.success) {
        throw new Error(urlResult.message || "Failed to get upload URLs");
      }

      console.log(`✅ ${urlResult.uploadUrls.length}個の署名付きURL取得完了`);

      // 🔥 Step 2: 全ファイルをS3に並行アップロード
      setUploadProgress({
        phase: "uploading",
        current: 0,
        total: selectedFiles.length,
        message: "ファイルをアップロード中...",
      });

      const uploadPromises = selectedFiles.map(async (selectedFile, index) => {
        const uploadInfo = urlResult.uploadUrls[index];

        try {
          const response = await fetch(uploadInfo.uploadURL, {
            method: "PUT",
            body: selectedFile.file,
            headers: { "Content-Type": selectedFile.file.type },
          });

          if (!response.ok) {
            throw new Error(`S3 upload failed: ${response.statusText}`);
          }

          // 進捗更新
          setUploadProgress((prev) => ({
            ...prev,
            current: prev.current + 1,
            message: `ファイルをアップロード中... (${prev.current + 1}/${prev.total})`,
          }));

          return {
            success: true,
            photoId: uuidv4(),
            s3Key: uploadInfo.s3Key,
            mediaType: uploadInfo.mediaType,
            fileType: uploadInfo.fileType,
            fileName: uploadInfo.fileName,
            size: uploadInfo.size,
            fileIndex: index,
          };
        } catch (error) {
          console.error(`Error uploading ${selectedFile.file.name}:`, error);
          return {
            success: false,
            error,
            fileName: selectedFile.file.name,
            fileIndex: index,
          };
        }
      });

      const uploadResults = await Promise.all(uploadPromises);
      const successfulUploads = uploadResults.filter((result) => result.success);
      const failedUploads = uploadResults.filter((result) => !result.success);

      if (failedUploads.length > 0) {
        console.error(`${failedUploads.length}個のファイルアップロードが失敗:`, failedUploads);
        throw new Error(`${failedUploads.length}個のファイルのアップロードに失敗しました`);
      }

      console.log(`✅ 全${successfulUploads.length}ファイルのS3アップロード完了`);

      // 🔥 Step 3: 1回のAPIで全メタデータを保存
      setUploadProgress({
        phase: "saving",
        current: 0,
        total: 1,
        message: "データベースに保存中...",
      });

      console.log("🔄 バッチでメタデータ保存中...");
      const saveResponse = await fetch(`${API_BASE}/photos/batch-save-album`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          albumId: albumId,
          uploadedBy: user.username,
          uploaderName: userInfo.name,
          caption: caption,
          uploadedAt: uploadedAt,
          files: successfulUploads,
          passcode: user.username,
        }),
      });

      const saveResult = await saveResponse.json();
      if (!saveResult.success) {
        // バックエンドでS3クリーンアップは自動実行される
        throw new Error(saveResult.message || "Failed to save album metadata");
      }

      console.log(`✅ アルバム保存完了: ${saveResult.totalFiles}ファイル、${saveResult.batches}バッチ`);

      // 🔥 Step 4: 完了処理
      setUploadProgress({
        phase: "complete",
        current: selectedFiles.length,
        total: selectedFiles.length,
        message: "アップロード完了！",
      });

      // クリーンアップ
      selectedFiles.forEach((file) => URL.revokeObjectURL(file.preview));
      setSelectedFiles([]);
      setCaption("");
      const fileInput = document.getElementById("file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      // 成功通知
      setTimeout(() => {
        onUploadSuccess();
      }, 1000);
    } catch (error) {
      console.error("Batch upload error:", error);

      setUploadProgress({
        phase: "error",
        current: 0,
        total: selectedFiles.length,
        message: "エラーが発生しました",
      });

      // エラー処理
      if (error instanceof Error) {
        if (error.message.includes("exceeds") && error.message.includes("limit")) {
          alert(`❌ ファイルサイズエラー\n${error.message}`);
        } else if (error.message.includes("already exist")) {
          alert("❌ 重複エラー\n同じファイルが既に存在します。しばらく待ってから再試行してください。");
        } else if (error.message.includes("overloaded")) {
          alert("❌ サーバー負荷エラー\nサーバーが一時的に混雑しています。少し待ってから再試行してください。");
        } else {
          alert(`❌ アップロードエラー\n${error.message}`);
        }
      } else {
        alert("❌ 予期しないエラーが発生しました");
      }

      setTimeout(() => {
        onUploadSuccess(); // エラー時もモーダルを閉じる
      }, 2000);
    } finally {
      setUploading(false);
    }
  };

  const totalFileSize = selectedFiles.reduce((sum, file) => sum + file.file.size, 0) / (1024 * 1024);
  const maxTotalSizeMB = MAX_TOTAL_SIZE / (1024 * 1024);

  return (
    <>
      <div className="space-y-4">
        {/* ファイル選択エリア */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            {selectedMediaType === "photo" ? "写真" : "動画"}を選択 ({selectedFiles.length}/{MAX_FILES}個)
            {selectedFiles.length > 0 && (
              <span className={`text-xs ml-2 ${totalFileSize > maxTotalSizeMB * 0.8 ? "text-orange-600" : "text-gray-500"}`}>
                ({totalFileSize.toFixed(1)}MB / {maxTotalSizeMB}MB)
              </span>
            )}
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
                {selectedMediaType === "photo" ? "JPG, PNG, GIF, WebP（最大8MB）" : "MP4, MOV, AVI, WebM（最大50MB）"}
              </p>
              <p className="text-xs text-gray-400 mt-1">合計サイズ制限: {maxTotalSizeMB}MB</p>
            </div>
            <input
              id="file-input"
              type="file"
              accept={selectedMediaType === "photo" ? "image/*" : "video/*"}
              multiple
              onChange={handleFileSelect}
              className="hidden"
              disabled={selectedFiles.length >= MAX_FILES || uploading}
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
            <div className="space-y-2 max-h-40 overflow-y-auto">
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
                  <button
                    onClick={() => removeFile(selectedFile.id)}
                    className="p-1 hover:bg-red-100 rounded text-red-500 hover:text-red-700"
                    disabled={uploading}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* アップロード進捗表示 */}
        {uploading && (
          <div className="bg-blue-50/50 rounded-2xl p-4">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-800">{uploadProgress.message}</p>
                <div className="flex items-center space-x-2 mt-1">
                  <div className="flex-1 bg-blue-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-blue-600 font-medium">
                    {uploadProgress.phase === "saving" ? "保存中" : `${uploadProgress.current}/${uploadProgress.total}`}
                  </span>
                </div>
              </div>
            </div>

            {/* フェーズ表示 */}
            <div className="flex items-center space-x-4 text-xs">
              <div
                className={`flex items-center space-x-1 ${
                  uploadProgress.phase === "preparing"
                    ? "text-blue-600"
                    : uploadProgress.phase === "uploading" || uploadProgress.phase === "saving" || uploadProgress.phase === "complete"
                    ? "text-green-600"
                    : "text-gray-400"
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    uploadProgress.phase === "preparing"
                      ? "bg-blue-500"
                      : uploadProgress.phase === "uploading" || uploadProgress.phase === "saving" || uploadProgress.phase === "complete"
                      ? "bg-green-500"
                      : "bg-gray-300"
                  }`}
                />
                <span>準備</span>
              </div>
              <div
                className={`flex items-center space-x-1 ${
                  uploadProgress.phase === "uploading"
                    ? "text-blue-600"
                    : uploadProgress.phase === "saving" || uploadProgress.phase === "complete"
                    ? "text-green-600"
                    : "text-gray-400"
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    uploadProgress.phase === "uploading"
                      ? "bg-blue-500"
                      : uploadProgress.phase === "saving" || uploadProgress.phase === "complete"
                      ? "bg-green-500"
                      : "bg-gray-300"
                  }`}
                />
                <span>アップロード</span>
              </div>
              <div
                className={`flex items-center space-x-1 ${
                  uploadProgress.phase === "saving" ? "text-blue-600" : uploadProgress.phase === "complete" ? "text-green-600" : "text-gray-400"
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    uploadProgress.phase === "saving" ? "bg-blue-500" : uploadProgress.phase === "complete" ? "bg-green-500" : "bg-gray-300"
                  }`}
                />
                <span>保存</span>
              </div>
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
                <span>
                  {uploadProgress.phase === "preparing" && "準備中..."}
                  {uploadProgress.phase === "uploading" && `アップロード中... (${uploadProgress.current}/${uploadProgress.total})`}
                  {uploadProgress.phase === "saving" && "データベース保存中..."}
                  {uploadProgress.phase === "complete" && "完了！"}
                  {uploadProgress.phase === "error" && "エラー"}
                </span>
              </div>
            ) : (
              `${
                selectedFiles.length === 0
                  ? `${selectedMediaType === "photo" ? "写真" : "動画"}を選択してください`
                  : selectedFiles.length === 1
                  ? `${selectedMediaType === "photo" ? "写真" : "動画"}をアップロード`
                  : `${selectedFiles.length}個を一括アップロード`
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
