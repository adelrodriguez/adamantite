export function Button(props: { readonly shape: string }) {
  return <button type="button">{props.shape}</button>
}

function Shape() {
  return <canvas />
}

export const Konva = { Shape }
