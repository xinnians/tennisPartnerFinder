const namedList = (values) => Object.freeze(values);

export const FRONTEND_ARCHITECTURE_MANIFEST = Object.freeze({
  controllerDomApis: namedList([
    "addEventListener",
    "classList",
    "createElement",
    "getElementById",
    "innerHTML",
    "querySelector",
    "textContent",
  ]),
  cssImportOrder: namedList([
    "./style.css",
    "./map-page.css",
    "./discovery.css",
    "./surfaces.css",
    "./sheet-shells.css",
    "./navigation.css",
    "./pages.css",
    "./session.css",
    "./create-session.css",
    "./responsive.css",
    "./vocabulary.css",
    "./player-sheets.css",
    "./motion.css",
  ]),
  htmlOptionPassThroughs: namedList([
    "src/app/SurfaceHost.tsx::mountSurfaceShell::surface-html::Object.freeze::call:String",
  ]),
  htmlRenderers: namedList([
    "src/app/SurfaceHost.tsx::SurfaceShell::dangerouslySetInnerHTML::property::object",
    "src/sessionViews.js::deferSurfaceOpen::surface-html::mount::call:lazySurfaceHtml",
    "src/sessionViews.js::renderMapDataStatus::innerHTML::root::empty-string",
    "src/sessionViews.js::renderMapDataStatus::innerHTML::root::template",
    "src/sheets.ts::closeSurface::innerHTML::root::empty-string",
    "src/views/sessionSurfaceViews.js::openSessionSheet::surface-html::mountSheet::template",
  ]),
  syncCommitCallers: namedList(["src/app/SurfaceHost.tsx", "src/sessionStore.ts"]),
});
