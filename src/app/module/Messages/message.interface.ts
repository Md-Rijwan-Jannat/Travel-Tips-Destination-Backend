import { Document, Types } from "mongoose";
import { TReactionType } from "../Reacts/react.interface";

/** Rich message types. Legacy documents have no `messageType` and read as TEXT. */
export const MESSAGE_TYPE = {
  TEXT: "TEXT",
  IMAGE: "IMAGE",
  VOICE: "VOICE",
  LOCATION: "LOCATION",
  EMOJI: "EMOJI",
  VIEW_ONCE_IMAGE: "VIEW_ONCE_IMAGE",
  LIVE_LOCATION: "LIVE_LOCATION",
} as const;

export type TMessageType = (typeof MESSAGE_TYPE)[keyof typeof MESSAGE_TYPE];

export const MESSAGE_TYPE_VALUES = Object.values(MESSAGE_TYPE) as [
  TMessageType,
  ...TMessageType[],
];

/** How long a LIVE_LOCATION share stays live (server-set at creation). */
export const LIVE_LOCATION_DURATION_MS = 15 * 60_000;

export interface IMessageMediaMeta {
  durationSeconds?: number;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
}

export interface IMessageLocation {
  lat: number;
  lng: number;
  label?: string;
}

/** LIVE_LOCATION session metadata (server-set; never client-trusted). */
export interface IMessageLiveLocation {
  /** Server-calculated end of the sharing window (15 minutes from creation). */
  expiresAt: Date;
}

/** Read-safe projection of a message that another message replies to. */
export interface IMessageReplyPreview {
  _id: string;
  sender: { _id: string; name: string; image?: string | null };
  content: string;
  messageType: TMessageType;
  isDeleted: boolean;
}

/** One user's emoji reaction on a message (types mirror post reactions). */
export interface IMessageReaction {
  user: Types.ObjectId;
  type: TReactionType;
}

/** Read-safe reaction projection computed per viewer (`myReaction`). */
export interface TMessageReactionSummary {
  counts: Partial<Record<TReactionType, number>>;
  total: number;
  myReaction: TReactionType | null;
}

/** Payload for the `message reacted` realtime event (per-member summary). */
export interface TMessageReactionUpdate {
  _id: string;
  chat: string;
  reactions: TMessageReactionSummary;
}

export interface IMessage extends Document {
  sender: Types.ObjectId;
  content: string;
  chat: Types.ObjectId;
  readBy: Types.ObjectId[];
  messageType: TMessageType;
  mediaUrl?: string | null;
  mediaMeta?: IMessageMediaMeta | null;
  location?: IMessageLocation | null;
  /** LIVE_LOCATION only: sharing window. Null/absent for every other type. */
  liveLocation?: IMessageLiveLocation | null;
  /** Message being replied to (flattened thread; null on normal messages). */
  replyTo?: Types.ObjectId | null;
  /** Denormalized emoji reactions — one entry per reacting user. */
  reactions: IMessageReaction[];
  isEdited: boolean;
  editedAt: Date | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  /** Set the first time an authorized recipient opens a VIEW_ONCE image. */
  viewOnceConsumedAt: Date | null;
  viewOnceConsumedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Client-safe message shape: view-once media URLs are stripped and replaced
 * with an `opened` flag so the permanent URL never appears in history, and
 * `replyTo` is reduced to a small preview (never a full nested message).
 */
export type TPublicMessage = Omit<
  IMessage,
  | "mediaUrl"
  | "mediaMeta"
  | "viewOnceConsumedAt"
  | "viewOnceConsumedBy"
  | "replyTo"
  | "reactions"
> & {
  mediaUrl: string | null;
  mediaMeta: IMessageMediaMeta | null;
  viewOnceOpened?: boolean;
  replyTo: IMessageReplyPreview | null;
  /** Summary (never the raw user list) so each viewer sees their own state. */
  reactions: TMessageReactionSummary;
};
