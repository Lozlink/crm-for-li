interface TaskManagerTaskBody {
  data: Record<string, unknown>;
  error: Error | null;
}

export function defineTask(
  _name: string,
  _callback: (body: TaskManagerTaskBody) => void | Promise<void>,
) {
  // no-op on web
}

export async function isTaskRegisteredAsync(_name: string) {
  return false;
}

export default { defineTask, isTaskRegisteredAsync };
