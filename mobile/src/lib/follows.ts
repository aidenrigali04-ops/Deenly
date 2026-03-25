import { apiRequest } from "./api";

export type FollowMutationResponse = {
  created: boolean;
  deleted: boolean;
  isFollowing: boolean;
  targetCounts: {
    followers: number;
    following: number;
  };
  actorCounts: {
    followers: number;
    following: number;
  };
};

export async function followUser(userId: number) {
  return apiRequest<FollowMutationResponse>(`/follows/${userId}`, {
    method: "POST",
    auth: true
  });
}

export async function unfollowUser(userId: number) {
  return apiRequest<FollowMutationResponse>(`/follows/${userId}`, {
    method: "DELETE",
    auth: true
  });
}
