// Development entry point (`pnpm dev`). Setting NODE_ENV here instead of in the
// package.json script keeps the command working on Windows, macOS and Linux.
process.env.NODE_ENV = "development";
await import("./index");

export {};
