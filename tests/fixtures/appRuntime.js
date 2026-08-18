const APP_MODULE_BASE_URL = "/src/";
const APP_MODULE_EXTENSIONS = Object.freeze({ districts: ".ts" });

export function installAppModuleImporter(page) {
  return page.addInitScript(
    ({ baseUrl, extensions }) => {
      globalThis.__importAppModule = (name) => import(`${baseUrl}${name}${extensions[name] ?? ".js"}`);
    },
    { baseUrl: APP_MODULE_BASE_URL, extensions: APP_MODULE_EXTENSIONS }
  );
}

export function installAppTestHooks(page, hooks) {
  return page.addInitScript((nextHooks) => {
    globalThis.__tennisE2ETestHooks = { ...(globalThis.__tennisE2ETestHooks ?? {}), ...nextHooks };
  }, hooks);
}

export function readAppTestHook(page, path) {
  return page.evaluate((keys) => keys.reduce((value, key) => value?.[key], globalThis.__tennisE2ETestHooks), path);
}
