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
  photoIndex: number;
  url?: string;
}

interface Album {
  albumId: string;
  photos: Photo[];
  mainPhoto: Photo;
  uploadedBy: string;
  uploaderName: string;
  uploadedAt: string;
  caption: string;
  totalPhotos: number;
  mainPhotoUrl?: string;
}

interface PhotoGalleryProps {
  refreshTrigger: number;
}

export default function PhotoGallery({ refreshTrigger }: PhotoGalleryProps) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  // アルバム一覧を取得
  const fetchAlbums = async () => {
    try {
      setLoading(true);

      // DynamoDBからアルバムデータを取得
      const response = await fetch(`${awsconfig.aws_cloud_logic_custom[0].endpoint}/photos/albums`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || "Failed to fetch albums");
      }

      console.log("Albums result:", result.albums);

      // 各アルバムのメイン写真URLを取得
      const albumsWithUrls = await Promise.all(
        result.albums.map(async (album: Album) => {
          try {
            const urlResult = await getUrl({ key: album.mainPhoto.s3Key });
            return {
              ...album,
              mainPhotoUrl: urlResult.url.toString(),
            };
          } catch (error) {
            console.error("Error getting main photo URL for album", album.albumId, ":", error);
            return {
              ...album,
              mainPhotoUrl: undefined,
            };
          }
        })
      );

      // メイン写真URLが取得できたアルバムのみを表示
      const validAlbums = albumsWithUrls.filter((album) => album.mainPhotoUrl);
      setAlbums(validAlbums);
    } catch (error) {
      console.error("Error fetching albums:", error);
    } finally {
      setLoading(false);
    }
  };

  // 選択されたアルバムの全写真URLを取得
  const loadAlbumPhotos = async (album: Album) => {
    try {
      const photosWithUrls = await Promise.all(
        album.photos.map(async (photo) => {
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

      const validPhotos = photosWithUrls.filter((photo) => photo.url);

      setSelectedAlbum({
        ...album,
        photos: validPhotos,
      });
      setCurrentPhotoIndex(0);
    } catch (error) {
      console.error("Error loading album photos:", error);
    }
  };

  const nextPhoto = () => {
    if (selectedAlbum && currentPhotoIndex < selectedAlbum.photos.length - 1) {
      setCurrentPhotoIndex(currentPhotoIndex + 1);
    }
  };

  const prevPhoto = () => {
    if (currentPhotoIndex > 0) {
      setCurrentPhotoIndex(currentPhotoIndex - 1);
    }
  };

  const goToPhoto = (index: number) => {
    setCurrentPhotoIndex(index);
  };

  useEffect(() => {
    fetchAlbums();
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

  if (albums.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 002 2v12a2 2 0 002 2z"
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
      {/* アルバム一覧表示 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {albums.map((album) => (
          <div
            key={album.albumId}
            className="relative aspect-square bg-gray-100 rounded-2xl overflow-hidden cursor-pointer group hover:shadow-lg transition-all duration-200 hover:scale-105"
            onClick={() => loadAlbumPhotos(album)}
          >
            <img src={album.mainPhotoUrl} alt={album.caption || "Wedding album"} className="w-full h-full object-cover" />

            {/* 複数枚表示のバッジ */}
            {album.totalPhotos > 1 && (
              <div className="absolute top-2 right-2">
                <div className="bg-black/70 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center space-x-1">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                  <span className="text-white text-xs font-medium">{album.totalPhotos}</span>
                </div>
              </div>
            )}

            {/* ホバー時のオーバーレイ */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-200" />

            {/* 投稿者情報（常に表示） */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
              <p className="text-white text-xs font-medium truncate">{album.uploaderName || album.uploadedBy}</p>
              {album.caption && <p className="text-white/80 text-xs truncate mt-1">{album.caption}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* アルバム詳細表示モーダル（スライド機能付き） */}
      {selectedAlbum && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="relative max-w-4xl w-full h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* ヘッダー */}
            <div className="flex justify-between items-center p-4">
              <div className="text-white">
                <p className="font-semibold text-lg">{selectedAlbum.uploaderName || selectedAlbum.uploadedBy}</p>
                <p className="text-sm opacity-80">
                  {new Date(selectedAlbum.uploadedAt).toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {selectedAlbum.totalPhotos > 1 && (
                    <span className="ml-2">
                      • {currentPhotoIndex + 1}/{selectedAlbum.totalPhotos}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setSelectedAlbum(null)}
                className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 写真表示エリア */}
            <div className="flex-1 flex items-center justify-center relative px-4" style={{ paddingBottom: selectedAlbum.caption ? "140px" : "20px" }}>
              {/* メイン写真 */}
              <img
                src={selectedAlbum.photos[currentPhotoIndex]?.url}
                alt={selectedAlbum.caption || "Wedding photo"}
                className="max-w-full max-h-full object-contain"
              />

              {/* 前の写真ボタン */}
              {selectedAlbum.totalPhotos > 1 && currentPhotoIndex > 0 && (
                <button
                  onClick={prevPhoto}
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}

              {/* 次の写真ボタン */}
              {selectedAlbum.totalPhotos > 1 && currentPhotoIndex < selectedAlbum.totalPhotos - 1 && (
                <button
                  onClick={nextPhoto}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>

            {/* サムネイル表示（複数枚の場合） */}
            {selectedAlbum.totalPhotos > 1 && (
              <div className="absolute bottom-20 left-4 right-4">
                <div className="flex justify-center space-x-2 overflow-x-auto pb-2">
                  {selectedAlbum.photos.map((photo, index) => (
                    <button
                      key={photo.photoId}
                      onClick={() => goToPhoto(index)}
                      className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                        currentPhotoIndex === index ? "border-pink-400 scale-110" : "border-white/30 hover:border-white/60"
                      }`}
                    >
                      <img src={photo.url} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* キャプション - 下部に固定表示 */}
            {selectedAlbum.caption && (
              <div className="absolute bottom-4 left-4 right-4">
                <div className="bg-gradient-to-r from-pink-500/90 to-rose-500/90 backdrop-blur-sm rounded-2xl px-5 py-5 shadow-lg max-h-32">
                  <div className="max-h-20 overflow-y-auto scrollbar-thin scrollbar-thumb-white/30 scrollbar-track-transparent">
                    <p className="text-white text-xs font-medium text-center leading-relaxed whitespace-pre-wrap">{selectedAlbum.caption}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
