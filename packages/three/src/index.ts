/**
 * Framework-free data and helpers for the 3D scenes. Safe to import from
 * server components: nothing here loads three.js. The scene itself is a
 * separate entry point (`@atomes/three/ion-field`), loaded lazily in the browser.
 */
export * from "./colors";
export * from "./ion-field/formations";
export * from "./ion-field/layout";
export * from "./ion-field/quality";
