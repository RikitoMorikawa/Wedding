// src/components/PhotoUpload.tsx - 元の実装ベース（最小限修正版）
"use client";

import { useState, useRef } from "react";
import { Amplify } from "aws-amplify";
import { getCurrentUser } from "aws-amplify/auth";
import { v4 as uuidv4 } from "uuid";
import awsconfig from "../aws-exports";
import WeddingConfirmDialog from "./WeddingConfirmDialog";
import BubblyButton from "./BubblyButton";
import { useLanguage } from "@/contexts/LanguageContext";

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

// バランス型設定
const MAX_PHOTO_FILES = 20;
const MAX_VIDEO_FILES = 3;
const MAX_PHOTO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB
const MAX_TOTAL_SIZE = 500 * 1024 * 1024; // 500MB

export default function PhotoUpload({ onUploadSuccess, userInfo, selectedMediaType }: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [caption, setCaption] = useState("");
  const [showWeddingConfirm, setShowWeddingConfirm] = useState(false);

  const { t } = useLanguage();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const API_BASE = awsconfig.aws_cloud_logic_custom[0].endpoint;

  // メディアタイプ別の制限値を取得
  const getMaxFiles = () => (selectedMediaType === "photo" ? MAX_PHOTO_FILES : MAX_VIDEO_FILES);
  const getMaxSize = () => (selectedMediaType === "photo" ? MAX_PHOTO_SIZE : MAX_VIDEO_SIZE);
  const getMaxSizeText = () => (selectedMediaType === "photo" ? "50MB" : "200MB");

  // 🔧 修正：ファイル選択処理（ファイル形式チェック改善）
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const maxFiles = getMaxFiles();

    let validFiles: File[] = [];

    // 🔧 修正：ファイル形式チェック改善
    if (selectedMediaType === "photo") {
      validFiles = files.filter((file) => {
        const isImage = file.type.startsWith("image/");
        const hasValidExt = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
        return isImage && hasValidExt;
      });
      if (validFiles.length !== files.length) {
        alert(t("photo_files_only"));
      }
    } else if (selectedMediaType === "video") {
      validFiles = files.filter((file) => {
        const isVideo = file.type.startsWith("video/");
        const hasValidExt = /\.(mp4|mov|avi|quicktime)$/i.test(file.name);
        return isVideo || hasValidExt; // 動画はファイル拡張子も考慮
      });
      if (validFiles.length !== files.length) {
        alert(t("video_files_only"));
      }
    }

    if (validFiles.length === 0) {
      alert(t("select_file_type").replace("ファイル", selectedMediaType === "photo" ? t("image") : t("video")));
      return;
    }

    // メディアタイプ別枚数制限チェック
    if (selectedFiles.length + validFiles.length > maxFiles) {
      const mediaTypeText = selectedMediaType === "photo" ? t("photo") : t("video");
      const timeEstimate = selectedMediaType === "photo" ? "" : t("time_estimate_1_2min");
      alert(
        `${mediaTypeText}${t("file_count_limit").replace("{max}", maxFiles.toString())}${timeEstimate}\n\n${t("current_count").replace(
          "{current}",
          selectedFiles.length.toString()
        )}\n${t("adding_count").replace("{adding}", validFiles.length.toString())}\n${t("limit_count").replace("{limit}", maxFiles.toString())}`
      );
      return;
    }

    // 個別ファイルサイズチェック
    const maxSize = getMaxSize();
    const oversizedFiles = validFiles.filter((file) => file.size > maxSize);

    if (oversizedFiles.length > 0) {
      const maxSizeText = getMaxSizeText();
      const mediaTypeText = selectedMediaType === "photo" ? t("image") : t("video");
      const description = selectedMediaType === "photo" ? t("pro_photo_support") : t("video_duration_support");
      alert(
        `${mediaTypeText}${t("file_size_limit").replace("{size}", maxSizeText)}${description}\n\n${t("files_too_large")}\n${oversizedFiles
          .map((f) => `${f.name} (${(f.size / (1024 * 1024)).toFixed(1)}MB)`)
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
        `${t("total_size_exceeded")}\n\n${t("current_total").replace("{size}", totalSizeMB)}\n${t("size_limit").replace("{limit}", maxTotalSizeMB)}\n\n${t(
          "reduce_files_message"
        )}`
      );
      return;
    }

    // 🔧 修正：プレビュー生成を即座に行う（元の実装と同じ）
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

  // ✅ 元の実装のバッチアップロード処理（そのまま）
  const performBatchUpload = async () => {
    if (selectedFiles.length === 0 || !userInfo) return;

    animateButton();
    setUploading(true);

    try {
      const user = await getCurrentUser();
      const albumId = uuidv4();
      const uploadedAt = new Date().toISOString();

      // Step 1: 署名付きURLを一括取得
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

      // Step 2: 全ファイルをS3に並行アップロード
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

      // Step 3: 1回のAPIで全メタデータを保存
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
        throw new Error(saveResult.message || "Failed to save album metadata");
      }

      console.log(`✅ アルバム保存完了: ${saveResult.totalFiles}ファイル、${saveResult.batches}バッチ`);

      // 完了処理
      selectedFiles.forEach((file) => URL.revokeObjectURL(file.preview));
      setSelectedFiles([]);
      setCaption("");
      const fileInput = document.getElementById("file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      setTimeout(() => {
        onUploadSuccess();
      }, 1000);
    } catch (error) {
      console.error("Batch upload error:", error);

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
        onUploadSuccess();
      }, 2000);
    } finally {
      setUploading(false);
    }
  };

  const totalFileSize = selectedFiles.reduce((sum, file) => sum + file.file.size, 0) / (1024 * 1024);
  const maxTotalSizeMB = MAX_TOTAL_SIZE / (1024 * 1024);
  const maxFiles = getMaxFiles();

  return (
    <>
      <div className="space-y-4">
        {/* ファイル選択エリア */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            {selectedMediaType === "photo" ? t("photo") : t("video")}
            {t("select_files")} ({selectedFiles.length}/{maxFiles}
            {t("files_count")})
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
                  ? `${selectedMediaType === "photo" ? t("photo") : t("video")}${t("tap_to_select")}`
                  : `${selectedMediaType === "photo" ? t("photo") : t("video")}${t("add_files")}`}
              </p>
              <p className="text-xs text-gray-500 mt-1">{selectedMediaType === "photo" ? t("file_formats_photo") : t("file_formats_video")}</p>
              <p className="text-xs text-gray-400 mt-1">
                {t("max_files_total_size").replace("{maxFiles}", maxFiles.toString()).replace("{totalSize}", maxTotalSizeMB.toString())}
              </p>
            </div>
            <input
              id="file-input"
              type="file"
              accept={selectedMediaType === "photo" ? "image/*" : "video/*"}
              multiple
              onChange={handleFileSelect}
              className="hidden"
              disabled={selectedFiles.length >= maxFiles || uploading}
            />
          </label>
        </div>

        {/* 選択されたファイルの情報 */}
        {selectedFiles.length > 0 && (
          <div className="bg-pink-50/50 rounded-2xl p-3">
            <div className="mb-2">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">
                {t("selected_files")}
                {selectedMediaType === "photo" ? t("photo") : t("video")} ({selectedFiles.length}/{maxFiles}
                {t("files_count")}){selectedFiles.length === maxFiles && <span className="ml-2 text-xs text-orange-600">{t("limit_reached")}</span>}
              </h3>
              <div className="text-right">
                <button onClick={removeAllFiles} className="text-xs text-red-500 hover:text-red-700 font-medium" disabled={uploading}>
                  {t("remove_all")}
                </button>
              </div>
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
                        {index === 0 && <span className="ml-1 text-pink-600">{selectedMediaType === "photo" ? t("main_photo") : t("main_video")}</span>}
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

        {/* キャプション入力 */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            {t("comment_optional")}
            {selectedFiles.length > 1 && <span className="text-xs text-gray-500 ml-2">{t("album_comment_note")}</span>}
          </label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-pink-400 focus:ring-4 focus:ring-pink-100 transition-all duration-200 bg-gray-50/50 resize-none"
            placeholder={selectedFiles.length > 1 ? t("album_comment_placeholder") : t("single_comment_placeholder")}
            disabled={uploading}
          />
        </div>

        {/* アップロードボタン */}
        <div className="pt-3">
          <BubblyButton ref={buttonRef} onClick={handleUploadClick} disabled={selectedFiles.length === 0 || uploading}>
            {uploading ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>{t("uploading")}</span>
              </div>
            ) : (
              `${
                selectedFiles.length === 0
                  ? `${selectedMediaType === "photo" ? t("photo") : t("video")}${t("please_select")}`
                  : selectedFiles.length === 1
                  ? `${selectedMediaType === "photo" ? t("photo") : t("video")}${t("upload_files")}`
                  : `${selectedFiles.length}${t("files_count")}${t("bulk_upload")}`
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
