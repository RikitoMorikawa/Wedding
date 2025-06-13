"use client";

import { useState, useEffect } from "react";
import { list, getUrl } from "aws-amplify/storage";
import { Photo } from "@/types";

export default function PhotoGallery() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

  useEffect(() => {
    loadPhotos();
  }, []);

  const loadPhotos = async () => {
    try {
      const result = await list({
        prefix: "photos/",
      });

      const photoPromises = result.items.map(async (item) => {
        const url = await getUrl({ key: item.key! });

        return {
          id: item.key!,
          key: item.key!,
          url: url.url.toString(),
          uploadedBy: "Unknown",
          uploadedAt: item.lastModified?.toISOString() || new Date().toISOString(),
          caption: "",
        };
      });

      const loadedPhotos = await Promise.all(photoPromises);
      setPhotos(loadedPhotos.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()));
    } catch (error) {
      console.error("Error loading photos:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="text-center py-8">
          <div className="inline-block p-4 bg-white rounded-full shadow-lg mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-pink-400 to-purple-400 rounded-full animate-pulse"></div>
          </div>
          <div className="text-gray-600">写真を読み込み中...</div>
        </div>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="p-4">
        <div className="text-center py-16">
          <div className="inline-block p-6 bg-white rounded-full shadow-lg mb-6">
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-700 mb-2">まだ写真がありません</h3>
          <p className="text-gray-500 text-sm">右下の＋ボタンから写真をアップロードしてみましょう</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-4">
        {/* ヘッダー */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800">みんなの写真</h2>
            <div className="bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full border border-pink-100">
              <span className="text-sm font-medium text-pink-600">{photos.length}枚</span>
            </div>
          </div>
        </div>

        {/* 写真グリッド */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              className="aspect-square bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer"
              onClick={() => setSelectedPhoto(photo)}
            >
              <img
                src={photo.url}
                alt={photo.caption || `Wedding photo ${index + 1}`}
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
                loading="lazy"
              />
            </div>
          ))}
        </div>

        {/* 最後にスペースを追加 */}
        <div className="h-16"></div>
      </div>

      {/* フルスクリーンモーダル */}
      {selectedPhoto && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center">
          {/* ヘッダー */}
          <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/50 to-transparent p-4">
            <div className="flex items-center justify-between">
              <div className="text-white">
                <p className="text-sm opacity-80">
                  {new Date(selectedPhoto.uploadedAt).toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
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
          </div>

          {/* 写真 */}
          <div className="w-full h-full flex items-center justify-center p-4">
            <img src={selectedPhoto.url} alt={selectedPhoto.caption || "Wedding photo"} className="max-w-full max-h-full object-contain" />
          </div>

          {/* フッター（キャプションがある場合） */}
          {selectedPhoto.caption && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-4">
              <p className="text-white text-center">{selectedPhoto.caption}</p>
            </div>
          )}

          {/* スワイプヒント */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
            <div className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-2">
              <p className="text-white text-xs">タップして閉じる</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
