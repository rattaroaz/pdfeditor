/** Browser E2E shim — reports no update by default (Help → Check for updates). */
export async function check(_options?: { allowDowngrades?: boolean }) {
  return null;
}
