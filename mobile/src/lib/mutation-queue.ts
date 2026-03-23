import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "./api";

const QUEUE_KEY = "deenly_mobile_mutation_queue";

type QueuedMutation = {
  id: string;
  path: string;
  method: "POST" | "PUT" | "DELETE";
  body?: unknown;
  auth?: boolean;
  createdAt: string;
};

async function readQueue() {
  const value = await AsyncStorage.getItem(QUEUE_KEY);
  if (!value) {
    return [] as QueuedMutation[];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as QueuedMutation[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedMutation[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export async function enqueueMutation(mutation: Omit<QueuedMutation, "id" | "createdAt">) {
  const queue = await readQueue();
  queue.push({
    ...mutation,
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString()
  });
  await writeQueue(queue);
}

export async function getQueuedMutationCount() {
  const queue = await readQueue();
  return queue.length;
}

export async function flushQueuedMutations() {
  const queue = await readQueue();
  if (!queue.length) {
    return 0;
  }

  const remaining: QueuedMutation[] = [];
  let flushedCount = 0;

  for (const item of queue) {
    try {
      await apiRequest(item.path, {
        method: item.method,
        auth: item.auth,
        body: item.body,
        retries: 0
      });
      flushedCount += 1;
    } catch {
      remaining.push(item);
    }
  }

  await writeQueue(remaining);
  return flushedCount;
}
