import { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, createRouter } from "@tanstack/react-router"
import { Route as UserRouteImport } from "../valid/module-options"
import { Route as UserByIdRouteImport } from "../valid/options-factory"

// The route tree and the router that the TanStack Router plugin and a target project write. They
// give the routes of the fixtures their path, context, and parameter types.
export const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()()

const UserRoute = UserRouteImport.update({
  getParentRoute: () => rootRoute,
  id: "/user",
  path: "/user",
} as any)

const UserByIdRoute = UserByIdRouteImport.update({
  getParentRoute: () => rootRoute,
  id: "/users/$id",
  path: "/users/$id",
} as any)

const routeTree = rootRoute.addChildren({ UserByIdRoute, UserRoute })

export const router = createRouter({ context: { queryClient: new QueryClient() }, routeTree })

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/user": {
      fullPath: "/user"
      id: "/user"
      parentRoute: typeof rootRoute
      path: "/user"
      preLoaderRoute: typeof UserRouteImport
    }
    "/users/$id": {
      fullPath: "/users/$id"
      id: "/users/$id"
      parentRoute: typeof rootRoute
      path: "/users/$id"
      preLoaderRoute: typeof UserByIdRouteImport
    }
  }

  interface Register {
    router: typeof router
  }
}
