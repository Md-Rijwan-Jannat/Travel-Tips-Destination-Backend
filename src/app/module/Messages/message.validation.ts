import { z } from "zod";
import { Types } from "mongoose";
import { MESSAGE_TYPE_VALUES } from "./message.interface";

const objectId = z
  .string()
  .refine((value) => Types.ObjectId.isValid(value), "Invalid id");

const httpsMediaUrl = z
  .string()
  .max(2000)
  .url()
  .startsWith("https://", "Media URLs must be https");

const mediaMetaSchema = z
  .object({
    durationSeconds: z.number().min(1).max(600).optional(),
    width: z.number().min(1).max(20000).optional(),
    height: z.number().min(1).max(20000).optional(),
    thumbnailUrl: httpsMediaUrl.optional(),
  })
  .optional();

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().max(200).optional(),
});

// Per-type content rules are enforced in the service (media/emoji/caption
// combinations); this schema whitelists and bounds every accepted field.
const createMessageValidationSchema = z.object({
  body: z.object({
    chat: objectId,
    messageType: z.enum(MESSAGE_TYPE_VALUES).optional(),
    content: z.string().max(5000).optional(),
    mediaUrl: httpsMediaUrl.optional(),
    mediaMeta: mediaMetaSchema,
    location: locationSchema.optional(),
    replyTo: objectId.optional(),
  }),
});

// "At least one updatable field" is enforced in the service so this stays a
// plain object schema (validateRequest accepts ZodObject only).
const editMessageValidationSchema = z.object({
  body: z.object({
    content: z.string().max(5000).optional(),
    location: locationSchema.optional(),
  }),
});

export const MessageValidation = {
  createMessageValidationSchema,
  editMessageValidationSchema,
};
