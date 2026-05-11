import { Outlet, Link, createRootRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

function NotFoundComponent() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "72px", fontWeight: "bold" }}>404</h1>
        <h2 style={{ fontSize: "20px", marginTop: "16px" }}>Page not found</h2>
        <div style={{ marginTop: "24px" }}>
          <Link to="/" style={{ padding: "8px 16px", background: "#166534", color: "white", borderRadius: "6px", textDecoration: "none" }}>
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
