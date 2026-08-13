/**
 * Runs once when a server instance boots, before it accepts any request.
 * Importing the env module here is what makes a missing key a startup failure
 * instead of a runtime surprise.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { publicEnv, serverEnv } = await import("./env");

  serverEnv();
  publicEnv();
}
