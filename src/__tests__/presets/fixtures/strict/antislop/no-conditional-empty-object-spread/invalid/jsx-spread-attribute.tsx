export function Label({ title }: { readonly title?: string }) {
  return <span {...(title === undefined ? {} : { title })}>label</span>
}
