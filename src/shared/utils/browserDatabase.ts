const databaseName = "coinage";
const storeName = "records";

// 每次操作独立连接，版本更新或页面关闭时不保留阻塞连接。
export async function withBrowserRecord<T>(
  key: string,
  mode: IDBTransactionMode,
  action: (value: unknown, store: IDBObjectStore) => T,
  factory?: IDBFactory,
): Promise<T> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const storage = factory ?? globalThis.indexedDB;
    if (!storage) {
      reject(new Error("无法打开浏览器存储，请检查浏览器设置"));
      return;
    }
    const request = storage.open(databaseName, 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      }
    };
    request.onerror = () =>
      reject(new Error("无法打开浏览器存储，请检查浏览器设置"));
    request.onblocked = () => {
      blocked = true;
      reject(new Error("浏览器存储被其他页面占用，请关闭其他页面后重试"));
    };
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      let result: T;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          result = action(request.result, store);
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () =>
        reject(
          failure ?? new Error("浏览器保存失败，可能空间不足，请导出手稿"),
        );
      transaction.onerror = () => {
        // 等待 abort，只有完整事务提交才报告保存成功。
      };
    });
  } finally {
    database.close();
  }
}
