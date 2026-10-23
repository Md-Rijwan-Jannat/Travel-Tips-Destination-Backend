"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GROUP_CALL_MAX_PARTICIPANTS = exports.CALL_MEDIA_TYPE_VALUES = exports.CALL_MEDIA_TYPE = exports.CALL_STATUS_VALUES = exports.CALL_STATUS = void 0;
exports.CALL_STATUS = {
    RINGING: "RINGING",
    ACTIVE: "ACTIVE",
    ENDED: "ENDED",
    REJECTED: "REJECTED",
    MISSED: "MISSED",
    CANCELLED: "CANCELLED",
};
exports.CALL_STATUS_VALUES = Object.values(exports.CALL_STATUS);
exports.CALL_MEDIA_TYPE = {
    AUDIO: "AUDIO",
    VIDEO: "VIDEO",
};
exports.CALL_MEDIA_TYPE_VALUES = Object.values(exports.CALL_MEDIA_TYPE);
/**
 * Mesh WebRTC practical ceiling: each participant relays media to every other
 * participant, so 8 is the safe upper bound before quality collapses.
 */
exports.GROUP_CALL_MAX_PARTICIPANTS = 8;
