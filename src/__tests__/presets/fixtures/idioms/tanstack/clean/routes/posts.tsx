import { createFileRoute, createRootRoute } from "@tanstack/react-router"

export const rootRoute = createRootRoute()
export const Route = createFileRoute("/posts/")({ component: PostsIndexComponent })

function PostsIndexComponent() {
  return <div>Select a post.</div>
}

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/posts/": {
      id: "/posts/"
      path: "/posts"
      fullPath: "/posts/"
      parentRoute: typeof rootRoute
      preLoaderRoute: typeof Route
    }
  }
}
