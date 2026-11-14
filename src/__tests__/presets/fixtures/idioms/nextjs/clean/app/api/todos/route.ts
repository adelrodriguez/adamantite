export async function GET() {
  return Response.json(await Promise.resolve([{ id: "one", text: "Read" }]))
}
