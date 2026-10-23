"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoryEnum = exports.postSearchFields = exports.GROUP_PIN_LIMIT = exports.COMMENT_HIGHLIGHT_MODES = exports.COMMENT_SORT_MODES = exports.MEDIA_LAYOUT = exports.MEDIA_LAYOUT_LIST = exports.POST_STATUS = void 0;
exports.POST_STATUS = {
    FREE: "FREE",
    PREMIUM: "PREMIUM",
};
/**
 * The five automatic multi-image grid layouts. `AUTO` lets the renderer pick
 * the layout from the image count (the safe default for existing posts).
 * Authors may persist one of the concrete layouts when the image count makes
 * it compatible; readers fall back to AUTO for invalid combinations.
 */
exports.MEDIA_LAYOUT_LIST = [
    "AUTO",
    "SINGLE",
    "SPLIT",
    "FEATURE",
    "GRID",
    "MOSAIC",
];
exports.MEDIA_LAYOUT = {
    AUTO: "AUTO",
    SINGLE: "SINGLE",
    SPLIT: "SPLIT",
    FEATURE: "FEATURE",
    GRID: "GRID",
    MOSAIC: "MOSAIC",
};
exports.COMMENT_SORT_MODES = ["TOP", "NEWEST", "OLDEST"];
exports.COMMENT_HIGHLIGHT_MODES = ["AUTO", "MANUAL"];
/** Max posts a single community group may pin simultaneously. */
exports.GROUP_PIN_LIMIT = 3;
exports.postSearchFields = ["title", "description", "category"];
exports.CategoryEnum = [
    "Adventure",
    "Exploration",
    "Business Travel",
    "Other",
    "Culture",
    "Wildlife",
    "Beaches",
    "Mountaineering",
    "Sports",
    "Road Trip",
    "City Tours",
    "Photography",
];
