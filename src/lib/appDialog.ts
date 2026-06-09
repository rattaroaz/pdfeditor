import { confirm, message } from "@tauri-apps/plugin-dialog";
import { APP_NAME } from "@/lib/constants";

type DialogKind = "info" | "warning" | "error";

export async function showAlert(
  text: string,
  kind: DialogKind = "info",
): Promise<void> {
  await message(text, { title: APP_NAME, kind });
}

export async function showConfirm(
  text: string,
  kind: DialogKind = "warning",
): Promise<boolean> {
  return confirm(text, { title: APP_NAME, kind });
}
