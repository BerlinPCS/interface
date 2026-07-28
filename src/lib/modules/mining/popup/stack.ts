export const MAX_NESTED_POPUP_DEPTH = 3

export function closeNestedChildren<T> (children: T[], popupIndex: number): T[] {
  return children.slice(0, Math.max(0, popupIndex))
}

export function dismissNestedPopup<T> (children: T[], popupIndex: number): T[] {
  return children.slice(0, Math.max(0, popupIndex - 1))
}

export function appendNestedPopup<T> (children: T[], parentPopupIndex: number, child: T): T[] {
  const retained = closeNestedChildren(children, parentPopupIndex)
  return retained.length >= MAX_NESTED_POPUP_DEPTH ? retained : [...retained, child]
}
