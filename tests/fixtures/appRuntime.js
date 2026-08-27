const APP_MODULE_BASE_URL = "/src/";
const APP_MODULE_EXTENSIONS = Object.freeze({
  districts: ".ts",
  filters: ".ts",
  map: ".ts",
  pins: ".ts",
  sheets: ".ts",
});

export function installAppModuleImporter(page) {
  return page.addInitScript(
    ({ baseUrl, extensions }) => {
      let resolveImporter;
      const importerReady = new Promise((resolve) => {
        resolveImporter = resolve;
      });

      globalThis.__importAppModule = async (name) => (await importerReady)(name);
      globalThis.__resolveAppModuleImporter = resolveImporter;

      const script = document.createElement("script");
      script.type = "module";
      script.dataset.appModuleImporter = "true";
      script.textContent = `
        const config = ${JSON.stringify({ baseUrl, extensions })};
        globalThis.__resolveAppModuleImporter((name) =>
          import(config.baseUrl + name + (config.extensions[name] ?? ".js"))
        );
        delete globalThis.__resolveAppModuleImporter;
      `;

      const mount = () => {
        const parent = document.head ?? document.documentElement;
        if (parent) parent.append(script);
        else document.addEventListener("readystatechange", mount, { once: true });
      };
      mount();
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
