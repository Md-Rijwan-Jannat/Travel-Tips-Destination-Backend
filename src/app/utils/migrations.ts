import { Post } from "../module/Post/post.model";
import { Short } from "../module/Short/short.model";
import { Group } from "../module/Group/group.model";
import { GroupMembership } from "../module/Group/groupMembership.model";
import { Message } from "../module/Messages/message.model";

/**
 * Idempotent, backward-compatible backfills for the community upgrade.
 * Existing production documents keep working because every read path also
 * tolerates missing fields — these migrations only normalize the data.
 * No destructive operations.
 */
export const runCommunityMigrations = async (): Promise<void> => {
  // 1) Classic posts predate the moderation lifecycle → treat as approved.
  await Post.updateMany(
    { moderationStatus: { $exists: false } },
    { $set: { moderationStatus: "APPROVED" } },
  );

  // 2) Classic posts are not group posts.
  await Post.updateMany(
    { group: { $exists: false } },
    { $set: { group: null, groupVisibility: null } },
  );

  // 3) Group media counters may drift from membership rows (idempotent
  //    recount; safe on every boot).
  const groups = await Group.find({ isDeleted: false }).select("_id").lean();
  for (const g of groups) {
    const [members, pending] = await Promise.all([
      GroupMembership.countDocuments({ group: g._id, status: "APPROVED" }),
      GroupMembership.countDocuments({ group: g._id, status: "PENDING" }),
    ]);
    await Group.updateOne(
      { _id: g._id },
      { $set: { memberCount: members, pendingCount: pending } },
    );
  }

  // 4) Shorts uploaded before the status pipeline existed are considered
  //    published (their media already passed creation-time validation).
  await Short.updateMany(
    { status: { $exists: false } },
    { $set: { status: "PUBLISHED" } },
  );

  // 5) Social-feed upgrade: normalize new post fields for pre-existing
  //    documents (reads tolerate missing fields too — this just makes the
  //    data explicit). Idempotent and non-destructive.
  await Post.updateMany(
    { mediaLayout: { $exists: false } },
    { $set: { mediaLayout: "AUTO" } },
  );
  await Post.updateMany(
    { pinned: { $exists: false } },
    { $set: { pinned: false, pinnedAt: null } },
  );
  await Post.updateMany(
    { featured: { $exists: false } },
    { $set: { featured: false, featuredAt: null } },
  );
  await Post.updateMany(
    { groupPinnedAt: { $exists: false } },
    { $set: { groupPinnedAt: null } },
  );
  await Post.updateMany(
    { isEdited: { $exists: false } },
    { $set: { isEdited: false, editedAt: null } },
  );
  await Post.updateMany(
    { "commentSettings.sortMode": { $exists: false } },
    {
      $set: {
        "commentSettings.sortMode": "TOP",
        "commentSettings.highlightMode": "AUTO",
        "commentSettings.highlightedComment": null,
      },
    },
  );

  // 6) Rich-message upgrade: pre-existing messages are plain text and carry
  //    no edit/delete/view-once state. Idempotent, non-destructive.
  await Message.updateMany(
    { messageType: { $exists: false } },
    {
      $set: {
        messageType: "TEXT",
        isEdited: false,
        editedAt: null,
        isDeleted: false,
        deletedAt: null,
        viewOnceConsumedAt: null,
        viewOnceConsumedBy: null,
      },
    },
  );
};
