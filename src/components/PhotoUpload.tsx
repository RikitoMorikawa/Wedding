"use client";

import { useState, useRef } from "react";
import { Amplify } from "aws-amplify";
import { uploadData } from "aws-amplify/storage";
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
}

interface SelectedFile {
  file: File;
  id: string;
  preview: string;
}

const MAX_FILES = 10;

export default function PhotoUpload({ onUploadSuccess, userInfo }: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [caption, setCaption] = useState("");

  // 結婚式確認ダイアログの状態
  const [showWeddingConfirm, setShowWeddingConfirm] = useState(false);

  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      alert("画像ファイルを選択してください");
      return;
    }

    if (selectedFiles.length + imageFiles.length > MAX_FILES) {
      alert(`最大${MAX_FILES}枚まで選択できます`);
      return;
    }

    const newFiles: SelectedFile[] = imageFiles.map((file) => ({
      file,
      id: uuidv4(),
      preview: URL.createObjectURL(file),
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

  // アップロードボタンクリック時（確認ダイアログを表示）
  const handleUploadClick = () => {
    if (selectedFiles.length === 0) return;
    setShowWeddingConfirm(true);
  };

  // 結婚式確認ダイアログで「はい」を選択
  const handleWeddingConfirm = () => {
    setShowWeddingConfirm(false);
    performUpload();
  };

  // 結婚式確認ダイアログで「いいえ」を選択
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
        const photoId = uuidv4();
        const fileKey = `photos/${albumId}/${photoId}-${selectedFile.file.name}`;

        try {
          await uploadData({
            key: fileKey,
            data: selectedFile.file,
            options: {
              metadata: {
                uploadedBy: user.username,
                uploadedAt: uploadedAt,
                photoId: photoId,
                albumId: albumId,
                photoIndex: index.toString(),
              },
            },
          }).result;

          const response = await fetch(`${awsconfig.aws_cloud_logic_custom[0].endpoint}/photos/save-album`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              photoId: photoId,
              albumId: albumId,
              uploadedBy: user.username,
              caption: index === 0 ? caption : "",
              s3Key: fileKey,
              uploaderName: userInfo.name,
              uploadedAt: uploadedAt,
              photoIndex: index,
              totalPhotos: selectedFiles.length,
              isMainPhoto: index === 0,
            }),
          });

          const saveResult = await response.json();

          if (!saveResult.success) {
            throw new Error(saveResult.message || "Failed to save photo metadata");
          }

          return { success: true, photoId, fileKey };
        } catch (error) {
          console.error(`Error uploading ${selectedFile.file.name}:`, error);
          return { success: false, error, photoId, fileKey };
        }
      });

      const results = await Promise.all(uploadPromises);
      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.length - successCount;

      console.log(`Upload completed: ${successCount} success, ${failureCount} failures`);

      // ファイルをクリーンアップ
      selectedFiles.forEach((file) => URL.revokeObjectURL(file.preview));
      setSelectedFiles([]);
      setCaption("");
      const fileInput = document.getElementById("file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      // 🔥 重要：アップロード完了後にモーダルを閉じる
      if (failureCount === 0) {
        // 成功時はダイアログを表示せずに即座にモーダルを閉じる
        onUploadSuccess();
      } else {
        // エラーがある場合のみアラートを表示してからモーダルを閉じる
        alert(`⚠️ アップロード完了\n${successCount}枚が成功、${failureCount}枚が失敗しました`);
        setTimeout(() => {
          onUploadSuccess();
        }, 1000);
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("❌ アップロードエラー\nアップロード中にエラーが発生しました");
      // エラーの場合もモーダルを閉じる
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
      {/* モーダル内に完全に収まるレイアウト */}
      <div className="space-y-4">
        {/* ファイル選択エリア */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            写真を選択 ({selectedFiles.length}/{MAX_FILES}枚)
            {selectedFiles.length > 0 && <span className="text-xs text-gray-500 ml-2">({totalFileSize.toFixed(1)}MB)</span>}
          </label>

          <label
            htmlFor="file-input"
            className="flex flex-col items-center justify-center w-full h-30 sm:h-28 border-2 border-dashed border-pink-300 rounded-2xl cursor-pointer bg-pink-50/50 hover:bg-pink-50 transition-colors"
          >
            <div className="flex flex-col items-center justify-center py-3">
              <svg className="w-6 h-6 sm:w-7 sm:h-7 mb-1 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <p className="text-xs sm:text-sm text-pink-600 font-medium">{selectedFiles.length === 0 ? "写真をタップして選択" : "写真を追加"}</p>
              <p className="text-xs text-gray-500">JPG, PNG, GIF（最大{MAX_FILES}枚）</p>
            </div>
            <input
              id="file-input"
              type="file"
              accept="image/*"
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
              <h3 className="text-sm font-semibold text-gray-700">選択中の写真 ({selectedFiles.length}枚)</h3>
              <button onClick={removeAllFiles} className="text-xs text-red-500 hover:text-red-700 font-medium" disabled={uploading}>
                すべて削除
              </button>
            </div>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {selectedFiles.map((selectedFile, index) => (
                <div key={selectedFile.id} className="flex items-center justify-between bg-white rounded-lg p-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 bg-pink-100 rounded-lg flex items-center justify-center">
                      {index === 0 ? <span className="text-pink-600 text-xs font-bold">★</span> : <span className="text-pink-600 text-xs">{index + 1}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-800 truncate">{selectedFile.file.name}</p>
                      <p className="text-xs text-gray-500">
                        {(selectedFile.file.size / (1024 * 1024)).toFixed(1)}MB
                        {index === 0 && <span className="ml-1 text-pink-600">（メイン写真）</span>}
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
            className="w-full px-4 py-5 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-pink-400 focus:ring-4 focus:ring-pink-100 transition-all duration-200 bg-gray-50/50 resize-none"
            placeholder={selectedFiles.length > 1 ? "このアルバムについて一言..." : "この写真について一言..."}
            disabled={uploading}
          />
        </div>

        {/* アップロードボタン - モーダル内の最下部 */}
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
                  ? "写真を選択してください"
                  : selectedFiles.length === 1
                  ? "写真をアップロード"
                  : `${selectedFiles.length}枚をアップロード`
              }`
            )}
          </BubblyButton>
        </div>
      </div>

      {/* 結婚式確認ダイアログ */}
      <WeddingConfirmDialog isOpen={showWeddingConfirm} onConfirm={handleWeddingConfirm} onCancel={handleWeddingCancel} />
    </>
  );
}
