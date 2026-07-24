export function closeNestedChildren<T> (children: T[], popupIndex: number): T[] {
  return children.slice(0, Math.max(0, popupIndex))
}

export function dismissNestedPopup<T> (children: T[], popupIndex: number): T[] {
  return children.slice(0, Math.max(0, popupIndex - 1))
}

export function appendNestedPopup<T> (children: T[], parentPopupIndex: number, child: T): T[] {
  return [...closeNestedChildren(children, parentPopupIndex), child]
}
