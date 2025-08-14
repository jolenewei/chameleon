export function sendMessage<T = any, R = any>(message: T): Promise<R> {
  return new Promise((resolve) =>
    chrome.runtime.sendMessage(message, (resp) => resolve(resp as R))
  );
}