import { Types } from "mongoose";

/**
 * The seven product reaction types. `dislike` is retained in the persistence
 * enum for documents written by the legacy like/dislike endpoints, but it is
 * not part of the modern reaction set exposed by the summary/set APIs.
 */
export const REACTION_TYPES = [
  "like",
  "love",
  "care",
  "haha",
  "wow",
  "sad",
  "angry",
] as const;

export type TReactionType = (typeof REACTION_TYPES)[number];

/** All types accepted at the storage layer (includes legacy `dislike`). */
export const REACT_STORE_TYPES = [...REACTION_TYPES, "dislike"] as const;

export type TReactStoreType = (typeof REACT_STORE_TYPES)[number];

export type TReactTargetType = "post" | "comment" | "short";

export interface TReact {
  user: Types.ObjectId;
  post?: Types.ObjectId;
  comment?: Types.ObjectId;
  short?: Types.ObjectId;
  type: TReactStoreType;
  createdAt: Date;
  updatedAt: Date;
}

export interface TReactionSummary {
  targetType: TReactTargetType;
  targetId: string;
  /** Counts keyed by reaction type (only types with count > 0 are present). */
  counts: Record<string, number>;
  /** Sum of every reaction count (all stored types). */
  total: number;
  /** The requesting user's current reaction, or null. */
  myReaction: TReactStoreType | null;
}
