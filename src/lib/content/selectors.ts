import type { PublishableContent } from "./model";

export function isPubliclyVisible(item: Pick<PublishableContent, "status" | "visibility"> & { deletedAt?: string | null }): boolean {
  return item.status === "published" && item.visibility === "public" && !item.deletedAt;
}

export function getPublishedPublicItems<T extends PublishableContent>(items: readonly T[]): T[] {
  return items.filter(isPubliclyVisible);
}
