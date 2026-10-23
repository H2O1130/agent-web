/** 画像与方案都是可序列化的普通对象，深拷贝用于保留快照。 */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
