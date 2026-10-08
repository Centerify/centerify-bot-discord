export interface ServiceToken<T> {
  readonly key: symbol;
  readonly name: string;
  readonly type?: (value: T) => T;
}

export function serviceToken<T>(name: string): ServiceToken<T> {
  return { key: Symbol(name), name };
}

export class ServiceContainer {
  private readonly values = new Map<symbol, unknown>();

  provide<T>(token: ServiceToken<T>, value: NoInfer<T>) {
    if (this.values.has(token.key)) throw new Error(`Duplicate service: ${token.name}`);
    this.values.set(token.key, value);
  }

  has<T>(token: ServiceToken<T>) { return this.values.has(token.key); }

  resolve<T>(token: ServiceToken<T>): T {
    if (!this.values.has(token.key)) throw new Error(`Service is not registered: ${token.name}`);
    return this.values.get(token.key) as T;
  }

  clear() { this.values.clear(); }
}
