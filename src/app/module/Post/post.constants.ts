export const POST_STATUS = {
  FREE: "FREE",
  PREMIUM: "PREMIUM",
} as const;

/**
 * The five automatic multi-image grid layouts. `AUTO` lets the renderer pick
 * the layout from the image count (the safe default for existing posts).
 * Authors may persist one of the concrete layouts when the image count makes
 * it compatible; readers fall back to AUTO for invalid combinations.
 */
export const MEDIA_LAYOUT_LIST = [
  "AUTO",
  "SINGLE",
  "SPLIT",
  "FEATURE",
  "GRID",
  "MOSAIC",
] as const;

export type TMediaLayout = (typeof MEDIA_LAYOUT_LIST)[number];

export const MEDIA_LAYOUT: Record<TMediaLayout, TMediaLayout> = {
  AUTO: "AUTO",
  SINGLE: "SINGLE",
  SPLIT: "SPLIT",
  FEATURE: "FEATURE",
  GRID: "GRID",
  MOSAIC: "MOSAIC",
};

export const COMMENT_SORT_MODES = ["TOP", "NEWEST", "OLDEST"] as const;
export type TCommentSortMode = (typeof COMMENT_SORT_MODES)[number];

export const COMMENT_HIGHLIGHT_MODES = ["AUTO", "MANUAL"] as const;
export type TCommentHighlightMode =
  (typeof COMMENT_HIGHLIGHT_MODES)[number];

/** Max posts a single community group may pin simultaneously. */
export const GROUP_PIN_LIMIT = 3;

export const postSearchFields = ["title", "description", "category"];

export const CategoryEnum = [
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
