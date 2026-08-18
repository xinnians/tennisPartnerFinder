const APP_MODULE_BASE_URL = "/src/";

export function installAppModuleImporter(page) {
  return page.addInitScript((baseUrl) => {
    globalThis.__importAppModule = (name) => import(`${baseUrl}${name}.js`);
  }, APP_MODULE_BASE_URL);
}

export function installAppTestHooks(page, hooks) {
  return page.addInitScript((nextHooks) => {
    globalThis.__tennisE2ETestHooks = { ...(globalThis.__tennisE2ETestHooks ?? {}), ...nextHooks };
  }, hooks);
}

export function readAppTestHook(page, path) {
  return page.evaluate((keys) => keys.reduce((value, key) => value?.[key], globalThis.__tennisE2ETestHooks), path);
}
