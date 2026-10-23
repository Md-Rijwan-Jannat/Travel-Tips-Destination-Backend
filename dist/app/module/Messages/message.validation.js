"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageValidation = void 0;
const zod_1 = require("zod");
const mongoose_1 = require("mongoose");
const message_interface_1 = require("./message.interface");
const react_interface_1 = require("../Reacts/react.interface");
const objectId = zod_1.z
    .string()
    .refine((value) => mongoose_1.Types.ObjectId.isValid(value), "Invalid id");
const httpsMediaUrl = zod_1.z
    .string()
    .max(2000)
    .url()
    .startsWith("https://", "Media URLs must be https");
const mediaMetaSchema = zod_1.z
    .object({
    durationSeconds: zod_1.z.number().min(1).max(600).optional(),
    width: zod_1.z.number().min(1).max(20000).optional(),
    height: zod_1.z.number().min(1).max(20000).optional(),
    thumbnailUrl: httpsMediaUrl.optional(),
})
    .optional();
const locationSchema = zod_1.z.object({
    lat: zod_1.z.number().min(-90).max(90),
    lng: zod_1.z.number().min(-180).max(180),
    label: zod_1.z.string().max(200).optional(),
});
// Per-type content rules are enforced in the service (media/emoji/caption
// combinations); this schema whitelists and bounds every accepted field.
const createMessageValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        chat: objectId,
        messageType: zod_1.z.enum(message_interface_1.MESSAGE_TYPE_VALUES).optional(),
        content: zod_1.z.string().max(5000).optional(),
        mediaUrl: httpsMediaUrl.optional(),
        mediaMeta: mediaMetaSchema,
        location: locationSchema.optional(),
        replyTo: objectId.optional(),
    }),
});
// "At least one updatable field" is enforced in the service so this stays a
// plain object schema (validateRequest accepts ZodObject only).
const editMessageValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        content: zod_1.z.string().max(5000).optional(),
        location: locationSchema.optional(),
    }),
});
// Body for POST /messages/:id/react — mirrors the post reaction contract.
const reactToMessageValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        type: zod_1.z.enum(react_interface_1.REACTION_TYPES, {
            errorMap: () => ({
                message: `Reaction type must be one of: ${react_interface_1.REACTION_TYPES.join(", ")}`,
            }),
        }),
    }),
});
exports.MessageValidation = {
    createMessageValidationSchema,
    editMessageValidationSchema,
    reactToMessageValidationSchema,
};
