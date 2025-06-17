"use client";

import { useState, useEffect } from "react";
import { Amplify } from "aws-amplify";
import { getUrl } from "aws-amplify/storage";
import awsconfig from "../aws-exports";
import ConfirmDialog from "./ConfirmDialog";

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
  mediaType?: "photo" | "video";
  fileType?: string;
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
  favoriteCount?: number;
  isFavorite?: boolean;
  isPublic?: boolean;
  mediaType?: "photo" | "video";
}

interface PhotoGalleryProps {
  refreshTrigger: number;
  userInfo: {
    passcode: string;
    name: string;
  } | null;
}

// ソートタイプの定義
type SortType = "date" | "favorites";

export default function PhotoGallery({ refreshTrigger, userInfo }: PhotoGalleryProps) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [sortType, setSortType] = useState<SortType>("date"); // ソートタイプを管理
  const [visibilityLoading, setVisibilityLoading] = useState(false); // 削除/復元切り替えのローディング状態
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<"all" | "photo" | "video">("all");

  // フィルター適用関数を追加
  const getFilteredAlbums = () => {
    if (mediaFilter === "all") {
      return albums;
    }

    return albums.filter((album) => {
      // アルバムのメイン写真のmediaTypeでフィルタリング
      return album.mainPhoto?.mediaType === mediaFilter;
    });
  };

  // API Base URL
  const API_BASE = awsconfig.aws_cloud_logic_custom[0].endpoint;

  // お気に入り件数を取得（エラーハンドリング強化）
  const fetchFavoriteCount = async (targetType: string, targetId: string): Promise<number> => {
    try {
      const response = await fetch(`${API_BASE}/favorites/count/${targetType}/${targetId}`);

      // レスポンスステータスをチェック
      if (!response.ok) {
        console.warn(`Favorite count API returned ${response.status} for ${targetId}`);
        return 0;
      }

      const result = await response.json();
      return result.success ? result.count : 0;
    } catch (error) {
      console.error("Error fetching favorite count:", error);
      return 0;
    }
  };

  // ユーザーのお気に入り状態をチェック（エラーハンドリング強化）
  const checkFavoriteStatus = async (targetType: string, targetId: string): Promise<boolean> => {
    if (!userInfo?.passcode) return false;

    try {
      const response = await fetch(`${API_BASE}/favorites/check/${userInfo.passcode}/${targetType}/${targetId}`);

      // レスポンスステータスをチェック
      if (!response.ok) {
        console.warn(`Favorite check API returned ${response.status} for ${targetId}`);
        return false;
      }

      const result = await response.json();
      return result.success ? result.isFavorite : false;
    } catch (error) {
      console.error("Error checking favorite status:", error);
      return false;
    }
  };

  // お気に入り追加/削除（エラーハンドリング強化）
  const toggleFavorite = async (targetType: string, targetId: string): Promise<boolean> => {
    if (!userInfo?.passcode) return false;

    setFavoriteLoading(true);

    try {
      const currentStatus = await checkFavoriteStatus(targetType, targetId);
      const action = currentStatus ? "remove" : "add";

      const response = await fetch(`${API_BASE}/favorites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: userInfo.passcode,
          targetType: targetType,
          targetId: targetId,
          action: action,
        }),
      });

      // レスポンスステータスをチェック
      if (!response.ok) {
        console.warn(`Toggle favorite API returned ${response.status}`);
        return currentStatus; // 元の状態を返す
      }

      const result = await response.json();

      if (result.success) {
        // 選択中のアルバムの状態を更新（エラーハンドリング付き）
        if (selectedAlbum && selectedAlbum.albumId === targetId) {
          try {
            const [newFavoriteCount, newIsFavorite] = await Promise.allSettled([
              fetchFavoriteCount(targetType, targetId),
              checkFavoriteStatus(targetType, targetId),
            ]);

            setSelectedAlbum((prev) =>
              prev
                ? {
                    ...prev,
                    favoriteCount: newFavoriteCount.status === "fulfilled" ? newFavoriteCount.value : prev.favoriteCount,
                    isFavorite: newIsFavorite.status === "fulfilled" ? newIsFavorite.value : !currentStatus,
                  }
                : null
            );
          } catch (error) {
            console.warn("Error updating selected album favorite status:", error);
          }
        }

        // アルバム一覧の状態も更新（非同期で実行して遅延を最小化）
        fetchAlbums().catch((err) => console.warn("Error refreshing albums:", err));

        return !currentStatus;
      }

      return currentStatus;
    } catch (error) {
      console.error("Error toggling favorite:", error);
      return false;
    } finally {
      setFavoriteLoading(false);
    }
  };

  // 写真の削除/復元切り替え
  const toggleVisibility = async (albumId: string, currentStatus: boolean): Promise<boolean> => {
    if (!userInfo?.passcode) return currentStatus;

    setVisibilityLoading(true);

    try {
      const response = await fetch(`${API_BASE}/photos/album/${albumId}/visibility`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isPublic: !currentStatus,
          passcode: userInfo.passcode,
        }),
      });

      if (!response.ok) {
        console.warn(`Toggle visibility API returned ${response.status}`);
        return currentStatus;
      }

      const result = await response.json();

      if (result.success) {
        // 選択中のアルバムの状態を更新
        if (selectedAlbum && selectedAlbum.albumId === albumId) {
          setSelectedAlbum((prev) =>
            prev
              ? {
                  ...prev,
                  isPublic: !currentStatus,
                }
              : null
          );
        }

        // アルバム一覧の状態も更新
        fetchAlbums().catch((err) => console.warn("Error refreshing albums:", err));

        return !currentStatus;
      }

      return currentStatus;
    } catch (error) {
      console.error("Error toggling visibility:", error);
      alert("削除/復元の切り替えに失敗しました。もう一度お試しください。");
      return currentStatus;
    } finally {
      setVisibilityLoading(false);
    }
  };

  // アルバムをソートする関数
  const sortAlbums = (albumsList: Album[], sortType: SortType): Album[] => {
    const sortedAlbums = [...albumsList];

    switch (sortType) {
      case "favorites":
        return sortedAlbums.sort((a, b) => {
          // お気に入り件数の多い順（降順）
          const aCount = a.favoriteCount || 0;
          const bCount = b.favoriteCount || 0;
          if (bCount !== aCount) {
            return bCount - aCount;
          }
          // お気に入り件数が同じ場合は投稿日順（新しい順）
          return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
        });
      case "date":
      default:
        return sortedAlbums.sort((a, b) => {
          // 投稿日順（新しい順）
          return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
        });
    }
  };

  // 現在のユーザーが投稿者かどうかをチェック
  const isOwner = (album: Album): boolean => {
    return userInfo?.passcode === album.uploadedBy;
  };

  // 確認ダイアログでOKを選択した場合
  const handleConfirmClose = () => {
    setShowConfirmDialog(false);
    setSelectedAlbum(null);
  };

  // 確認ダイアログでキャンセルを選択した場合
  const handleCancelClose = () => {
    setShowConfirmDialog(false);
    // モーダルは開いたまま
  };

  // アルバム一覧を取得（お気に入り情報付き・エラーハンドリング強化）
  // PhotoGallery.tsx の fetchAlbums 関数を以下に置き換えてください

  const fetchAlbums = async () => {
    try {
      setLoading(true);

      // DynamoDBからアルバムデータを取得
      const response = await fetch(`${API_BASE}/photos/albums`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || "Failed to fetch albums");
      }

      // 各アルバムのメイン写真URLとお気に入り情報を取得
      const albumsWithData = await Promise.all(
        result.albums.map(async (album: Album) => {
          try {
            // メイン写真URL取得
            try {
              const urlResult = await getUrl({ key: album.mainPhoto.s3Key });

              // お気に入り情報を並列取得（エラーが発生しても他の処理を続行）
              const [favoriteCount, isFavorite] = await Promise.allSettled([
                fetchFavoriteCount("album", album.albumId),
                checkFavoriteStatus("album", album.albumId),
              ]);

              const processedAlbum = {
                ...album,
                mainPhotoUrl: urlResult.url.toString(),
                favoriteCount: favoriteCount.status === "fulfilled" ? favoriteCount.value : 0,
                isFavorite: isFavorite.status === "fulfilled" ? isFavorite.value : false,
                isPublic: album.isPublic !== false, // デフォルトは公開（既存データ互換性）
              };

              return processedAlbum;
            } catch (urlError) {
              console.error(`❌ Error generating URL for album ${album.albumId}:`, urlError);
              console.error("S3 Key that failed:", album.mainPhoto.s3Key);

              // URL生成に失敗したアルバムはundefinedのmainPhotoUrlを持つ
              return {
                ...album,
                mainPhotoUrl: undefined,
                favoriteCount: 0,
                isFavorite: false,
                isPublic: true, // デフォルトは公開
              };
            }
          } catch (error) {
            console.error("❌ Error getting album data for", album.albumId, ":", error);
            return {
              ...album,
              mainPhotoUrl: undefined,
              favoriteCount: 0,
              isFavorite: false,
              isPublic: true, // デフォルトは公開
            };
          }
        })
      );

      // 失敗したアルバムの詳細をログ出力
      const failedAlbums = albumsWithData.filter((album) => !album.mainPhotoUrl);
      if (failedAlbums.length > 0) {
        console.log(
          "❌ Failed albums:",
          failedAlbums.map((album) => ({
            albumId: album.albumId,
            s3Key: album.mainPhoto?.s3Key,
            mediaType: album.mainPhoto?.mediaType,
          }))
        );
      }

      // メイン写真URLが取得できたアルバムのみを表示
      const validAlbums = albumsWithData.filter((album) => album.mainPhotoUrl);

      // ソート適用
      const sortedAlbums = sortAlbums(validAlbums, sortType);
      setAlbums(sortedAlbums);
    } catch (error) {
      console.error("❌ Error fetching albums:", error);
    } finally {
      setLoading(false);
    }
  };

  // 選択されたアルバムの全写真URLとお気に入り情報を取得
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

      // お気に入り情報を取得
      const favoriteCount = await fetchFavoriteCount("album", album.albumId);
      const isFavorite = await checkFavoriteStatus("album", album.albumId);

      setSelectedAlbum({
        ...album,
        photos: validPhotos,
        favoriteCount: favoriteCount,
        isFavorite: isFavorite,
        isPublic: album.isPublic !== false, // デフォルトは公開
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

  // ソートタイプが変更されたときにアルバムを再ソート
  const handleSortChange = (newSortType: SortType) => {
    setSortType(newSortType);
    const sortedAlbums = sortAlbums(albums, newSortType);
    setAlbums(sortedAlbums);
  };

  // モーダルを閉じる際の確認処理
  const handleCloseModal = () => {
    // 削除済み（isPublic=false）の写真の場合は確認ダイアログを表示
    if (selectedAlbum && selectedAlbum.isPublic === false && isOwner(selectedAlbum)) {
      setShowConfirmDialog(true);
    } else {
      // 通常の場合はそのまま閉じる
      setSelectedAlbum(null);
    }
  };

  useEffect(() => {
    fetchAlbums();
  }, [refreshTrigger, userInfo]);

  // ソートタイプが変更されたときに再ソート
  useEffect(() => {
    if (albums.length > 0) {
      const sortedAlbums = sortAlbums(albums, sortType);
      setAlbums(sortedAlbums);
    }
  }, [sortType]);

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
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-gray-200/50 px-4 py-3">
        <div className="flex justify-center space-x-2">
          <button
            onClick={() => setMediaFilter("all")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
              mediaFilter === "all" ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            すべて
          </button>
          <button
            onClick={() => setMediaFilter("photo")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center space-x-1 ${
              mediaFilter === "photo" ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span>写真のみ</span>
          </button>
          <button
            onClick={() => setMediaFilter("video")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center space-x-1 ${
              mediaFilter === "video" ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            <span>動画のみ</span>
          </button>
        </div>
      </div>
      {/* 固定ソート切り替えボタン（画面左下・1行2列） */}
      <div className="fixed bottom-4 left-4 z-40">
        <div className="bg-white rounded-lg shadow-lg border p-1 flex">
          <button
            onClick={() => handleSortChange("date")}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
              sortType === "date" ? "bg-pink-500 text-white shadow-sm" : "text-gray-600 hover:text-gray-800 hover:bg-gray-50"
            }`}
          >
            <div className="flex items-center space-x-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span>投稿順</span>
            </div>
          </button>
          <button
            onClick={() => handleSortChange("favorites")}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
              sortType === "favorites" ? "bg-pink-500 text-white shadow-sm" : "text-gray-600 hover:text-gray-800 hover:bg-gray-50"
            }`}
          >
            <div className="flex items-center space-x-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              <span>人気順</span>
            </div>
          </button>
        </div>
      </div>
      {/* アルバム一覧表示 */}
      {getFilteredAlbums().length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📸</div>
          <p className="text-gray-500 text-lg">
            {mediaFilter === "all" ? "まだ写真がアップロードされていません" : mediaFilter === "photo" ? "写真がありません" : "動画がありません"}
          </p>
          <p className="text-gray-400 text-sm mt-2">
            {mediaFilter === "all" ? "最初の思い出を共有してみましょう！" : "他のメディアタイプを確認してみてください"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mx-2 mt-2 pb-20">
          {getFilteredAlbums().map((album) => (
            <div
              key={album.albumId}
              className="relative aspect-square bg-gray-100 rounded-2xl overflow-hidden cursor-pointer group hover:shadow-lg transition-all duration-200 hover:scale-105"
              onClick={() => loadAlbumPhotos(album)}
            >
              {/* メイン画像/動画の表示 */}
              {album.mainPhoto?.mediaType === "video" ? (
                <div className="relative w-full h-full">
                  <video
                    src={album.mainPhotoUrl}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                    poster={album.mainPhotoUrl + "#t=0.1"}
                    onLoadedMetadata={(e) => {
                      const video = e.target as HTMLVideoElement;
                      video.currentTime = 0.1;
                      video.pause(); // 強制停止
                    }}
                    onTimeUpdate={(e) => {
                      const video = e.target as HTMLVideoElement;
                      // 0.1秒を超えたら強制的に停止
                      if (video.currentTime > 0.1) {
                        video.currentTime = 0.1;
                        video.pause();
                      }
                    }}
                    onPlay={(e) => {
                      // 再生されそうになったら即座に停止
                      const video = e.target as HTMLVideoElement;
                      video.pause();
                      video.currentTime = 0.1;
                    }}
                    onError={(e) => {
                      // エラー時のフォールバック
                      const video = e.target as HTMLVideoElement;
                      const parent = video.parentElement;
                      if (parent) {
                        parent.innerHTML = `
            <div class="w-full h-full bg-gray-200 flex items-center justify-center">
              <div class="text-center">
                <div class="w-12 h-12 bg-gray-400 rounded-full flex items-center justify-center mx-auto mb-2">
                  <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
                <p class="text-xs text-gray-500">動画</p>
              </div>
            </div>
          `;
                      }
                    }}
                  />

                  {/* 動画アイコンオーバーレイ */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-12 h-12 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
              ) : (
                <img src={album.mainPhotoUrl} alt={album.caption || "Wedding album"} className="w-full h-full object-cover" />
              )}

              {/* 複数枚表示のバッジ */}
              {album.totalPhotos > 1 && (
                <div className="absolute top-2 right-2">
                  <div className="bg-black/70 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center space-x-1">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                    <span className="text-white text-xs font-medium">{album.totalPhotos}</span>
                  </div>
                </div>
              )}

              {/* 自分の投稿の場合の削除済みバッジ */}
              {isOwner(album) && album.isPublic === false && (
                <div className="absolute top-2 right-2 ml-1">
                  <div className="bg-red-600/90 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center space-x-1">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                    <span className="text-white text-xs font-medium">削除済み</span>
                  </div>
                </div>
              )}

              {/* お気に入り件数バッジ */}
              {album.favoriteCount !== undefined && album.favoriteCount > 0 && (
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
      )}
      {/* アルバム詳細表示モーダル（フルスクリーン・スクロール対応） */}
      {selectedAlbum && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 overflow-y-auto">
          {/* メインコンテンツエリア */}
          <div className="max-w-4xl mx-auto">
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

              {/* 右側：公開/非公開ボタン、お気に入りボタン、閉じるボタン */}
              <div className="flex items-center space-x-3">
                {/* 削除/復元切り替えボタン（自分の投稿のみ） */}
                {isOwner(selectedAlbum) && (
                  <button
                    onClick={() => toggleVisibility(selectedAlbum.albumId, selectedAlbum.isPublic !== false)}
                    disabled={visibilityLoading}
                    className={`w-10 h-10 backdrop-blur-sm rounded-full flex items-center justify-center transition-colors ${
                      selectedAlbum.isPublic !== false
                        ? "bg-gray-500/80 hover:bg-gray-600/80 text-white hover:bg-red-600/80"
                        : "bg-blue-500/80 text-white hover:bg-blue-600/80"
                    } ${visibilityLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                    title={selectedAlbum.isPublic !== false ? "削除（他のユーザーに非表示）" : "復元（再表示）"}
                  >
                    {visibilityLoading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : selectedAlbum.isPublic !== false ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                    )}
                  </button>
                )}

                {/* お気に入りボタン */}
                <button
                  onClick={() => toggleFavorite("album", selectedAlbum.albumId)}
                  disabled={favoriteLoading}
                  className={`w-10 h-10 backdrop-blur-sm rounded-full flex items-center justify-center transition-colors ${
                    selectedAlbum.isFavorite ? "bg-red-500/80 text-white hover:bg-red-600/80" : "bg-white/20 text-white hover:bg-white/30"
                  } ${favoriteLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {favoriteLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <svg className="w-5 h-5" fill={selectedAlbum.isFavorite ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                      />
                    </svg>
                  )}
                </button>

                {/* 閉じるボタン */}
                <button
                  onClick={handleCloseModal}
                  className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* メインコンテンツエリア */}
          <div className="max-w-4xl mx-auto">
            {/* 写真表示エリア */}
            <div className="relative px-4 py-2 flex items-center justify-center">
              {/* メイン写真 */}
              <div className="relative max-w-full">
                {selectedAlbum.photos[currentPhotoIndex]?.mediaType === "video" ? (
                  <video
                    src={selectedAlbum.photos[currentPhotoIndex]?.url}
                    className="max-w-full max-h-[80vh] object-contain mx-auto"
                    controls
                    autoPlay
                    muted
                  />
                ) : (
                  <img
                    src={selectedAlbum.photos[currentPhotoIndex]?.url}
                    alt={selectedAlbum.caption || "Wedding photo"}
                    className="max-w-full max-h-[80vh] object-contain mx-auto"
                  />
                )}

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
            </div>

            {/* サムネイル表示（複数枚の場合） */}
            {selectedAlbum.totalPhotos > 1 && (
              <div className="px-4 py-2">
                <div className="max-w-4xl mx-auto">
                  <div className="flex justify-center">
                    <div className="flex space-x-2 overflow-x-auto p-2 max-w-full">
                      {selectedAlbum.photos.map((photo, index) => (
                        <button
                          key={photo.photoId}
                          onClick={() => goToPhoto(index)}
                          className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                            currentPhotoIndex === index ? "border-pink-400 scale-110 shadow-lg" : "border-white/30 hover:border-white/60 hover:scale-105"
                          }`}
                        >
                          {photo.mediaType === "video" ? (
                            <div className="relative w-full h-full">
                              <video
                                src={photo.url}
                                className="w-full h-full object-cover"
                                muted
                                playsInline
                                preload="metadata"
                                poster={photo.url + "#t=0.1"}
                                onLoadedMetadata={(e) => {
                                  const video = e.target as HTMLVideoElement;
                                  video.currentTime = 0.1;
                                }}
                                onError={(e) => {
                                  const video = e.target as HTMLVideoElement;
                                  const parent = video.parentElement;
                                  if (parent) {
                                    parent.innerHTML = `
            <div class="w-full h-full bg-gray-200 flex items-center justify-center rounded-lg">
              <div class="w-4 h-4 bg-black/60 rounded-full flex items-center justify-center">
                <svg class="w-2 h-2 text-white ml-0.1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
            </div>
          `;
                                  }
                                }}
                              />
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-4 h-4 bg-black/60 rounded-full flex items-center justify-center">
                                  <svg className="w-2 h-2 text-white ml-0.1" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                  </svg>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <img src={photo.url} alt={`写真 ${index + 1}`} className="w-full h-full object-cover" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* キャプション表示（写真の下） */}
            {selectedAlbum.caption && (
              <div className="px-4 py-4">
                <div className="bg-gradient-to-r from-pink-500/90 to-rose-500/90 backdrop-blur-sm rounded-2xl px-2 py-4 shadow-lg max-w-2xl mx-auto">
                  <p className="text-white text-sm font-medium text-center leading-relaxed whitespace-pre-wrap">{selectedAlbum.caption}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* 確認ダイアログ */}
      <ConfirmDialog isOpen={showConfirmDialog} onConfirm={handleConfirmClose} onCancel={handleCancelClose} />
    </>
  );
}
