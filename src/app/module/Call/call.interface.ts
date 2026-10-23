import { Document, Types } from "mongoose";

export const CALL_STATUS = {
  RINGING: "RINGING",
  ACTIVE: "ACTIVE",
  ENDED: "ENDED",
  REJECTED: "REJECTED",
  MISSED: "MISSED",
  CANCELLED: "CANCELLED",
} as const;

export type TCallStatus = (typeof CALL_STATUS)[keyof typeof CALL_STATUS];

export const CALL_STATUS_VALUES = Object.values(CALL_STATUS) as [
  TCallStatus,
  ...TCallStatus[],
];

export const CALL_MEDIA_TYPE = {
  AUDIO: "AUDIO",
  VIDEO: "VIDEO",
} as const;

export type TCallMediaType = (typeof CALL_MEDIA_TYPE)[keyof typeof CALL_MEDIA_TYPE];

export const CALL_MEDIA_TYPE_VALUES = Object.values(CALL_MEDIA_TYPE) as [
  TCallMediaType,
  ...TCallMediaType[],
];

/**
 * Mesh WebRTC practical ceiling: each participant relays media to every other
 * participant, so 8 is the safe upper bound before quality collapses.
 */
export const GROUP_CALL_MAX_PARTICIPANTS = 8;

export interface ICall extends Document {
  chat: Types.ObjectId;
  caller: Types.ObjectId;
  /** DM only: the invited user. Always null for group calls. */
  callee: Types.ObjectId | null;
  /** True when the call lives in a group chat (caller + participants model). */
  isGroupCall: boolean;
  /** Everyone currently in the call (the starter is included from invite). */
  participants: Types.ObjectId[];
  mediaType: TCallMediaType;
  status: TCallStatus;
  startedAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
  durationSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}
