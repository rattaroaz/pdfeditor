import { MenuDropdown } from "@/components/layout/MenuDropdown";
import { MENU_BAR_ORDER } from "@/lib/menuBarOrder";

export function MenuBar() {
  return (
    <nav
      className="flex items-center gap-1 border-b border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
      aria-label="Application menu"
    >
      {MENU_BAR_ORDER.map((menuId) => (
        <MenuDropdown key={menuId} menuId={menuId} />
      ))}
    </nav>
  );
}
