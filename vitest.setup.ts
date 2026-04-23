// Vitest setup: shim indexedDB globally so Dexie-backed code has
// something to talk to under the jsdom environment. fake-indexeddb
// installs itself when imported.
import "fake-indexeddb/auto";
