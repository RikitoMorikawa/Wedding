'use client'

import { useState, useEffect } from 'react'
import { list, getUrl } from 'aws-amplify/storage'
import { Photo } from '@/types'

export default function PhotoGallery() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPhotos()
  }, [])

  const loadPhotos = async () => {
    try {
      const result = await list({
        prefix: 'photos/',
      })

      const photoPromises = result.items.map(async (item) => {
        const url = await getUrl({ key: item.key! })
        
        return {
          id: item.key!,
          key: item.key!,
          url: url.url.toString(),
          uploadedBy: 'Unknown',
          uploadedAt: item.lastModified?.toISOString() || new Date().toISOString(),
          caption: ''
        }
      })

      const loadedPhotos = await Promise.all(photoPromises)
      setPhotos(loadedPhotos.sort((a, b) => 
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      ))
    } catch (error) {
      console.error('Error loading photos:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-bold mb-4">写真ギャラリー</h2>
        <div className="text-center">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">写真ギャラリー ({photos.length}枚)</h2>
      
      {photos.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          まだ写真がありません
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {photos.map((photo) => (
            <div key={photo.id} className="bg-gray-100 rounded-lg overflow-hidden">
              <img
                src={photo.url}
                alt={photo.caption || 'Wedding photo'}
                className="w-full h-48 object-cover"
              />
              <div className="p-3">
                <p className="text-sm text-gray-600">
                  {new Date(photo.uploadedAt).toLocaleDateString('ja-JP')}
                </p>
                {photo.caption && (
                  <p className="text-sm mt-1">{photo.caption}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
