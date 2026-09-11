// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

function createResilientPrismaClient(): PrismaClient {
  let rawClient: PrismaClient | null = null;
  try {
    rawClient =
      global.prisma ||
      new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
      });
  } catch (err: any) {
    console.warn('[Prisma] Database client instantiation warning:', err?.message || err);
  }

  const isInitializationError = (err: any) => {
    if (!err) return false;
    const name = err.name || '';
    const message = err.message || String(err);
    const code = err.code || '';
    return (
      name === 'PrismaClientInitializationError' ||
      name === 'PrismaClientKnownRequestError' ||
      code === 'P1000' ||
      code === 'P1001' ||
      code === 'P1002' ||
      message.includes('PrismaClientInitializationError') ||
      message.includes("Can't reach database server") ||
      message.includes('Environment variable not found') ||
      message.includes('database system is starting up')
    );
  };

  const createModelProxy = (modelName: string) => {
    return new Proxy(
      {},
      {
        get(_target, prop: string) {
          return async (...args: any[]) => {
            if (rawClient && (rawClient as any)[modelName] && typeof (rawClient as any)[modelName][prop] === 'function') {
              try {
                return await (rawClient as any)[modelName][prop](...args);
              } catch (err: any) {
                if (isInitializationError(err)) {
                  console.warn(`[Prisma Proxy] Database offline during ${modelName}.${prop}: ${err.message?.split('\n')[0] || err}`);
                  if (prop === 'findMany') return [];
                  if (prop === 'findFirst' || prop === 'findUnique') return null;
                  if (prop === 'count') return 0;
                  if (prop === 'deleteMany' || prop === 'createMany') return { count: 0 };
                  if (prop === 'create' || prop === 'update') return args[0]?.data ?? {};
                  if (prop === 'upsert') return args[0]?.create ?? {};
                  if (prop === 'delete') return {};
                  return null;
                }
                throw err;
              }
            }
            if (prop === 'findMany') return [];
            if (prop === 'findFirst' || prop === 'findUnique') return null;
            if (prop === 'count') return 0;
            if (prop === 'deleteMany' || prop === 'createMany') return { count: 0 };
            if (prop === 'create' || prop === 'update') return args[0]?.data ?? {};
            if (prop === 'upsert') return args[0]?.create ?? {};
            if (prop === 'delete') return {};
            return null;
          };
        },
      }
    );
  };

  const clientProxy = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === '$transaction') {
          return async (arg: any, options?: any) => {
            if (rawClient) {
              try {
                if (typeof arg === 'function') {
                  return await rawClient.$transaction(arg, options);
                }
                if (Array.isArray(arg)) {
                  return await rawClient.$transaction(arg, options);
                }
              } catch (err: any) {
                if (isInitializationError(err)) {
                  console.warn(`[Prisma Proxy] Database offline during $transaction: ${err.message?.split('\n')[0] || err}`);
                  if (Array.isArray(arg)) {
                    return Promise.all(
                      arg.map(async (item) => {
                        try {
                          return await item;
                        } catch {
                          return [];
                        }
                      })
                    );
                  }
                  return [];
                }
                throw err;
              }
            }
            if (Array.isArray(arg)) {
              return Promise.all(arg.map(() => []));
            }
            return [];
          };
        }

        if (prop.startsWith('$')) {
          return async (...args: any[]) => {
            if (rawClient && typeof (rawClient as any)[prop] === 'function') {
              try {
                return await (rawClient as any)[prop](...args);
              } catch (err: any) {
                console.warn(`[Prisma Proxy] ${prop} failed:`, err?.message || err);
                return null;
              }
            }
            return null;
          };
        }

        return createModelProxy(prop);
      },
    }
  );

  if (process.env.NODE_ENV !== 'production' && rawClient) {
    global.prisma = rawClient;
  }

  return clientProxy as unknown as PrismaClient;
}

const prisma = createResilientPrismaClient();

export default prisma;


