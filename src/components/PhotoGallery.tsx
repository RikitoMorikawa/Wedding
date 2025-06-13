"use client";

import { useState, useEffect } from "react";
import { Amplify } from "aws-amplify";
import { getUrl } from "aws-amplify/storage";
import awsconfig from "../aws-exports";

// Amplifyの設定
Amplify.configure(awsconfig);

interface Photo {
  photoId: string;
  uploadedBy: string;
  uploaderName: string;
  caption: string;
  uploadedAt: string;
  s3Key: string;
  url?: string;
}

interface PhotoGalleryProps {
  refreshTrigger: number;
}

export default function PhotoGallery({ refreshTrigger }: PhotoGalleryProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

  // 写真一覧を取得
  const fetchPhotos = async () => {
    try {
      setLoading(true);

      // DynamoDBから写真メタデータを取得
      const response = await fetch(`${awsconfig.aws_cloud_logic_custom[0].endpoint}/photos/list`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || "Failed to fetch photos");
      }

      // 各写真のS3 URLを取得
      const photosWithUrls = await Promise.all(
        result.photos.map(async (photo: Photo) => {
          try {
            const urlResult = await getUrl({ key: photo.s3Key });
            return {
              ...photo,
              url: urlResult.url.toString(),
            };
          } catch (error) {
            console.error("Error getting photo URL:", error);
            return {
              ...photo,
              url: undefined,
            };
          }
        })
      );

      // アップロード日時で降順ソート
      const sortedPhotos = photosWithUrls
        .filter((photo) => photo.url) // URLが取得できた写真のみ
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

      setPhotos(sortedPhotos);
    } catch (error) {
      console.error("Error fetching photos:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPhotos();
  }, [refreshTrigger]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-8 h-8 border-2 border-pink-300 border-t-pink-600 rounded-full animate-spin"></div>
          <p className="text-gray-600">写真を読み込み中...</p>
        </div>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">まだ写真がありません</h3>
        <p className="text-gray-600">最初の写真をアップロードしてみましょう！</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {photos.map((photo) => (
          <div
            key={photo.photoId}
            className="relative aspect-square bg-gray-100 rounded-2xl overflow-hidden cursor-pointer group hover:shadow-lg transition-all duration-200 hover:scale-105"
            onClick={() => setSelectedPhoto(photo)}
          >
            <img src={photo.url} alt={photo.caption || "Wedding photo"} className="w-full h-full object-cover" />

            {/* ホバー時のオーバーレイ */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-200" />

            {/* 投稿者情報（常に表示） */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
              <p className="text-white text-xs font-medium truncate">{photo.uploaderName || photo.uploadedBy}</p>
              {photo.caption && <p className="text-white/80 text-xs truncate mt-1">{photo.caption}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* フルスクリーン表示モーダル */}
      {selectedPhoto && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedPhoto(null)}>
          <div className="relative max-w-4xl w-full h-full flex flex-col">
            {/* ヘッダー */}
            <div className="flex justify-between items-center p-4">
              <div className="text-white">
                <p className="font-semibold text-lg">{selectedPhoto.uploaderName || selectedPhoto.uploadedBy}</p>
                <p className="text-sm opacity-80">
                  {new Date(selectedPhoto.uploadedAt).toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <button
                onClick={() => setSelectedPhoto(null)}
                className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 写真 */}
            <div className="flex-1 flex items-center justify-center">
              <img src={selectedPhoto.url} alt={selectedPhoto.caption || "Wedding photo"} className="max-w-full max-h-full object-contain" />
            </div>

            {/* フッター（キャプションと投稿者情報） */}
            <div className="bg-gradient-to-t from-black/80 to-transparent p-6">
              <div className="text-center text-white">
                <p className="font-semibold text-lg mb-2">{selectedPhoto.uploaderName || selectedPhoto.uploadedBy}</p>
                {selectedPhoto.caption && <p className="text-white/90 mb-2">{selectedPhoto.caption}</p>}
                <p className="text-white/70 text-sm">
                  {new Date(selectedPhoto.uploadedAt).toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>

            {/* スワイプヒント */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
              <div className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-2">
                <p className="text-white text-xs">タップして閉じる</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
