import { Post } from "../module/Post/post.model";
import { Short } from "../module/Short/short.model";
import { Group } from "../module/Group/group.model";
import { GroupMembership } from "../module/Group/groupMembership.model";

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
};
