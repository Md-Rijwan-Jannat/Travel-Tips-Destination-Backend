"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LIVE_LOCATION_DURATION_MS = exports.MESSAGE_TYPE_VALUES = exports.MESSAGE_TYPE = void 0;
/** Rich message types. Legacy documents have no `messageType` and read as TEXT. */
exports.MESSAGE_TYPE = {
    TEXT: "TEXT",
    IMAGE: "IMAGE",
    VOICE: "VOICE",
    LOCATION: "LOCATION",
    EMOJI: "EMOJI",
    VIEW_ONCE_IMAGE: "VIEW_ONCE_IMAGE",
    LIVE_LOCATION: "LIVE_LOCATION",
};
exports.MESSAGE_TYPE_VALUES = Object.values(exports.MESSAGE_TYPE);
/** How long a LIVE_LOCATION share stays live (server-set at creation). */
exports.LIVE_LOCATION_DURATION_MS = 15 * 60000;
