export interface TUpdateUser {
  name: string;
  email: string;
  image?: string;
  coverImage?: string | null;
  bio?: string;
  flower: number;
  flowing: number;
  country?: string;
  address?: string;
}
