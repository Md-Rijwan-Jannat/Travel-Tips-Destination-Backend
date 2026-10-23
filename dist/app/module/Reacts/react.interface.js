"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REACT_STORE_TYPES = exports.REACTION_TYPES = void 0;
/**
 * The seven product reaction types. `dislike` is retained in the persistence
 * enum for documents written by the legacy like/dislike endpoints, but it is
 * not part of the modern reaction set exposed by the summary/set APIs.
 */
exports.REACTION_TYPES = [
    "like",
    "love",
    "care",
    "haha",
    "wow",
    "sad",
    "angry",
];
/** All types accepted at the storage layer (includes legacy `dislike`). */
exports.REACT_STORE_TYPES = [...exports.REACTION_TYPES, "dislike"];
