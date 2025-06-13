"use client";

import { useState } from "react";
import { Amplify } from "aws-amplify";
import { uploadData } from "aws-amplify/storage";
import { getCurrentUser } from "aws-amplify/auth";
import { v4 as uuidv4 } from "uuid";
import awsconfig from "../aws-exports";

// Amplifyの設定
Amplify.configure(awsconfig);

interface PhotoUploadProps {
  onUploadSuccess: () => void;
  userInfo: { passcode: string; name: string } | null;
}

export default function PhotoUpload({ onUploadSuccess, userInfo }: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setSelectedFile(file);
    } else {
      alert("画像ファイルを選択してください");
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !userInfo) return;

    setUploading(true);
    try {
      const user = await getCurrentUser();
      const photoId = uuidv4();
      const fileKey = `photos/${photoId}-${selectedFile.name}`;

      // S3にファイルをアップロード（metadataから日本語文字を除去）
      const result = await uploadData({
        key: fileKey,
        data: selectedFile,
        options: {
          metadata: {
            uploadedBy: user.username,
            // caption と uploaderName は日本語が含まれる可能性があるため削除
            uploadedAt: new Date().toISOString(),
            photoId: photoId, // 必要であれば追加
          },
        },
      }).result;

      console.log("S3 upload successful:", result);

      // DynamoDBに写真メタデータを保存（日本語文字はここで保存）
      const response = await fetch(`${awsconfig.aws_cloud_logic_custom[0].endpoint}/photos/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          photoId: photoId,
          uploadedBy: user.username,
          caption: caption, // 日本語をDynamoDBに保存
          s3Key: fileKey,
          uploaderName: userInfo.name, // 日本語をDynamoDBに保存
        }),
      });

      const saveResult = await response.json();

      if (!saveResult.success) {
        throw new Error(saveResult.message || "Failed to save photo metadata");
      }

      console.log("Photo metadata saved successfully");

      // Reset form
      setSelectedFile(null);
      setCaption("");
      const fileInput = document.getElementById("file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      onUploadSuccess();
      alert("写真をアップロードしました！");
    } catch (error) {
      console.error("Upload error:", error);
      alert("アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ファイル選択エリア */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">写真を選択</label>

        {!selectedFile ? (
          <label
            htmlFor="file-input"
            className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-pink-300 rounded-2xl cursor-pointer bg-pink-50/50 hover:bg-pink-50 transition-colors"
          >
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <svg className="w-8 h-8 mb-2 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <p className="text-sm text-pink-600 font-medium">写真をタップして選択</p>
              <p className="text-xs text-gray-500">JPG, PNG, GIF</p>
            </div>
            <input id="file-input" type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
          </label>
        ) : (
          <div className="relative">
            <img src={URL.createObjectURL(selectedFile)} alt="Preview" className="w-full h-64 object-cover rounded-2xl" />
            <button
              onClick={() => {
                setSelectedFile(null);
                const fileInput = document.getElementById("file-input") as HTMLInputElement;
                if (fileInput) fileInput.value = "";
              }}
              className="absolute top-2 right-2 w-8 h-8 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm rounded-lg px-2 py-1">
              <p className="text-white text-xs">{selectedFile.name}</p>
            </div>
          </div>
        )}
      </div>

      {/* キャプション入力 */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">コメント（任意）</label>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={3}
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-pink-400 focus:ring-4 focus:ring-pink-100 transition-all duration-200 bg-gray-50/50 resize-none"
          placeholder="この写真について一言..."
          disabled={uploading}
        />
      </div>

      {/* アップロードボタン */}
      <button
        onClick={handleUpload}
        disabled={!selectedFile || uploading}
        className={`w-full py-4 px-6 rounded-2xl font-bold transition-all duration-200 ${
          !selectedFile || uploading
            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
            : "bg-gradient-to-r from-pink-500 to-rose-500 text-white hover:from-pink-600 hover:to-rose-600 active:scale-95 shadow-lg hover:shadow-xl"
        }`}
      >
        {uploading ? (
          <div className="flex items-center justify-center space-x-2">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            <span>アップロード中...</span>
          </div>
        ) : (
          "写真をアップロード"
        )}
      </button>
    </div>
  );
}
