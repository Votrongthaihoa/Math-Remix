export const PRODUCT_NAVIGATION_EVENT = "remix:before-product-navigation";

export type ProductNavigationDetail = {
  path: string;
  source: "link" | "popstate";
};

export function requestProductNavigation(path: string, source: ProductNavigationDetail["source"] = "link") {
  if (typeof window === "undefined") return true;
  return window.dispatchEvent(new CustomEvent<ProductNavigationDetail>(PRODUCT_NAVIGATION_EVENT, {
    cancelable: true,
    detail: { path, source },
  }));
}

export function listenForProductNavigation(handler: (event: CustomEvent<ProductNavigationDetail>) => void) {
  const listener = (event: Event) => handler(event as CustomEvent<ProductNavigationDetail>);
  window.addEventListener(PRODUCT_NAVIGATION_EVENT, listener);
  return () => window.removeEventListener(PRODUCT_NAVIGATION_EVENT, listener);
}
