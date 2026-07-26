/**
 * Harmless stand-ins for native modules (expo-sqlite / expo-secure-store /
 * async-storage). The O1 test lane only exercises PURE logic; these modules are
 * pulled in transitively when a service file is imported (e.g. hevyImport imports
 * `@/db`, coachNote imports `@/lib/keys`). Aliasing them to this Proxy lets those
 * imports RESOLVE under Node without loading real native code. Any actual call
 * into a native API throws loudly — a test that needs DB/store behaviour must
 * `vi.mock` the specific function instead of relying on this stub.
 */
const nativeStub: unknown = new Proxy(
  {},
  {
    get(_t, prop) {
      // Support both `import * as X` and `import X from` shapes.
      if (prop === 'default') return nativeStub;
      if (prop === '__esModule') return true;
      return () => {
        throw new Error(
          `Native module accessed in a unit test (prop "${String(prop)}"). ` +
            `Mock the calling function with vi.mock instead.`,
        );
      };
    },
  },
);

export default nativeStub;
