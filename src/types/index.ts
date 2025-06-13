export interface Photo {
  id: string;
  url: string;
  uploadedBy: string;
  uploadedAt: string;
  caption?: string;
  key: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
}
