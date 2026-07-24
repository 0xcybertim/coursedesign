export interface NavigationItem {
  readonly href: string;
  readonly label: string;
  readonly match: "exact" | "prefix";
}

export const PRIMARY_NAVIGATION: readonly NavigationItem[] = [
  { href: "/", label: "Home", match: "exact" },
  { href: "/designs", label: "Designs", match: "prefix" },
  { href: "/courses", label: "Courses", match: "prefix" },
];

export function isNavigationItemActive(pathname: string, item: NavigationItem) {
  return item.match === "exact"
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function routeLabel(pathname: string) {
  if (pathname === "/") return "Home";
  if (pathname === "/designs") return "Designs";
  if (pathname === "/designs/new") return "Customize a jump";
  if (pathname.includes("/review")) return "Course Review";
  if (pathname.startsWith("/courses")) return "Courses";
  if (pathname.startsWith("/lab")) return "Developer Lab";
  return "Course Design";
}
