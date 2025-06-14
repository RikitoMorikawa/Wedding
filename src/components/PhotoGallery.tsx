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
  favoriteCount?: number; // お気に入り数を追加
}

interface PhotoGalleryProps {
  refreshTrigger: number;
  userInfo: { passcode: string; name: string } | null;
}

export default function PhotoGallery({ refreshTrigger, userInfo }: PhotoGalleryProps) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [userFavorites, setUserFavorites] = useState<Set<string>>(new Set());
  const [favoriteLoading, setFavoriteLoading] = useState<string | null>(null);

  // ユーザーのお気に入り一覧を取得
  const fetchUserFavorites = async () => {
    try {
      if (!userInfo) return;

      console.log("Fetching user favorites for:", userInfo.passcode);

      const response = await fetch(`${awsconfig.aws_cloud_logic_custom[0].endpoint}/favorites`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "user-id": userInfo.passcode,
        },
      });

      console.log("Favorites response status:", response.status);

      if (!response.ok) {
        console.error("Favorites request failed:", response.status, response.statusText);
        return; // エラーでも処理を続行
      }

      const result = await response.json();
      console.log("Favorites result:", result);

      if (result.success) {
        setUserFavorites(new Set(result.favorites));
      }
    } catch (error) {
      console.error("Error fetching user favorites:", error);
      // エラーでも処理を続行（お気に入り機能なしで動作）
    }
  };

  // アルバム一覧を取得（お気に入り数付き）
  const fetchAlbums = async () => {
    try {
      setLoading(true);

      console.log("Fetching albums with favorites...");

      // まずお気に入り数付きのAPIを試す
      let response = await fetch(`${awsconfig.aws_cloud_logic_custom[0].endpoint}/photos/albums-with-favorites`);
      let result = await response.json();

      // お気に入り数付きAPIが失敗した場合、通常のAPIにフォールバック
      if (!result.success) {
        console.log("Falling back to regular albums API");
        response = await fetch(`${awsconfig.aws_cloud_logic_custom[0].endpoint}/photos/albums`);
        result = await response.json();

        if (!result.success) {
          throw new Error(result.message || "Failed to fetch albums");
        }

        // お気に入り数を0で初期化
        result.albums = result.albums.map((album: Album) => ({
          ...album,
          favoriteCount: 0,
        }));
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

  // お気に入りの切り替え
  const toggleFavorite = async (albumId: string) => {
    try {
      if (!userInfo) return;

      console.log("Toggling favorite for album:", albumId, "user:", userInfo.passcode);

      setFavoriteLoading(albumId);
      const isFavorited = userFavorites.has(albumId);

      const response = await fetch(`${awsconfig.aws_cloud_logic_custom[0].endpoint}/albums/${albumId}/favorite`, {
        method: isFavorited ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
          "user-id": userInfo.passcode,
        },
      });

      console.log("Toggle favorite response:", response.status);

      if (!response.ok) {
        console.error("Failed to toggle favorite:", response.status, response.statusText);
        return;
      }

      const result = await response.json();
      console.log("Toggle favorite result:", result);

      if (result.success) {
        // ローカル状態を更新
        setUserFavorites((prev) => {
          const newSet = new Set(prev);
          if (isFavorited) {
            newSet.delete(albumId);
          } else {
            newSet.add(albumId);
          }
          return newSet;
        });

        // アルバム一覧のお気に入り数を更新
        setAlbums((prev) =>
          prev.map((album) => {
            if (album.albumId === albumId) {
              return {
                ...album,
                favoriteCount: (album.favoriteCount || 0) + (isFavorited ? -1 : 1),
              };
            }
            return album;
          })
        );

        // 選択中のアルバムも更新
        if (selectedAlbum && selectedAlbum.albumId === albumId) {
          setSelectedAlbum((prev) =>
            prev
              ? {
                  ...prev,
                  favoriteCount: (prev.favoriteCount || 0) + (isFavorited ? -1 : 1),
                }
              : null
          );
        }
      } else {
        console.error("Failed to toggle favorite:", result.error);
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
    } finally {
      setFavoriteLoading(null);
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
    fetchUserFavorites();
  }, [refreshTrigger, userInfo]);

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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mx-2">
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

            {/* お気に入り数表示 */}
            {(album.favoriteCount || 0) > 0 && (
              <div className="absolute top-2 left-2">
                <div className="bg-red-500/90 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center space-x-1">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                  <span className="text-white text-xs font-medium">{album.favoriteCount}</span>
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

              {/* お気に入りボタン */}
              <div className="absolute bottom-20 right-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(selectedAlbum.albumId);
                  }}
                  disabled={favoriteLoading === selectedAlbum.albumId}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                    userFavorites.has(selectedAlbum.albumId) ? "bg-red-500 scale-110" : "bg-white/20 backdrop-blur-sm hover:bg-white/30"
                  } ${favoriteLoading === selectedAlbum.albumId ? "opacity-50" : ""}`}
                >
                  {favoriteLoading === selectedAlbum.albumId ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <svg
                      className="w-6 h-6 text-white"
                      fill={userFavorites.has(selectedAlbum.albumId) ? "currentColor" : "none"}
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                      />
                    </svg>
                  )}
                </button>
                {/* お気に入り数表示 */}
                {(selectedAlbum.favoriteCount || 0) > 0 && (
                  <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                    {selectedAlbum.favoriteCount}
                  </div>
                )}
              </div>
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
