'use client'

import { useState } from 'react'
import { Amplify } from 'aws-amplify'
import { uploadData } from 'aws-amplify/storage'
import { getCurrentUser } from 'aws-amplify/auth'
import { v4 as uuidv4 } from 'uuid'
import awsconfig from '../aws-exports'

// Amplifyの設定
Amplify.configure(awsconfig)

interface PhotoUploadProps {
  onUploadSuccess: () => void
}

export default function PhotoUpload({ onUploadSuccess }: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file)
    } else {
      alert('画像ファイルを選択してください')
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setUploading(true)
    try {
      const user = await getCurrentUser()
      const fileKey = `photos/${uuidv4()}-${selectedFile.name}`
      
      const result = await uploadData({
        key: fileKey,
        data: selectedFile,
        options: {
          metadata: {
            uploadedBy: user.username,
            caption: caption,
            uploadedAt: new Date().toISOString()
          }
        }
      }).result

      console.log('Upload successful:', result)
      
      // Reset form
      setSelectedFile(null)
      setCaption('')
      const fileInput = document.getElementById('file-input') as HTMLInputElement
      if (fileInput) fileInput.value = ''
      
      onUploadSuccess()
      alert('写真をアップロードしました！')
    } catch (error) {
      console.error('Upload error:', error)
      alert('アップロードに失敗しました')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">写真をアップロード</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            写真を選択
          </label>
          <input
            id="file-input"
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            コメント（任意）
          </label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="この写真について..."
          />
        </div>

        {selectedFile && (
          <div className="mt-4">
            <p className="text-sm text-gray-600">選択されたファイル: {selectedFile.name}</p>
            <img
              src={URL.createObjectURL(selectedFile)}
              alt="Preview"
              className="mt-2 max-w-full h-32 object-cover rounded"
            />
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!selectedFile || uploading}
          className={`w-full py-2 px-4 rounded-md font-medium ${
            !selectedFile || uploading
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-500 hover:bg-blue-700 text-white'
          }`}
        >
          {uploading ? 'アップロード中...' : 'アップロード'}
        </button>
      </div>
    </div>
  )
}
